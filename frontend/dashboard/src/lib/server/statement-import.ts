/* eslint-disable @typescript-eslint/no-explicit-any */
import * as crypto from 'crypto'
import { normalizeDirection, type ParsedStatementAccount, type ParsedStatementResult, type ParsedStatementTransaction } from '@/lib/statements/helpers'
import type { AvailableCategory } from '@/lib/knowledge/categories'
import { normalizeMerchantName } from '@/lib/knowledge/merchant-categories'
import { resolveMerchantCategory, type MerchantIntelligenceResult } from '@/lib/knowledge/merchant-intelligence'
import { normalizeAccountType } from '@/lib/server/accounts'

export interface AccountInstitution {
  name: string
}

export interface AccountCard {
  id: string
  card_name: string
  card_last4: string
}

export interface AccountCandidate {
  id: string
  institution_id: string
  product_name: string
  nickname: string | null
  identifier_hint: string | null
  account_type: string
  institutions: AccountInstitution | AccountInstitution[] | null
  cards: AccountCard | AccountCard[] | null
}

export interface ResolvedAccount {
  id: string
  institutionId: string
  label: string
  matchedBy: 'manual' | 'auto'
  cardId: string | null
  cardName: string | null
  cardLast4: string | null
}

export interface RoutedTransaction {
  rowIndex: number
  txnDate: string
  postingDate?: string
  merchantRaw: string
  description: string | null
  amount: number
  txnType: 'debit' | 'credit' | 'unknown'
  currency: string
  originalAmount: number | null
  originalCurrency: string | null
  reference?: string
  txnHash: string
  account: ResolvedAccount
  accountDescriptor: ParsedStatementAccount | null
  rawTransaction: ParsedStatementTransaction
  categoryId: number | null
  categoryName: string | null
  categoryHint: string | null
  categoryConfidence: number
  categoryDecisionSource: string
  merchantCanonicalName: string
  merchantBusinessType: string | null
  similarMerchantKey: string
  merchantAliases: string[]
  searchSummary: string | null
}

export interface UnmatchedAccountDescriptor {
  descriptorKey: string
  label: string
  transactionCount: number
  sampleRowIndexes: number[]
  institution_name: string | null
  account_type: string | null
  product_name: string | null
  identifier_hint: string | null
  card_name: string | null
  card_last4: string | null
  currency: string | null
  suggestedExistingAccountId: string | null
  suggestedExistingAccountLabel: string | null
  suggestedScore: number | null
}

export interface SuggestedExistingAccount {
  accountId: string
  label: string
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

function getInstitutionName(account: AccountCandidate) {
  return asArray(account.institutions)[0]?.name ?? ''
}

function getAccountCards(account: AccountCandidate) {
  return asArray(account.cards)
}

function getPrimaryCard(account: AccountCandidate) {
  return getAccountCards(account)[0] ?? null
}

function getAccountLabel(account: AccountCandidate) {
  const institutionName = getInstitutionName(account)
  const institution = institutionName ? `${institutionName} — ` : ''
  return `${institution}${account.nickname ?? account.product_name}`
}

function normalizeText(value?: string | null) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractLast4(value?: string | null) {
  const digits = (value ?? '').replace(/\D/g, '')
  return digits ? digits.slice(-4) : ''
}

function includesEither(left: string, right: string) {
  if (!left || !right) return false
  return left.includes(right) || right.includes(left)
}

export function computeFileHash(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

export function computeTxnHash(
  accountId: string,
  txnDate: string,
  postingDate: string | undefined,
  amount: number,
  currency: string,
  merchantRaw: string,
  reference: string | undefined,
  rowKey: string,
): string {
  const input = [
    accountId,
    txnDate,
    postingDate ?? '',
    String(amount),
    currency,
    merchantRaw.trim().toLowerCase(),
    reference ?? '',
    rowKey,
  ].join('|')

  return crypto.createHash('sha256').update(input).digest('hex')
}

export function mergeAccountDescriptor(
  statementAccount?: ParsedStatementAccount | null,
  transactionAccount?: ParsedStatementAccount | null,
): ParsedStatementAccount | null {
  const merged = {
    account_type: transactionAccount?.account_type ?? statementAccount?.account_type ?? null,
    product_name: transactionAccount?.product_name ?? statementAccount?.product_name ?? null,
    identifier_hint: transactionAccount?.identifier_hint ?? statementAccount?.identifier_hint ?? null,
    card_name: transactionAccount?.card_name ?? statementAccount?.card_name ?? null,
    card_last4: transactionAccount?.card_last4 ?? statementAccount?.card_last4 ?? null,
    currency: transactionAccount?.currency ?? statementAccount?.currency ?? null,
  }

  return Object.values(merged).some(Boolean) ? merged : null
}

export function buildParsedAccountLabel(
  descriptor: ParsedStatementAccount | null | undefined,
  institutionName?: string | null,
) {
  const institution = institutionName?.trim() || 'Unknown institution'
  const product = descriptor?.card_name?.trim() || descriptor?.product_name?.trim() || 'Unknown account'
  const hint = extractLast4(descriptor?.card_last4 || descriptor?.identifier_hint)

  return hint ? `${institution} — ${product} •••• ${hint}` : `${institution} — ${product}`
}

function scoreAccountCandidate(
  account: AccountCandidate,
  institutionName: string,
  descriptor: ParsedStatementAccount | null,
) {
  let score = 0

  const parsedLast4 = extractLast4(descriptor?.card_last4 || descriptor?.identifier_hint)
  const accountLast4 = extractLast4(account.identifier_hint)
  const cardLast4s = getAccountCards(account).map((card) => extractLast4(card.card_last4))

  if (parsedLast4) {
    if (accountLast4 && accountLast4 === parsedLast4) score += 90
    if (cardLast4s.includes(parsedLast4)) score += 120
  }

  const parsedInstitution = normalizeText(institutionName)
  const accountInstitution = normalizeText(getInstitutionName(account))
  if (includesEither(parsedInstitution, accountInstitution)) {
    score += 25
  }

  const parsedProduct = normalizeText(descriptor?.card_name || descriptor?.product_name)
  const accountName = normalizeText(account.nickname || account.product_name)
  const cardNames = getAccountCards(account).map((card) => normalizeText(card.card_name))

  if (includesEither(parsedProduct, accountName)) {
    score += 40
  }

  if (cardNames.some((cardName) => includesEither(parsedProduct, cardName))) {
    score += 50
  }

  const parsedAccountType = normalizeAccountType(descriptor?.account_type)
  if (parsedAccountType === account.account_type) {
    score += 15
  }

  return score
}

export function resolveAccountCandidate(params: {
  candidates: AccountCandidate[]
  institutionName: string
  descriptor: ParsedStatementAccount | null
}) {
  const { candidates, institutionName, descriptor } = params

  if (candidates.length === 0) {
    return { error: 'No active accounts found in this household.' as const }
  }

  const scored = candidates
    .map((account) => ({
      account,
      score: scoreAccountCandidate(account, institutionName, descriptor),
    }))
    .sort((left, right) => right.score - left.score)

  const top = scored[0]
  const second = scored[1]

  if (candidates.length === 1 && top) {
    const primaryCard = getPrimaryCard(top.account)
    return {
      account: {
        id: top.account.id,
        institutionId: top.account.institution_id,
        label: getAccountLabel(top.account),
        matchedBy: 'auto' as const,
        cardId: primaryCard?.id ?? null,
        cardName: primaryCard?.card_name ?? null,
        cardLast4: primaryCard?.card_last4 ?? null,
      },
      scored,
    }
  }

  if (!top || top.score < 40) {
    return { error: 'No confident account match found.' as const, scored }
  }

  if (second && top.score - second.score < 15) {
    return { error: 'This transaction could match more than one account.' as const, scored }
  }

  const primaryCard = getPrimaryCard(top.account)
  return {
    account: {
      id: top.account.id,
      institutionId: top.account.institution_id,
      label: getAccountLabel(top.account),
      matchedBy: 'auto' as const,
      cardId: primaryCard?.id ?? null,
      cardName: primaryCard?.card_name ?? null,
      cardLast4: primaryCard?.card_last4 ?? null,
    },
    scored,
  }
}

function findSuggestedExistingAccount(params: {
  candidates: AccountCandidate[]
  descriptor: ParsedStatementAccount | null
  institutionName: string
}) {
  const scored = params.candidates
    .map((candidate) => ({
      candidate,
      score: scoreAccountCandidate(candidate, params.institutionName, params.descriptor),
    }))
    .sort((left, right) => right.score - left.score)

  const top = scored[0]
  if (!top || top.score <= 0) return null

  return {
    accountId: top.candidate.id,
    label: getAccountLabel(top.candidate),
    score: top.score,
  }
}

export function buildDescriptorKey(
  descriptor: ParsedStatementAccount | null,
  institutionName?: string | null,
) {
  const raw = [
    normalizeText(institutionName),
    normalizeText(descriptor?.account_type),
    normalizeText(descriptor?.product_name),
    normalizeText(descriptor?.card_name),
    extractLast4(descriptor?.card_last4),
    extractLast4(descriptor?.identifier_hint),
    normalizeText(descriptor?.currency),
  ].join('|')

  return crypto.createHash('sha1').update(raw || 'unknown').digest('hex').slice(0, 20)
}

function getResolvedAccountFromCandidate(candidate: AccountCandidate, matchedBy: 'manual' | 'auto'): ResolvedAccount {
  const primaryCard = getPrimaryCard(candidate)
  return {
    id: candidate.id,
    institutionId: candidate.institution_id,
    label: getAccountLabel(candidate),
    matchedBy,
    cardId: primaryCard?.id ?? null,
    cardName: primaryCard?.card_name ?? null,
    cardLast4: primaryCard?.card_last4 ?? null,
  }
}

export async function loadAccountCandidates(supabase: any, householdId: string) {
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, institution_id, product_name, nickname, identifier_hint, account_type, institutions(name), cards(id, card_name, card_last4)')
    .eq('household_id', householdId)
    .eq('is_active', true)

  return (accounts as AccountCandidate[] | null) ?? []
}

function buildMerchantDecisionCacheKey(
  transaction: ParsedStatementTransaction,
  institutionName?: string | null,
) {
  const merchant = normalizeMerchantName(transaction.merchant || transaction.description)
  const institution = normalizeMerchantName(institutionName)
  return `${institution}|${merchant}`
}

export async function routeParsedTransactions(params: {
  supabase: any
  parsed: ParsedStatementResult
  candidateAccounts: AccountCandidate[]
  manualAccount?: ResolvedAccount | null
  accountOverridesByDescriptorKey?: Map<string, ResolvedAccount>
}) {
  const { data: availableCategoriesData } = await params.supabase
    .from('categories')
    .select('id, name, type, group_name')
    .order('id', { ascending: true })

  const availableCategories = (availableCategoriesData as AvailableCategory[] | null) ?? []
  const merchantResolutionCache = new Map<string, MerchantIntelligenceResult>()

  const routedTransactions: RoutedTransaction[] = []
  const unmatchedByKey = new Map<string, UnmatchedAccountDescriptor>()
  const suggestedByAccountId = new Map<string, SuggestedExistingAccount>()

  for (const [index, transaction] of (params.parsed.transactions || []).entries()) {
    const txnDate = transaction.date || transaction.posting_date || null
    const amount = Math.abs(transaction.amount || 0)

    if (!txnDate || !amount) {
      continue
    }

    const accountDescriptor = mergeAccountDescriptor(params.parsed.account, transaction.account)
    const descriptorKey = buildDescriptorKey(accountDescriptor, params.parsed.institution_name || params.parsed.institution_code)

    const override = params.accountOverridesByDescriptorKey?.get(descriptorKey)
    const resolvedAccount = params.manualAccount
      || override
      || resolveAccountCandidate({
        candidates: params.candidateAccounts,
        institutionName: params.parsed.institution_name || params.parsed.institution_code || '',
        descriptor: accountDescriptor,
      }).account

    if (!resolvedAccount) {
      const existing = unmatchedByKey.get(descriptorKey)
      const suggestion = findSuggestedExistingAccount({
        candidates: params.candidateAccounts,
        descriptor: accountDescriptor,
        institutionName: params.parsed.institution_name || params.parsed.institution_code || '',
      })

      if (suggestion) {
        suggestedByAccountId.set(suggestion.accountId, {
          accountId: suggestion.accountId,
          label: suggestion.label,
        })
      }

      if (existing) {
        existing.transactionCount += 1
        if (existing.sampleRowIndexes.length < 5) {
          existing.sampleRowIndexes.push(index)
        }
      } else {
        unmatchedByKey.set(descriptorKey, {
          descriptorKey,
          label: buildParsedAccountLabel(accountDescriptor, params.parsed.institution_name || params.parsed.institution_code),
          transactionCount: 1,
          sampleRowIndexes: [index],
          institution_name: params.parsed.institution_name || params.parsed.institution_code || null,
          account_type: accountDescriptor?.account_type || null,
          product_name: accountDescriptor?.product_name || null,
          identifier_hint: accountDescriptor?.identifier_hint || null,
          card_name: accountDescriptor?.card_name || null,
          card_last4: accountDescriptor?.card_last4 || null,
          currency: accountDescriptor?.currency || params.parsed.currency || null,
          suggestedExistingAccountId: suggestion?.accountId || null,
          suggestedExistingAccountLabel: suggestion?.label || null,
          suggestedScore: suggestion?.score || null,
        })
      }

      continue
    }

    const currency = transaction.currency || accountDescriptor?.currency || params.parsed.currency || 'SGD'
    const merchantRaw = transaction.merchant || transaction.description || 'Imported transaction'
    const postingDate = transaction.posting_date || undefined
    const reference = transaction.reference || undefined
    const merchantCacheKey = buildMerchantDecisionCacheKey(transaction, params.parsed.institution_name || params.parsed.institution_code)

    let merchantDecision = merchantResolutionCache.get(merchantCacheKey)
    if (!merchantDecision) {
      merchantDecision = await resolveMerchantCategory({
        merchantName: merchantRaw,
        description: transaction.description,
        amount,
        institutionName: params.parsed.institution_name || params.parsed.institution_code,
        countryCode: 'SG',
        availableCategories,
      })
      merchantResolutionCache.set(merchantCacheKey, merchantDecision)
    }

    const txnHash = computeTxnHash(
      resolvedAccount.id,
      txnDate,
      postingDate,
      amount,
      currency,
      merchantRaw,
      reference,
      `${index}`,
    )

    routedTransactions.push({
      rowIndex: index,
      txnDate,
      postingDate,
      merchantRaw,
      description: transaction.description || null,
      amount,
      txnType: normalizeDirection(transaction),
      currency,
      originalAmount:
        transaction.currency && transaction.currency !== (params.parsed.currency || 'SGD') ? amount : null,
      originalCurrency:
        transaction.currency && transaction.currency !== (params.parsed.currency || 'SGD') ? transaction.currency : null,
      reference,
      txnHash,
      account: resolvedAccount,
      accountDescriptor,
      rawTransaction: transaction,
      categoryId: merchantDecision.categoryId,
      categoryName: merchantDecision.categoryName,
      categoryHint: transaction.category_hint || merchantDecision.categoryName,
      categoryConfidence: merchantDecision.categoryConfidence,
      categoryDecisionSource: merchantDecision.categoryDecisionSource,
      merchantCanonicalName: merchantDecision.merchantCanonicalName,
      merchantBusinessType: merchantDecision.merchantBusinessType,
      similarMerchantKey: merchantDecision.similarMerchantKey,
      merchantAliases: merchantDecision.merchantAliases,
      searchSummary: merchantDecision.searchSummary,
    })
  }

  return {
    routedTransactions,
    unmatchedAccountDescriptors: Array.from(unmatchedByKey.values()),
    suggestedExistingAccounts: Array.from(suggestedByAccountId.values()),
  }
}

function formatMonthLabel(dateValue?: string | null) {
  if (!dateValue) {
    return null
  }

  const safeDate = new Date(`${dateValue}T00:00:00Z`)
  if (Number.isNaN(safeDate.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(safeDate)
}

export function buildImportLabel(parsed: ParsedStatementResult, routedTransactions: RoutedTransaction[]) {
  const institution = parsed.institution_name?.trim() || 'Statement'
  const uniqueAccounts = new Set(routedTransactions.map((transaction) => transaction.account.id))
  const descriptor = parsed.account
  const monthLabel = formatMonthLabel(parsed.period_end || parsed.statement_date || parsed.period_start)
  const isCreditCard = normalizeAccountType(descriptor?.account_type) === 'credit_card'

  if (uniqueAccounts.size > 1 && isCreditCard) {
    return `${institution} — ${monthLabel ? `${monthLabel} ` : ''}Credit Cards`
  }

  if (uniqueAccounts.size > 1) {
    return `${institution} — ${monthLabel ? `${monthLabel} ` : ''}Statement`
  }

  const primaryAccount = routedTransactions[0]?.account
  if (primaryAccount) {
    return primaryAccount.label
  }

  const product = descriptor?.card_name?.trim() || descriptor?.product_name?.trim()
  return product ? `${institution} — ${product}` : `${institution} Statement`
}

export async function stageRoutedTransactions(params: {
  supabase: any
  householdId: string
  userId: string
  parsed: ParsedStatementResult
  routedTransactions: RoutedTransaction[]
  fileName: string
  fileSha256: string
  mimeType: string
  fileSizeBytes: number
  primaryAccount: ResolvedAccount
}) {
  const { data: fileImport, error: fileImportError } = await params.supabase
    .from('file_imports')
    .insert({
      household_id: params.householdId,
      account_id: params.primaryAccount.id,
      uploaded_by: params.userId,
      file_name: params.fileName,
      file_sha256: params.fileSha256,
      mime_type: params.mimeType || 'application/octet-stream',
      file_size_bytes: params.fileSizeBytes,
      status: 'parsing',
      institution_id: params.primaryAccount.institutionId,
    })
    .select('id')
    .single()

  if (fileImportError || !fileImport) {
    throw new Error('Failed to register file import')
  }

  const existingDuplicates = new Map<string, string>()
  const hashesByAccount = new Map<string, string[]>()

  for (const transaction of params.routedTransactions) {
    const currentHashes = hashesByAccount.get(transaction.account.id) ?? []
    currentHashes.push(transaction.txnHash)
    hashesByAccount.set(transaction.account.id, currentHashes)
  }

  for (const [accountId, txnHashes] of hashesByAccount.entries()) {
    const { data: existing } = await params.supabase
      .from('statement_transactions')
      .select('id, txn_hash')
      .eq('account_id', accountId)
      .in('txn_hash', Array.from(new Set(txnHashes)))

    for (const row of existing ?? []) {
      if (row.txn_hash) {
        existingDuplicates.set(`${accountId}:${row.txn_hash}`, row.id)
      }
    }
  }

  let duplicateCount = 0
  const importLabel = buildImportLabel(params.parsed, params.routedTransactions)

  const stagingRows = params.routedTransactions.map((transaction) => {
    const duplicateTransactionId = existingDuplicates.get(`${transaction.account.id}:${transaction.txnHash}`) ?? null
    const duplicateStatus: 'none' | 'existing_final' = duplicateTransactionId ? 'existing_final' : 'none'

    if (duplicateStatus !== 'none') {
      duplicateCount += 1
    }

    return {
      file_import_id: fileImport.id,
      household_id: params.householdId,
      account_id: transaction.account.id,
      row_index: transaction.rowIndex,
      review_status: 'pending' as const,
      duplicate_status: duplicateStatus,
      duplicate_transaction_id: duplicateTransactionId,
      txn_hash: transaction.txnHash,
      source_txn_hash: transaction.txnHash,
      txn_date: transaction.txnDate,
      posting_date: transaction.postingDate || null,
      merchant_raw: transaction.merchantRaw,
      description: transaction.description,
      reference: transaction.reference || null,
      amount: transaction.amount,
      txn_type: transaction.txnType,
      currency: transaction.currency,
      original_amount: transaction.originalAmount,
      original_currency: transaction.originalCurrency,
      confidence: params.routedTransactions.length > 0 ? 0.85 : 0,
      original_data: {
        ...transaction.rawTransaction,
        account: transaction.accountDescriptor,
        matchedAccountId: transaction.account.id,
        matchedAccountName: transaction.account.label,
        matchedCardId: transaction.account.cardId,
        matchedCardName: transaction.account.cardName,
        matchedCardLast4: transaction.account.cardLast4,
        categoryId: transaction.categoryId,
        categoryName: transaction.categoryName,
        categoryHint: transaction.categoryHint,
        categoryConfidence: transaction.categoryConfidence,
        categoryDecisionSource: transaction.categoryDecisionSource,
        merchantCanonicalName: transaction.merchantCanonicalName,
        merchantBusinessType: transaction.merchantBusinessType,
        merchantAliases: transaction.merchantAliases,
        similarMerchantKey: transaction.similarMerchantKey,
        searchSummary: transaction.searchSummary,
        importLabel,
      } as Record<string, unknown>,
      is_edited: false,
    }
  })

  if (stagingRows.length > 0) {
    const { error: stagingError } = await params.supabase
      .from('import_staging')
      .insert(stagingRows)

    if (stagingError) {
      await params.supabase
        .from('file_imports')
        .update({
          status: 'failed',
          parse_error: 'Failed to stage transactions',
          updated_at: new Date().toISOString(),
        })
        .eq('id', fileImport.id)

      throw new Error('Failed to stage parsed transactions')
    }
  }

  const uniqueMatchedAccounts = Array.from(
    new Map(params.routedTransactions.map((transaction) => [transaction.account.id, transaction.account])).values(),
  ).map((account) => ({
    accountId: account.id,
    label: account.label,
    matchedBy: account.matchedBy,
    cardId: account.cardId,
    cardName: account.cardName,
    cardLast4: account.cardLast4,
  }))

  await params.supabase
    .from('file_imports')
    .update({
      status: 'in_review',
      institution_code: params.parsed.institution_code || null,
      statement_date: params.parsed.statement_date || null,
      statement_period_start: params.parsed.period_start || null,
      statement_period_end: params.parsed.period_end || null,
      currency: params.parsed.currency || 'SGD',
      parse_confidence: params.routedTransactions.length > 0 ? 0.85 : 0,
      raw_parse_result: {
        ...(params.parsed as unknown as Record<string, unknown>),
        import_label: importLabel,
        matched_accounts: uniqueMatchedAccounts,
      },
      summary_json: (params.parsed.summary_json || { summary: params.parsed.summary || null }) as Record<string, unknown>,
      card_info_json: {
        statementAccount: params.parsed.account || null,
        matchedAccounts: uniqueMatchedAccounts,
      } as Record<string, unknown>,
      total_rows: params.routedTransactions.length,
      duplicate_rows: duplicateCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', fileImport.id)

  return {
    importId: fileImport.id,
    status: 'in_review' as const,
    institutionCode: params.parsed.institution_code ?? null,
    transactionsCount: params.routedTransactions.length,
    duplicateCount,
    importLabel,
    linkedAccounts: uniqueMatchedAccounts,
    statementDate: params.parsed.statement_date ?? null,
    period: { start: params.parsed.period_start ?? null, end: params.parsed.period_end ?? null },
    reviewUrl: `/statements/review/${fileImport.id}`,
  }
}

export function resolvedAccountFromCandidate(candidate: AccountCandidate, matchedBy: 'manual' | 'auto' = 'manual') {
  return getResolvedAccountFromCandidate(candidate, matchedBy)
}
