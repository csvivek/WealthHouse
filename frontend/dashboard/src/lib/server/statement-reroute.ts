import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { refreshLinkSuggestionsForImport } from '@/lib/statement-linking'
import { normalizeParsedStatement, type ParsedStatementResult } from '@/lib/statements/helpers'
import {
  computeTxnHash,
  loadAccountCandidates,
  resolvedAccountFromCandidate,
  type AccountCandidate,
  type ResolvedAccount,
} from '@/lib/server/statement-import'
import {
  createAccountWithRelatedRecords,
  findOrCreateInstitution,
  normalizeAccountType,
} from '@/lib/server/accounts'
import { normalizeInstitutionCode } from '@/lib/accounts/normalization'
import type { Database } from '@/types/database'

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>
type FileImportRow = Database['public']['Tables']['file_imports']['Row']

interface RerouteCreateAccountInput {
  institution_name?: string
  institution_code?: string
  product_name?: string
  nickname?: string | null
  identifier_hint?: string | null
  currency?: string | null
  account_type?: string | null
  card_name?: string | null
  card_last4?: string | null
}

export interface StatementRerouteInput {
  targetAccountId?: string
  createAccount?: RerouteCreateAccountInput
}

export interface StatementRerouteResult {
  importId: string
  accountId: string
  accountLabel: string
  accountType: string
  duplicateCount: number
  reviewUrl: string
}

export class StatementRerouteProcessError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'StatementRerouteProcessError'
    this.status = status
  }
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {}
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

function getInstitutionName(account: AccountCandidate) {
  return asArray(account.institutions)[0]?.name ?? null
}

function buildMatchedAccountSummary(account: ResolvedAccount) {
  return {
    accountId: account.id,
    label: account.label,
    matchedBy: 'manual',
    cardId: account.cardId,
    cardName: account.cardName,
    cardLast4: account.cardLast4,
  }
}

async function resolveTargetAccount(params: {
  supabase: ServiceSupabaseClient
  householdId: string
  input: StatementRerouteInput
}) {
  let candidateAccounts = await loadAccountCandidates(params.supabase as never, params.householdId)

  if (params.input.targetAccountId) {
    const existing = candidateAccounts.find((account) => account.id === params.input.targetAccountId)
    if (!existing) {
      throw new StatementRerouteProcessError('Selected account was not found for this household.', 404)
    }

    return {
      candidate: existing,
      resolved: resolvedAccountFromCandidate(existing, 'manual'),
      accountType: normalizeAccountType(existing.account_type, [existing.product_name, existing.nickname]),
      institutionName: getInstitutionName(existing),
    }
  }

  const create = params.input.createAccount
  const institutionName = create?.institution_name?.trim() || ''
  const productName = create?.product_name?.trim() || ''

  if (!institutionName || !productName) {
    throw new StatementRerouteProcessError('Institution and product name are required to create an account.', 422)
  }

  const institution = await findOrCreateInstitution(params.supabase as never, {
    institutionName,
    institutionCode: create?.institution_code || null,
  })

  const createdAccount = await createAccountWithRelatedRecords(params.supabase as never, {
    householdId: params.householdId,
    institutionId: institution.id,
    accountType: normalizeAccountType(create?.account_type, [productName, create?.card_name]),
    productName,
    nickname: create?.nickname || null,
    identifierHint: create?.identifier_hint || null,
    currency: create?.currency || 'SGD',
    cardName: create?.card_name || null,
    cardLast4: create?.card_last4 || null,
  })

  candidateAccounts = await loadAccountCandidates(params.supabase as never, params.householdId)
  const createdCandidate = candidateAccounts.find((account) => account.id === createdAccount.id)
  if (!createdCandidate) {
    throw new StatementRerouteProcessError('Created account was not found after creation.', 500)
  }

  return {
    candidate: createdCandidate,
    resolved: resolvedAccountFromCandidate(createdCandidate, 'manual'),
    accountType: normalizeAccountType(createdCandidate.account_type, [createdCandidate.product_name, createdCandidate.nickname]),
    institutionName: getInstitutionName(createdCandidate),
  }
}

async function loadExistingDuplicates(
  supabase: ServiceSupabaseClient,
  accountId: string,
  txnHashes: string[],
) {
  const { data, error } = await supabase
    .from('statement_transactions')
    .select('id, txn_hash')
    .eq('account_id', accountId)
    .in('txn_hash', Array.from(new Set(txnHashes)))

  if (error) {
    throw new StatementRerouteProcessError(error.message, 500)
  }

  return new Map(
    (data ?? [])
      .filter((row) => row.txn_hash)
      .map((row) => [String(row.txn_hash), String(row.id)]),
  )
}

export async function processStatementReroute(params: {
  importId: string
  householdId: string
  userId: string
  input: StatementRerouteInput
}): Promise<StatementRerouteResult> {
  const supabase = createServiceSupabaseClient()

  const { data: fileImport, error: fileImportError } = await supabase
    .from('file_imports')
    .select('*')
    .eq('id', params.importId)
    .eq('household_id', params.householdId)
    .single()

  if (fileImportError || !fileImport) {
    throw new StatementRerouteProcessError('Import not found.', 404)
  }

  if (fileImport.status !== 'in_review') {
    throw new StatementRerouteProcessError('Only imports in review can be rerouted.', 400)
  }

  const { data: stagingRows, error: stagingRowsError } = await supabase
    .from('import_staging')
    .select('*')
    .eq('file_import_id', params.importId)
    .order('row_index', { ascending: true })

  if (stagingRowsError) {
    throw new StatementRerouteProcessError('Failed to load staged rows for reroute.', 500)
  }

  const { candidate, resolved, accountType, institutionName } = await resolveTargetAccount({
    supabase,
    householdId: params.householdId,
    input: params.input,
  })

  const parsedPayload = normalizeParsedStatement(
    asRecord((fileImport as FileImportRow).raw_parse_result) as ParsedStatementResult,
  )
  const normalizedInstitutionCode = normalizeInstitutionCode(parsedPayload.institution_code, [
    parsedPayload.institution_name,
    institutionName,
  ])

  if (parsedPayload.account) {
    parsedPayload.account = {
      ...parsedPayload.account,
      account_type: accountType,
    }
  }

  parsedPayload.institution_code = normalizedInstitutionCode || parsedPayload.institution_code || null
  parsedPayload.institution_name = institutionName || parsedPayload.institution_name || null
  const matchedAccountSummary = buildMatchedAccountSummary(resolved)
  const nextRawParseResult: Record<string, unknown> = {
    ...(parsedPayload as Record<string, unknown>),
    matched_accounts: [matchedAccountSummary],
    import_label: resolved.label,
  }

  const cardInfo = asRecord((fileImport as FileImportRow).card_info_json)
  const statementAccount = asRecord(cardInfo.statementAccount)
  cardInfo.statementAccount = {
    ...statementAccount,
    account_type: accountType,
  }
  cardInfo.matchedAccounts = [buildMatchedAccountSummary(resolved)]

  const nextRowUpdates = (stagingRows ?? []).map((row) => {
    const originalData = asRecord(row.original_data)
    const txnHash = computeTxnHash(
      resolved.id,
      row.txn_date,
      row.posting_date || undefined,
      Number(row.amount),
      row.currency,
      row.merchant_raw,
      row.reference || undefined,
      String(row.row_index),
    )

    return {
      row,
      txnHash,
      originalData: {
        ...originalData,
        matchedAccountId: resolved.id,
        matchedAccountName: resolved.label,
        matchedCardId: resolved.cardId,
        matchedCardName: resolved.cardName,
        matchedCardLast4: resolved.cardLast4,
        importLabel: resolved.label,
      },
    }
  })

  const existingDuplicates = await loadExistingDuplicates(
    supabase,
    resolved.id,
    nextRowUpdates.map((entry) => entry.txnHash),
  )

  let duplicateCount = 0
  for (const entry of nextRowUpdates) {
    const duplicateTransactionId = existingDuplicates.get(entry.txnHash) ?? null
    const duplicateStatus = duplicateTransactionId ? 'existing_final' : 'none'
    if (duplicateStatus !== 'none') {
      duplicateCount += 1
    }

    const { error } = await supabase
      .from('import_staging')
      .update({
        account_id: resolved.id,
        txn_hash: entry.txnHash,
        source_txn_hash: entry.txnHash,
        duplicate_status: duplicateStatus,
        duplicate_transaction_id: duplicateTransactionId,
        original_data: entry.originalData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entry.row.id)

    if (error) {
      throw new StatementRerouteProcessError(error.message, 500)
    }
  }

  const { error: fileImportUpdateError } = await supabase
    .from('file_imports')
    .update({
      account_id: resolved.id,
      institution_id: candidate.institution_id,
      institution_code: normalizedInstitutionCode || null,
      raw_parse_result: nextRawParseResult,
      card_info_json: {
        ...cardInfo,
        statementAccount: cardInfo.statementAccount,
        matchedAccounts: [matchedAccountSummary],
      },
      duplicate_rows: duplicateCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.importId)

  if (fileImportUpdateError) {
    throw new StatementRerouteProcessError(fileImportUpdateError.message, 500)
  }

  await supabase.from('approval_log').insert({
    household_id: params.householdId,
    file_import_id: params.importId,
    actor_user_id: params.userId,
    action: 'edit',
    new_data: {
      reroutedAccountId: resolved.id,
      reroutedAccountLabel: resolved.label,
      duplicateCount,
    },
  })

  await refreshLinkSuggestionsForImport({
    supabase: supabase as never,
    fileImportId: params.importId,
    householdId: params.householdId,
    actorUserId: params.userId,
  })

  return {
    importId: params.importId,
    accountId: resolved.id,
    accountLabel: resolved.label,
    accountType,
    duplicateCount,
    reviewUrl: `/statements/review/${params.importId}`,
  }
}
