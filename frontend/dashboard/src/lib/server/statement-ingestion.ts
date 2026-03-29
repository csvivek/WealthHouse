/* eslint-disable @typescript-eslint/no-explicit-any */
import { parseStatement } from '@/lib/ai/statement-parser'
import type { ParsedStatementResult } from '@/lib/statements/helpers'
import {
  buildParsedAccountLabel,
  loadAccountCandidates,
  resolvedAccountFromCandidate,
  routeParsedTransactions,
  stageSplitRoutedTransactions,
  type ResolvedAccount,
} from '@/lib/server/statement-import'
import {
  createStatementParseSession,
  getStatementParseSession,
  markStatementParseSessionResolved,
  STATEMENT_PARSE_SESSION_STATUS,
  updateStatementParseSessionResolutionPayload,
  updateStatementParseSessionUnresolved,
} from '@/lib/server/statement-parse-sessions'
import {
  createAccountWithRelatedRecords,
  findOrCreateInstitution,
  type InstitutionBrandDecision,
  normalizeAccountType,
} from '@/lib/server/accounts'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import type { StatementUploadProcessResult } from '@/lib/server/statement-uploads'

interface StoredStatementUpload {
  id: string
  household_id: string
  uploaded_by: string
  selected_account_id: string | null
  file_name: string
  file_sha256: string
  mime_type: string
  file_size_bytes: number
  storage_bucket: string | null
  storage_path: string | null
  status: string
  parse_session_id: string | null
}

interface ParseResolutionRow {
  descriptorKey?: string
  existingAccountId?: string
  createAccount?: {
    institution_name?: string
    institution_code?: string
    product_name?: string
    nickname?: string | null
    identifier_hint?: string | null
    currency?: string | null
    account_type?: string | null
    card_name?: string | null
    card_last4?: string | null
    institution_brand_code?: string | null
    institution_brand_decision?: InstitutionBrandDecision | null
  }
}

function parseJsonArray<T>(value: unknown) {
  return Array.isArray(value) ? value as T[] : []
}

function pickString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function buildRoutingFailureMessage(unmatchedLabels: string[]) {
  const uniqueLabels = Array.from(new Set(unmatchedLabels.filter(Boolean)))
  const preview = uniqueLabels.slice(0, 3).join('; ')
  const moreCount = Math.max(uniqueLabels.length - 3, 0)
  const details = moreCount > 0 ? `${preview}; and ${moreCount} more.` : preview

  return `This statement contains transactions for accounts that could not be matched automatically. ${details} Review or create the missing account(s), then continue without re-uploading.`
}

function buildPausedResult(statementUploadId: string, parseSessionId: string): StatementUploadProcessResult {
  return {
    statementUploadId,
    status: 'needs_account_resolution',
    parseSessionId,
    imports: [],
    importCount: 0,
    transactionsCount: 0,
    duplicateCount: 0,
    reviewUrl: null,
  }
}

async function updateStatementUpload(supabase: any, statementUploadId: string, patch: Record<string, unknown>) {
  const { error } = await supabase
    .from('statement_uploads')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', statementUploadId)

  if (error) {
    throw new Error(error.message || 'Failed to update statement upload')
  }
}

async function loadStatementUploadRow(supabase: any, statementUploadId: string) {
  const { data, error } = await supabase
    .from('statement_uploads')
    .select('*')
    .eq('id', statementUploadId)
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Statement upload not found')
  }

  return data as StoredStatementUpload
}

async function downloadStoredStatement(supabase: any, upload: StoredStatementUpload) {
  if (!upload.storage_bucket || !upload.storage_path) {
    throw new Error('Stored statement file could not be found for this upload')
  }

  const { data, error } = await supabase.storage
    .from(upload.storage_bucket)
    .download(upload.storage_path)

  if (error || !data) {
    throw new Error(error?.message || 'Stored statement file could not be downloaded')
  }

  return Buffer.from(await data.arrayBuffer())
}

async function buildAccountOverrides(params: {
  supabase: any
  householdId: string
  parsed: ParsedStatementResult
  unresolvedDescriptors: Array<Record<string, unknown>>
  resolutionPayload: ParseResolutionRow[]
}) {
  let candidateAccounts = await loadAccountCandidates(params.supabase, params.householdId)
  const accountOverrides = new Map<string, ResolvedAccount>()
  const resolutionByDescriptor = new Map(
    params.resolutionPayload
      .filter((row) => typeof row?.descriptorKey === 'string' && row.descriptorKey)
      .map((row) => [String(row.descriptorKey), row]),
  )

  for (const descriptor of params.unresolvedDescriptors) {
    const descriptorKey = pickString(descriptor.descriptorKey)
    if (!descriptorKey) continue

    const resolution = resolutionByDescriptor.get(descriptorKey)
    if (!resolution) {
      continue
    }

    if (resolution.existingAccountId) {
      const matched = candidateAccounts.find((account) => account.id === resolution.existingAccountId)
      if (matched) {
        accountOverrides.set(descriptorKey, resolvedAccountFromCandidate(matched, 'manual'))
      }
      continue
    }

    if (!resolution.createAccount) {
      continue
    }

    const create = resolution.createAccount
    const institutionName = (create.institution_name || pickString(descriptor.institution_name) || '').trim()
    const productName = (create.product_name || pickString(descriptor.product_name) || pickString(descriptor.card_name) || '').trim()

    if (!institutionName || !productName) {
      continue
    }

    const institution = await findOrCreateInstitution(params.supabase as never, {
      institutionName,
      institutionCode: create.institution_code || pickString(descriptor.institution_code) || null,
      institutionBrandCode: create.institution_brand_code || null,
      institutionBrandDecision: create.institution_brand_decision || null,
    })

    const createdAccount = await createAccountWithRelatedRecords(params.supabase as never, {
      householdId: params.householdId,
      institutionId: institution.id,
      accountType: normalizeAccountType(create.account_type || pickString(descriptor.account_type), [
        productName,
        create.card_name || pickString(descriptor.card_name),
      ]),
      productName,
      nickname: create.nickname || null,
      identifierHint: create.identifier_hint || pickString(descriptor.identifier_hint) || null,
      currency: create.currency || pickString(descriptor.currency) || params.parsed.currency || 'SGD',
      cardName: create.card_name || pickString(descriptor.card_name) || null,
      cardLast4: create.card_last4 || pickString(descriptor.card_last4) || null,
    })

    accountOverrides.set(descriptorKey, {
      id: createdAccount.id,
      institutionId: institution.id,
      label: `${institution.name} — ${createdAccount.nickname ?? createdAccount.product_name}`,
      matchedBy: 'manual',
      cardId: null,
      cardName: create.card_name || pickString(descriptor.card_name) || null,
      cardLast4: create.card_last4 || pickString(descriptor.card_last4) || null,
    })

    candidateAccounts = await loadAccountCandidates(params.supabase, params.householdId)
  }

  return {
    candidateAccounts,
    accountOverrides,
  }
}

async function createOrUpdatePausedParseSession(params: {
  supabase: any
  upload: StoredStatementUpload
  parsed: ParsedStatementResult
  unmatchedAccountDescriptors: Array<Record<string, unknown>>
  suggestedExistingAccounts: Array<Record<string, unknown>>
}) {
  if (params.upload.parse_session_id) {
    await updateStatementParseSessionUnresolved({
      supabase: params.supabase,
      parseSessionId: params.upload.parse_session_id,
      unmatchedAccountDescriptors: params.unmatchedAccountDescriptors,
      suggestedExistingAccounts: params.suggestedExistingAccounts,
    })

    await updateStatementUpload(params.supabase, params.upload.id, {
      status: 'needs_account_resolution',
      parse_session_id: params.upload.parse_session_id,
      result_payload: buildPausedResult(params.upload.id, params.upload.parse_session_id),
      error_code: null,
      error_message: null,
      parse_error: null,
    })

    return params.upload.parse_session_id
  }

  const parseSessionId = await createStatementParseSession({
    supabase: params.supabase,
    statementUploadId: params.upload.id,
    householdId: params.upload.household_id,
    userId: params.upload.uploaded_by,
    fileName: params.upload.file_name,
    fileSha256: params.upload.file_sha256,
    mimeType: params.upload.mime_type || 'application/octet-stream',
    fileSizeBytes: Number(params.upload.file_size_bytes || 0),
    selectedAccountId: params.upload.selected_account_id,
    parsedPayload: params.parsed as unknown as Record<string, unknown>,
    unmatchedAccountDescriptors: params.unmatchedAccountDescriptors,
    suggestedExistingAccounts: params.suggestedExistingAccounts,
    storageBucket: params.upload.storage_bucket,
    storagePath: params.upload.storage_path,
  })

  if (!parseSessionId) {
    throw new Error(
      `Statement recovery session storage is unavailable. Apply migration 006_statement_parse_sessions.sql and re-upload ${buildParsedAccountLabel(params.parsed.account, params.parsed.institution_name || params.parsed.institution_code)}.`,
    )
  }

  await updateStatementUpload(params.supabase, params.upload.id, {
    status: 'needs_account_resolution',
    parse_session_id: parseSessionId,
    result_payload: buildPausedResult(params.upload.id, parseSessionId),
    error_code: null,
    error_message: null,
    parse_error: null,
  })

  return parseSessionId
}

async function markUploadFailed(params: {
  supabase: any
  statementUploadId: string
  error: unknown
}) {
  const message = params.error instanceof Error ? params.error.message : 'Failed to process statement upload'
  await updateStatementUpload(params.supabase, params.statementUploadId, {
    status: 'failed',
    error_code: 'statement_upload_failed',
    error_message: message,
    parse_error: message,
  })
}

export async function processStatementUpload(params: {
  statementUploadId: string
}) : Promise<StatementUploadProcessResult> {
  const supabase = createServiceSupabaseClient() as any
  const upload = await loadStatementUploadRow(supabase, params.statementUploadId)

  await updateStatementUpload(supabase, upload.id, {
    status: 'parsing',
    error_code: null,
    error_message: null,
    parse_error: null,
  })

  try {
    let parsed: ParsedStatementResult | null = null
    let routed: Awaited<ReturnType<typeof routeParsedTransactions>> | null = null
    let parseSessionId = upload.parse_session_id

    if (upload.parse_session_id) {
      const parseSession = await getStatementParseSession({
        supabase,
        parseSessionId: upload.parse_session_id,
        householdId: upload.household_id,
        userId: upload.uploaded_by,
      })

      if (!parseSession) {
        throw new Error('Statement parse session not found for upload resume')
      }

      const storedResolutionPayload = parseJsonArray<ParseResolutionRow>(parseSession.resolution_payload)
      if (storedResolutionPayload.length === 0) {
        await updateStatementUpload(supabase, upload.id, {
          status: 'needs_account_resolution',
          parse_session_id: upload.parse_session_id,
          result_payload: buildPausedResult(upload.id, upload.parse_session_id),
          error_code: null,
          error_message: null,
          parse_error: null,
        })
        return buildPausedResult(upload.id, upload.parse_session_id)
      }

      parsed = (parseSession.parsed_payload || {}) as ParsedStatementResult
      const unresolvedDescriptors = parseJsonArray<Record<string, unknown>>(parseSession.unresolved_descriptors)
      const { candidateAccounts, accountOverrides } = await buildAccountOverrides({
        supabase,
        householdId: upload.household_id,
        parsed,
        unresolvedDescriptors,
        resolutionPayload: storedResolutionPayload,
      })

      routed = await routeParsedTransactions({
        supabase,
        householdId: upload.household_id,
        parsed,
        candidateAccounts,
        accountOverridesByDescriptorKey: accountOverrides,
        manualAccount: null,
      })

      if (routed.unmatchedAccountDescriptors.length > 0) {
        const pausedSessionId = await createOrUpdatePausedParseSession({
          supabase,
          upload,
          parsed,
          unmatchedAccountDescriptors: routed.unmatchedAccountDescriptors as unknown as Array<Record<string, unknown>>,
          suggestedExistingAccounts: routed.suggestedExistingAccounts as unknown as Array<Record<string, unknown>>,
        })
        return buildPausedResult(upload.id, pausedSessionId)
      }

      parseSessionId = String(parseSession.id)
    } else {
      const bytes = await downloadStoredStatement(supabase, upload)
      parsed = await parseStatement(bytes, upload.mime_type || 'application/octet-stream', upload.file_name)

      const candidateAccounts = await loadAccountCandidates(supabase, upload.household_id)
      if (candidateAccounts.length === 0) {
        throw new Error(
          `No active accounts found. Add this account first: ${buildParsedAccountLabel(parsed.account, parsed.institution_name || parsed.institution_code)}`,
        )
      }

      routed = await routeParsedTransactions({
        supabase,
        householdId: upload.household_id,
        parsed,
        candidateAccounts,
        manualAccount: null,
      })

      if (routed.unmatchedAccountDescriptors.length > 0) {
        const pausedSessionId = await createOrUpdatePausedParseSession({
          supabase,
          upload,
          parsed,
          unmatchedAccountDescriptors: routed.unmatchedAccountDescriptors as unknown as Array<Record<string, unknown>>,
          suggestedExistingAccounts: routed.suggestedExistingAccounts as unknown as Array<Record<string, unknown>>,
        })
        return buildPausedResult(upload.id, pausedSessionId)
      }
    }

    if (!parsed || !routed || routed.routedTransactions.length === 0) {
      throw new Error('No transactions were found in this statement.')
    }

    const staged = await stageSplitRoutedTransactions({
      supabase,
      householdId: upload.household_id,
      userId: upload.uploaded_by,
      parsed,
      routedTransactions: routed.routedTransactions,
      fileName: upload.file_name,
      fileSha256: upload.file_sha256,
      mimeType: upload.mime_type || 'application/octet-stream',
      fileSizeBytes: Number(upload.file_size_bytes || 0),
      statementUploadId: upload.id,
      storageBucket: upload.storage_bucket,
      storagePath: upload.storage_path,
    })

    const result: StatementUploadProcessResult = {
      statementUploadId: upload.id,
      status: 'completed',
      importCount: staged.importCount,
      transactionsCount: staged.transactionsCount,
      duplicateCount: staged.duplicateCount,
      imports: staged.imports.map((item) => ({
        importId: item.importId,
        importLabel: item.importLabel,
        accountLabel: item.accountLabel,
        reviewUrl: item.reviewUrl,
        status: item.status,
      })),
      reviewUrl: staged.reviewUrl,
    }

    if (parseSessionId) {
      await markStatementParseSessionResolved({
        supabase,
        parseSessionId,
      })
    }

    await updateStatementUpload(supabase, upload.id, {
      status: 'completed',
      parse_session_id: parseSessionId,
      result_payload: result,
      completed_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
      parse_error: null,
    })

    return result
  } catch (error) {
    await markUploadFailed({
      supabase,
      statementUploadId: upload.id,
      error,
    })
    throw error
  }
}

export async function queueStatementParseSessionResumption(params: {
  statementUploadId: string
  parseSessionId: string
  resolutionPayload: Array<Record<string, unknown>>
}) {
  const supabase = createServiceSupabaseClient() as any
  const upload = await loadStatementUploadRow(supabase, params.statementUploadId)
  const parseSession = await getStatementParseSession({
    supabase,
    parseSessionId: params.parseSessionId,
    householdId: upload.household_id,
    userId: upload.uploaded_by,
  })

  if (!parseSession) {
    throw new Error('Parse session not found')
  }

  await updateStatementParseSessionResolutionPayload({
    supabase,
    parseSessionId: params.parseSessionId,
    resolutionPayload: params.resolutionPayload,
  })

  await updateStatementUpload(supabase, params.statementUploadId, {
    status: 'queued',
    parse_session_id: params.parseSessionId,
    result_payload: buildPausedResult(params.statementUploadId, params.parseSessionId),
    error_code: null,
    error_message: null,
    parse_error: null,
  })
}

export function describePausedStatementUpload(unmatchedDescriptors: Array<{ label?: string | null }>) {
  return buildRoutingFailureMessage(unmatchedDescriptors.map((descriptor) => descriptor.label || ''))
}
