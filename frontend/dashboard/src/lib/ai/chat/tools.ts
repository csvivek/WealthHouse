import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type {
  ChatAccountSummary,
  ChatAssistantContext,
  ChatCoverageRange,
  ChatRouteDecision,
  ChatSessionPayload,
  ChatToolContext,
} from '@/lib/ai/chat/types'

type ServerSupabaseClient = SupabaseClient<Database>

interface StatementTxnRow {
  id: string
  txn_date: string
  amount: number
  currency: string
  txn_type: string
  merchant_normalized: string | null
  merchant_raw: string | null
  description: string | null
  account_id: string
  category:
    | {
        id: number
        name: string
        group_name: string | null
        payment_subtype: string | null
        type: string | null
      }
    | {
        id: number
        name: string
        group_name: string | null
        payment_subtype: string | null
        type: string | null
      }[]
    | null
  merchant:
    | {
        name: string | null
      }
    | {
        name: string | null
      }[]
    | null
  statement_transaction_tags?: unknown
}

interface LedgerEntryRow {
  id: string
  entry_date: string
  amount: number
  currency: string
  merchant_display: string | null
  payment_account_id: string | null
  category:
    | {
        name: string
        group_name: string | null
        payment_subtype: string | null
        type: string | null
      }
    | {
        name: string
        group_name: string | null
        payment_subtype: string | null
        type: string | null
      }[]
    | null
}

interface AdvanceRow {
  id: string
  is_recoverable: boolean
  expected_recovery_amount: number
  status: string
  due_date: string | null
  notes: string | null
  created_at: string
  counterparties:
    | {
        name: string
        relationship: string | null
      }
    | {
        name: string
        relationship: string | null
      }[]
    | null
  advance_repayments?:
    | Array<{
        repayment_date: string
        amount: number
        method: string | null
        notes: string | null
      }>
    | {
        repayment_date: string
        amount: number
        method: string | null
        notes: string | null
      }[]
    | null
}

interface CardRow {
  account_id: string
  card_name: string
  card_last4: string
  total_outstanding: number | null
  minimum_payment: number | null
}

interface StatementSummaryRow {
  account_id: string
  statement_date: string
  opening_balance: number | null
  closing_balance: number | null
  payment_due_date: string | null
  minimum_payment: number | null
  grand_total: number | null
}

interface AssetBalanceRow {
  account_id: string
  balance: number
  as_of: string
  assets:
    | {
        symbol: string
        name: string | null
        asset_type: string
      }
    | {
        symbol: string
        name: string | null
        asset_type: string
      }[]
    | null
}

interface ToolExecutionParams {
  name: string
  args: Record<string, unknown>
  supabase: ServerSupabaseClient
  toolContext: ChatToolContext
}

const MAX_SUMMARY_ROWS = 8
const MAX_FETCH_BATCH = 1000

function normalizeText(value: unknown) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/\s+/g, ' ')
    : ''
}

function toNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function toNullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
}

function toAccountMap(accounts: ChatAccountSummary[]) {
  return new Map(accounts.map((account) => [account.id, account]))
}

function flattenCategory(value: StatementTxnRow['category'] | LedgerEntryRow['category']) {
  if (!value) return null
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

function flattenMerchant(value: StatementTxnRow['merchant']) {
  if (!value) return null
  if (Array.isArray(value)) return value[0]?.name ?? null
  return value.name ?? null
}

function flattenCounterparty(value: AdvanceRow['counterparties']) {
  if (!value) return null
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

function flattenAsset(value: AssetBalanceRow['assets']) {
  if (!value) return null
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

function flattenTags(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const tag = (entry as { tag?: unknown }).tag
    const tags = Array.isArray(tag) ? tag : tag ? [tag] : []
    return tags.filter((candidate): candidate is { name: string; normalized_name?: string | null; is_active?: boolean } => {
      if (!candidate || typeof candidate !== 'object') return false
      if (typeof (candidate as { name?: unknown }).name !== 'string') return false
      return (candidate as { is_active?: boolean }).is_active !== false
    })
  })
}

function matchesDateRange(date: string, dateFrom: string | null, dateTo: string | null) {
  if (dateFrom && date < dateFrom) return false
  if (dateTo && date > dateTo) return false
  return true
}

function isCoverageEmpty(range: ChatCoverageRange) {
  return !range.start || !range.end
}

export function isRangeOutsideCoverage(params: {
  dateFrom: string | null
  dateTo: string | null
  coverage: ChatCoverageRange
}) {
  if (isCoverageEmpty(params.coverage)) return true
  if (params.dateTo && params.coverage.start && params.dateTo < params.coverage.start) return true
  if (params.dateFrom && params.coverage.end && params.dateFrom > params.coverage.end) return true
  return false
}

function encodeCursor(payload: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64')
}

function decodeCursor(value: string | null) {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64').toString('utf-8')) as Record<string, unknown>
    return parsed
  } catch {
    return null
  }
}

function compareCursor(date: string, id: string, cursor: Record<string, unknown> | null) {
  if (!cursor) return true
  const cursorDate = typeof cursor.txnDate === 'string' ? cursor.txnDate : null
  const cursorId = typeof cursor.id === 'string' ? cursor.id : null
  if (!cursorDate || !cursorId) return true
  if (date < cursorDate) return true
  if (date === cursorDate && id < cursorId) return true
  return false
}

async function fetchAllPages<T>(runPage: (from: number, to: number) => Promise<T[]>) {
  const rows: T[] = []
  let from = 0

  while (true) {
    const page = await runPage(from, from + MAX_FETCH_BATCH - 1)
    rows.push(...page)
    if (page.length < MAX_FETCH_BATCH) break
    from += MAX_FETCH_BATCH
  }

  return rows
}

function resolveAccountIds(args: Record<string, unknown>, toolContext: ChatToolContext) {
  const allowedAccountIds = new Set(toolContext.accounts.map((account) => account.id))
  return toStringArray(args.accountIds).filter((accountId) => allowedAccountIds.has(accountId))
}

function defaultGroupBy(intent: ChatRouteDecision['intent']) {
  if (intent === 'spending') return 'merchant' as const
  if (intent === 'cash_flow') return 'month' as const
  return 'none' as const
}

function detectIntent(value: unknown): ChatRouteDecision['intent'] {
  switch (value) {
    case 'spending':
    case 'net_worth':
    case 'cash_flow':
    case 'advances':
    case 'transactions':
    case 'financial_advice':
    case 'general':
      return value
    default:
      return 'general'
  }
}

function resolveAccountIdsFromInstitution(
  institutionName: string | null,
  accounts: ChatAccountSummary[],
) {
  if (!institutionName) return []
  const normalizedInstitution = normalizeText(institutionName)
  return accounts
    .filter((account) => normalizeText(account.institutionName).includes(normalizedInstitution))
    .map((account) => account.id)
}

export function sanitizeRouteDecision(params: {
  rawDecision: Record<string, unknown>
  session: ChatSessionPayload
}): ChatRouteDecision {
  const { rawDecision, session } = params

  const institutionName = toNullableString(rawDecision.institutionName)
  let accountIds = resolveAccountIds(rawDecision, session)

  if (accountIds.length === 0 && institutionName) {
    accountIds = resolveAccountIdsFromInstitution(institutionName, session.accounts)
  }

  const categoryNames = toStringArray(rawDecision.categoryNames)
  const periodLabel = toNullableString(rawDecision.periodLabel) ?? 'all available data'
  const intent = detectIntent(rawDecision.intent)

  const missingAccountName = toNullableString(rawDecision.missingAccountName)
  const missingInstitutionName = accountIds.length === 0
    ? toNullableString(rawDecision.missingInstitutionName) ?? (institutionName ? institutionName : null)
    : null

  return {
    intent,
    periodLabel,
    dateFrom: toNullableString(rawDecision.dateFrom),
    dateTo: toNullableString(rawDecision.dateTo),
    comparisonDateFrom: toNullableString(rawDecision.comparisonDateFrom),
    comparisonDateTo: toNullableString(rawDecision.comparisonDateTo),
    comparisonPeriodLabel: toNullableString(rawDecision.comparisonPeriodLabel),
    accountIds,
    merchant: toNullableString(rawDecision.merchant),
    categoryNames,
    counterpartyName: toNullableString(rawDecision.counterpartyName),
    institutionName,
    currencyMode: rawDecision.currencyMode === 'single_currency' ? 'single_currency' : 'segment_by_currency',
    groupBy: ['merchant', 'category', 'month', 'account', 'none'].includes(String(rawDecision.groupBy))
      ? (rawDecision.groupBy as ChatRouteDecision['groupBy'])
      : defaultGroupBy(intent),
    limit: Math.min(Math.max(toNumber(rawDecision.limit, 8), 1), 25),
    cursor: toNullableString(rawDecision.cursor),
    missingAccountName,
    missingInstitutionName,
    requiresAccountSummary: Boolean(rawDecision.requiresAccountSummary) || intent === 'net_worth' || intent === 'financial_advice',
  }
}

export function buildAssistantContext(params: {
  routeDecision: ChatRouteDecision
  toolContext: ChatToolContext
  availability: ChatAssistantContext['dataAvailability']
  nextCursor?: string | null
}) {
  const accountMap = toAccountMap(params.toolContext.accounts)
  return {
    intent: params.routeDecision.intent,
    periodLabel: params.routeDecision.periodLabel,
    dateFrom: params.routeDecision.dateFrom,
    dateTo: params.routeDecision.dateTo,
    comparisonDateFrom: params.routeDecision.comparisonDateFrom,
    comparisonDateTo: params.routeDecision.comparisonDateTo,
    comparisonPeriodLabel: params.routeDecision.comparisonPeriodLabel,
    accountIds: params.routeDecision.accountIds,
    accountNames: params.routeDecision.accountIds
      .map((accountId) => accountMap.get(accountId)?.name ?? null)
      .filter((accountName): accountName is string => Boolean(accountName)),
    merchant: params.routeDecision.merchant,
    categoryNames: params.routeDecision.categoryNames,
    counterpartyName: params.routeDecision.counterpartyName,
    currencyMode: params.routeDecision.currencyMode,
    groupBy: params.routeDecision.groupBy,
    nextCursor: params.nextCursor ?? null,
    dataAvailability: params.availability,
  } satisfies ChatAssistantContext
}

async function fetchStatementTransactions(params: {
  supabase: ServerSupabaseClient
  accountIds: string[]
  dateFrom: string | null
  dateTo: string | null
}) {
  if (params.accountIds.length === 0) return [] as StatementTxnRow[]

  return fetchAllPages<StatementTxnRow>(async (from, to) => {
    let query = params.supabase
      .from('statement_transactions')
      .select('id, txn_date, amount, currency, txn_type, merchant_normalized, merchant_raw, description, account_id, category:categories(id, name, group_name, payment_subtype, type), merchant:merchants(name), statement_transaction_tags(tag:tags(name, normalized_name, is_active))')
      .in('account_id', params.accountIds)
      .order('txn_date', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)

    if (params.dateFrom) query = query.gte('txn_date', params.dateFrom)
    if (params.dateTo) query = query.lte('txn_date', params.dateTo)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data as StatementTxnRow[] | null) ?? []
  })
}

async function fetchLedgerEntries(params: {
  supabase: ServerSupabaseClient
  accountIds: string[]
  dateFrom: string | null
  dateTo: string | null
}) {
  if (params.accountIds.length === 0) return [] as LedgerEntryRow[]

  return fetchAllPages<LedgerEntryRow>(async (from, to) => {
    let query = params.supabase
      .from('ledger_entries')
      .select('id, entry_date, amount, currency, merchant_display, payment_account_id, category:categories(name, group_name, payment_subtype, type)')
      .order('entry_date', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)

    query = query.in('payment_account_id', params.accountIds)
    if (params.dateFrom) query = query.gte('entry_date', params.dateFrom)
    if (params.dateTo) query = query.lte('entry_date', params.dateTo)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data as LedgerEntryRow[] | null) ?? []
  })
}

async function getAccountSummaryData(params: {
  supabase: ServerSupabaseClient
  toolContext: ChatToolContext
}) {
  const accountIds = params.toolContext.accounts.map((account) => account.id)

  const [cardsResult, summariesResult, balancesResult] = await Promise.all([
    accountIds.length === 0
      ? Promise.resolve([] as CardRow[])
      : params.supabase
          .from('cards')
          .select('account_id, card_name, card_last4, total_outstanding, minimum_payment')
          .in('account_id', accountIds)
          .then(({ data, error }) => {
            if (error) throw new Error(error.message)
            return (data as CardRow[] | null) ?? []
          }),
    accountIds.length === 0
      ? Promise.resolve([] as StatementSummaryRow[])
      : params.supabase
          .from('statement_summaries')
          .select('account_id, statement_date, opening_balance, closing_balance, payment_due_date, minimum_payment, grand_total')
          .in('account_id', accountIds)
          .order('statement_date', { ascending: false })
          .then(({ data, error }) => {
            if (error) throw new Error(error.message)
            return (data as StatementSummaryRow[] | null) ?? []
          }),
    accountIds.length === 0
      ? Promise.resolve([] as AssetBalanceRow[])
      : params.supabase
          .from('asset_balances')
          .select('account_id, balance, as_of, assets(symbol, name, asset_type)')
          .in('account_id', accountIds)
          .then(({ data, error }) => {
            if (error) throw new Error(error.message)
            return (data as AssetBalanceRow[] | null) ?? []
          }),
  ])

  const latestSummaryByAccount = new Map<string, StatementSummaryRow>()
  for (const summary of summariesResult) {
    if (!latestSummaryByAccount.has(summary.account_id)) {
      latestSummaryByAccount.set(summary.account_id, summary)
    }
  }

  const cardByAccount = new Map(cardsResult.map((card) => [card.account_id, card]))
  const balancesByAccount = new Map<string, AssetBalanceRow[]>()
  for (const row of balancesResult) {
    balancesByAccount.set(row.account_id, [...(balancesByAccount.get(row.account_id) ?? []), row])
  }

  return params.toolContext.accounts.map((account) => {
    const latestSummary = latestSummaryByAccount.get(account.id) ?? null
    const card = cardByAccount.get(account.id) ?? null
    const positions = balancesByAccount.get(account.id) ?? []
    const positionBalance = positions.reduce((sum, position) => sum + toNumber(position.balance), 0)
    const balanceAsOf = positions.reduce<string | null>((latest, position) => {
      if (!latest || position.as_of > latest) return position.as_of
      return latest
    }, latestSummary?.statement_date ?? null)

    let currentBalance: number | null = null
    let liabilityBalance: number | null = null

    if (account.accountType === 'credit_card') {
      liabilityBalance = card?.total_outstanding ?? latestSummary?.grand_total ?? latestSummary?.closing_balance ?? null
    } else if (account.accountType === 'loan') {
      liabilityBalance = latestSummary?.closing_balance ?? latestSummary?.grand_total ?? null
    } else if (account.accountType === 'investment' || account.accountType === 'crypto_exchange') {
      currentBalance = positionBalance
    } else {
      currentBalance = latestSummary?.closing_balance ?? null
    }

    return {
      accountId: account.id,
      accountName: account.name,
      accountType: account.accountType,
      currency: account.currency,
      institutionName: account.institutionName,
      identifierHint: account.identifierHint,
      currentBalance,
      liabilityBalance,
      asOf: balanceAsOf,
      cardName: card?.card_name ?? null,
      cardLast4: card?.card_last4 ?? null,
      minimumPayment: card?.minimum_payment ?? latestSummary?.minimum_payment ?? null,
      paymentDueDate: latestSummary?.payment_due_date ?? null,
      holdings: positions.map((position) => ({
        balance: toNumber(position.balance),
        asOf: position.as_of,
        symbol: flattenAsset(position.assets)?.symbol ?? null,
        assetName: flattenAsset(position.assets)?.name ?? null,
        assetType: flattenAsset(position.assets)?.asset_type ?? null,
      })),
    }
  })
}

async function runGetAccountSummary(params: ToolExecutionParams) {
  const summary = await getAccountSummaryData({
    supabase: params.supabase,
    toolContext: params.toolContext,
  })

  return {
    availability: summary.length > 0 ? 'available' : 'unavailable',
    baseCurrency: params.toolContext.baseCurrency,
    accounts: summary,
  }
}

async function runGetNetWorth(params: ToolExecutionParams) {
  const summary = await getAccountSummaryData({
    supabase: params.supabase,
    toolContext: params.toolContext,
  })

  const byCurrency = new Map<string, {
    assets: number
    liabilities: number
    components: Array<Record<string, unknown>>
    asOf: string | null
  }>()

  for (const account of summary) {
    const bucket = byCurrency.get(account.currency) ?? {
      assets: 0,
      liabilities: 0,
      components: [] as Array<Record<string, unknown>>,
      asOf: null,
    }

    if (account.currentBalance != null) {
      bucket.assets += account.currentBalance
      bucket.components.push({
        type: account.accountType === 'investment' || account.accountType === 'crypto_exchange' ? 'investment' : 'cash',
        accountName: account.accountName,
        amount: account.currentBalance,
        asOf: account.asOf,
      })
    }

    if (account.liabilityBalance != null) {
      bucket.liabilities += Math.abs(account.liabilityBalance)
      bucket.components.push({
        type: 'liability',
        accountName: account.accountName,
        amount: Math.abs(account.liabilityBalance),
        asOf: account.asOf,
      })
    }

    if (account.asOf && (!bucket.asOf || account.asOf > bucket.asOf)) {
      bucket.asOf = account.asOf
    }

    byCurrency.set(account.currency, bucket)
  }

  const currencies = Array.from(byCurrency.entries()).map(([currency, value]) => ({
    currency,
    assets: value.assets,
    liabilities: value.liabilities,
    net: value.assets - value.liabilities,
    asOf: value.asOf,
    components: value.components,
  }))

  const canConsolidate = currencies.length > 0 && currencies.every((item) => item.currency === params.toolContext.baseCurrency)
  const consolidatedTotal = canConsolidate
    ? currencies.reduce((sum, item) => sum + item.net, 0)
    : null

  return {
    availability: currencies.length > 0 ? 'available' : 'unavailable',
    baseCurrency: params.toolContext.baseCurrency,
    currencyMode: currencies.length <= 1 ? 'single_currency' : 'segment_by_currency',
    consolidatedTotal,
    currencies,
  }
}

function merchantDisplay(row: StatementTxnRow, accountMap: Map<string, ChatAccountSummary>) {
  return flattenMerchant(row.merchant)
    ?? row.merchant_normalized
    ?? row.merchant_raw
    ?? row.description
    ?? accountMap.get(row.account_id)?.name
    ?? 'Unknown'
}

function categoryMatches(categoryName: string | null, requested: string[]) {
  if (!categoryName) return requested.length === 0
  const normalized = normalizeText(categoryName)
  return requested.some((item) => normalized === normalizeText(item) || normalized.includes(normalizeText(item)))
}

function merchantMatches(merchantName: string, requestedMerchant: string | null) {
  if (!requestedMerchant) return true
  const normalizedMerchant = normalizeText(merchantName)
  const normalizedRequested = normalizeText(requestedMerchant)
  return normalizedMerchant.includes(normalizedRequested)
}

function buildRecurringSubscriptionCandidates(rows: StatementTxnRow[], accountMap: Map<string, ChatAccountSummary>) {
  const grouped = new Map<string, { merchant: string; months: Set<string>; total: number; count: number }>()

  for (const row of rows) {
    const merchant = merchantDisplay(row, accountMap)
    const key = normalizeText(merchant)
    if (!key) continue
    const monthKey = row.txn_date.slice(0, 7)
    const current = grouped.get(key) ?? { merchant, months: new Set<string>(), total: 0, count: 0 }
    current.months.add(monthKey)
    current.total += Math.abs(row.amount)
    current.count += 1
    grouped.set(key, current)
  }

  return new Set(
    Array.from(grouped.values())
      .filter((item) => item.count >= 2 && item.months.size >= 2)
      .map((item) => normalizeText(item.merchant)),
  )
}

async function runGetSpendingSummary(params: ToolExecutionParams) {
  const dateFrom = toNullableString(params.args.dateFrom)
  const dateTo = toNullableString(params.args.dateTo)
  const accountIds = resolveAccountIds(params.args, params.toolContext)
  const requestedCategories = toStringArray(params.args.categoryNames)
  const requestedMerchant = toNullableString(params.args.merchant)
  const groupBy = ['category', 'merchant'].includes(String(params.args.groupBy)) ? String(params.args.groupBy) : 'merchant'

  if (isRangeOutsideCoverage({
    dateFrom,
    dateTo,
    coverage: params.toolContext.coverage.transactions,
  })) {
    return {
      availability: 'unavailable',
      period: {
        dateFrom,
        dateTo,
      },
      currency: params.toolContext.baseCurrency,
      grouped: [],
      totalAmount: 0,
      caveat: 'No imported transactions cover the requested period.',
    }
  }

  const effectiveAccountIds = accountIds.length > 0
    ? accountIds
    : params.toolContext.accounts.map((account) => account.id)

  const accountMap = toAccountMap(params.toolContext.accounts)
  const rows = (await fetchStatementTransactions({
    supabase: params.supabase,
    accountIds: effectiveAccountIds,
    dateFrom,
    dateTo,
  }))
    .filter((row) => row.txn_type === 'debit')

  const isSubscriptionQuery = requestedCategories.some((categoryName) => normalizeText(categoryName) === 'subscriptions')
  const recurringCandidates = isSubscriptionQuery
    ? buildRecurringSubscriptionCandidates(rows, accountMap)
    : new Set<string>()

  const filteredRows = rows.filter((row) => {
    const merchantName = merchantDisplay(row, accountMap)
    const category = flattenCategory(row.category)
    const tags = flattenTags(row.statement_transaction_tags)
    const hasSubscriptionTag = tags.some((tag) => normalizeText(tag.name) === 'subscription')
    const isRecurringCandidate = recurringCandidates.has(normalizeText(merchantName))

    if (!merchantMatches(merchantName, requestedMerchant)) return false
    if (requestedCategories.length > 0) {
      const matchesCategory = categoryMatches(category?.name ?? null, requestedCategories)
      if (matchesCategory) return true
      if (isSubscriptionQuery && (hasSubscriptionTag || isRecurringCandidate)) return true
      return false
    }
    return true
  })

  if (filteredRows.length === 0) {
    return {
      availability: 'no_match',
      period: {
        dateFrom,
        dateTo,
      },
      currency: params.toolContext.baseCurrency,
      grouped: [],
      totalAmount: 0,
      caveat: requestedMerchant || requestedCategories.length > 0
        ? 'Imported data exists for the requested period, but there were no matching spending rows.'
        : 'Imported data exists for the requested period, but there were no debit transactions that matched.',
    }
  }

  const totals = new Map<string, {
    label: string
    amount: number
    txnCount: number
    currency: string
  }>()

  for (const row of filteredRows) {
    const category = flattenCategory(row.category)
    const label = groupBy === 'category'
      ? category?.name ?? 'Uncategorized'
      : merchantDisplay(row, accountMap)
    const current = totals.get(label) ?? {
      label,
      amount: 0,
      txnCount: 0,
      currency: row.currency || params.toolContext.baseCurrency,
    }
    current.amount += Math.abs(row.amount)
    current.txnCount += 1
    totals.set(label, current)
  }

  const grouped = Array.from(totals.values())
    .sort((left, right) => right.amount - left.amount)
    .slice(0, MAX_SUMMARY_ROWS)

  const totalAmount = grouped.reduce((sum, item) => sum + item.amount, 0)

  return {
    availability: 'available',
    currency: grouped[0]?.currency ?? params.toolContext.baseCurrency,
    period: {
      dateFrom,
      dateTo,
    },
    totalAmount,
    grouped: grouped.map((item) => ({
      ...item,
      shareOfTotal: totalAmount > 0 ? item.amount / totalAmount : 0,
    })),
    caveat: isSubscriptionQuery && grouped.some((item) => recurringCandidates.has(normalizeText(item.label)))
      ? 'Subscription totals include recurring-merchant heuristics when explicit category or tag data was unavailable.'
      : null,
  }
}

async function runGetCashFlow(params: ToolExecutionParams) {
  const dateFrom = toNullableString(params.args.dateFrom)
  const dateTo = toNullableString(params.args.dateTo)
  const accountIds = resolveAccountIds(params.args, params.toolContext)
  const effectiveAccountIds = accountIds.length > 0
    ? accountIds
    : params.toolContext.accounts.map((account) => account.id)

  if (isRangeOutsideCoverage({
    dateFrom,
    dateTo,
    coverage: params.toolContext.coverage.ledger,
  })) {
    return {
      availability: 'unavailable',
      currency: params.toolContext.baseCurrency,
      period: {
        dateFrom,
        dateTo,
      },
      incomeTotal: 0,
      expenseTotal: 0,
      net: 0,
      byGroup: [],
      byMonth: [],
    }
  }

  const rows = await fetchLedgerEntries({
    supabase: params.supabase,
    accountIds: effectiveAccountIds,
    dateFrom,
    dateTo,
  })

  const filteredRows = rows.filter((row) => {
    const category = flattenCategory(row.category)
    const categoryType = category?.payment_subtype ?? category?.type ?? null
    return categoryType === 'income' || categoryType === 'expense'
  })

  if (filteredRows.length === 0) {
    return {
      availability: 'no_match',
      currency: params.toolContext.baseCurrency,
      period: {
        dateFrom,
        dateTo,
      },
      incomeTotal: 0,
      expenseTotal: 0,
      net: 0,
      byGroup: [],
      byMonth: [],
    }
  }

  const byGroup = new Map<string, { name: string; income: number; expenses: number }>()
  const byMonth = new Map<string, { month: string; income: number; expenses: number }>()
  let incomeTotal = 0
  let expenseTotal = 0

  for (const row of filteredRows) {
    const category = flattenCategory(row.category)
    const categoryType = category?.payment_subtype ?? category?.type ?? null
    const amount = Math.abs(row.amount)
    const groupName = category?.group_name ?? category?.name ?? 'Other'
    const group = byGroup.get(groupName) ?? { name: groupName, income: 0, expenses: 0 }
    const monthKey = row.entry_date.slice(0, 7)
    const month = byMonth.get(monthKey) ?? { month: monthKey, income: 0, expenses: 0 }

    if (categoryType === 'income') {
      group.income += amount
      month.income += amount
      incomeTotal += amount
    } else {
      group.expenses += amount
      month.expenses += amount
      expenseTotal += amount
    }

    byGroup.set(groupName, group)
    byMonth.set(monthKey, month)
  }

  return {
    availability: 'available',
    currency: filteredRows[0]?.currency ?? params.toolContext.baseCurrency,
    period: {
      dateFrom,
      dateTo,
    },
    incomeTotal,
    expenseTotal,
    net: incomeTotal - expenseTotal,
    byGroup: Array.from(byGroup.values()).sort((left, right) => (right.expenses + right.income) - (left.expenses + left.income)),
    byMonth: Array.from(byMonth.values()).sort((left, right) => left.month.localeCompare(right.month)),
  }
}

async function runGetAdvances(params: ToolExecutionParams) {
  const dateFrom = toNullableString(params.args.dateFrom)
  const dateTo = toNullableString(params.args.dateTo)
  const requestedCounterparty = toNullableString(params.args.counterpartyName)
  const effectiveAccountIds = params.toolContext.accounts.map((account) => account.id)

  if (effectiveAccountIds.length === 0) {
    return {
      availability: requestedCounterparty ? 'no_match' : 'unavailable',
      counterpartyName: requestedCounterparty,
      openAdvances: [],
      summaryByCounterparty: [],
      repaymentSummary: [],
    }
  }

  const { data: ledgerEntries, error: ledgerError } = await params.supabase
    .from('ledger_entries')
    .select('id')
    .in('payment_account_id', effectiveAccountIds)

  if (ledgerError) throw new Error(ledgerError.message)

  const ledgerEntryIds = ((ledgerEntries as Array<{ id: string }> | null) ?? []).map((row) => row.id)

  if (ledgerEntryIds.length === 0) {
    return {
      availability: requestedCounterparty ? 'no_match' : 'unavailable',
      counterpartyName: requestedCounterparty,
      openAdvances: [],
      summaryByCounterparty: [],
      repaymentSummary: [],
    }
  }

  const { data, error } = await params.supabase
    .from('advances')
    .select('id, is_recoverable, expected_recovery_amount, status, due_date, notes, created_at, counterparties(name, relationship), advance_repayments(repayment_date, amount, method, notes)')
    .in('ledger_entry_id', ledgerEntryIds)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  const rows = ((data as AdvanceRow[] | null) ?? []).filter((row) => {
    const counterparty = flattenCounterparty(row.counterparties)
    if (!requestedCounterparty) return true
    return normalizeText(counterparty?.name).includes(normalizeText(requestedCounterparty))
  })

  if (rows.length === 0) {
    return {
      availability: requestedCounterparty ? 'no_match' : 'unavailable',
      counterpartyName: requestedCounterparty,
      openAdvances: [],
      summaryByCounterparty: [],
      repaymentSummary: [],
    }
  }

  const summaryByCounterparty = new Map<string, {
    counterpartyName: string
    direction: 'owed_to_you' | 'you_owe'
    originalAmount: number
    recoveredAmount: number
    outstandingAmount: number
  }>()

  const repaymentSummary = new Map<string, { counterpartyName: string; amount: number }>()

  const openAdvances = rows.map((row) => {
    const counterparty = flattenCounterparty(row.counterparties)
    const repayments = Array.isArray(row.advance_repayments) ? row.advance_repayments : []
    const recoveredAmount = repayments.reduce((sum, repayment) => sum + Math.abs(repayment.amount), 0)
    const outstandingAmount = Math.max(Math.abs(row.expected_recovery_amount) - recoveredAmount, 0)
    const direction = row.is_recoverable ? 'owed_to_you' as const : 'you_owe' as const
    const counterpartyName = counterparty?.name ?? 'Unknown'

    const existing = summaryByCounterparty.get(counterpartyName) ?? {
      counterpartyName,
      direction,
      originalAmount: 0,
      recoveredAmount: 0,
      outstandingAmount: 0,
    }
    existing.originalAmount += Math.abs(row.expected_recovery_amount)
    existing.recoveredAmount += recoveredAmount
    existing.outstandingAmount += outstandingAmount
    summaryByCounterparty.set(counterpartyName, existing)

    for (const repayment of repayments) {
      if (!matchesDateRange(repayment.repayment_date, dateFrom, dateTo)) continue
      const bucket = repaymentSummary.get(counterpartyName) ?? { counterpartyName, amount: 0 }
      bucket.amount += Math.abs(repayment.amount)
      repaymentSummary.set(counterpartyName, bucket)
    }

    return {
      id: row.id,
      counterpartyName,
      relationship: counterparty?.relationship ?? null,
      direction,
      status: row.status,
      dueDate: row.due_date,
      notes: row.notes,
      createdAt: row.created_at,
      originalAmount: Math.abs(row.expected_recovery_amount),
      recoveredAmount,
      outstandingAmount,
      repayments: repayments
        .filter((repayment) => matchesDateRange(repayment.repayment_date, dateFrom, dateTo))
        .map((repayment) => ({
          repaymentDate: repayment.repayment_date,
          amount: Math.abs(repayment.amount),
          method: repayment.method,
          notes: repayment.notes,
        })),
    }
  })

  return {
    availability: 'available',
    counterpartyName: requestedCounterparty,
    openAdvances,
    summaryByCounterparty: Array.from(summaryByCounterparty.values()).sort((left, right) => right.outstandingAmount - left.outstandingAmount),
    repaymentSummary: Array.from(repaymentSummary.values()).sort((left, right) => right.amount - left.amount),
  }
}

async function runGetTransactions(params: ToolExecutionParams) {
  const dateFrom = toNullableString(params.args.dateFrom)
  const dateTo = toNullableString(params.args.dateTo)
  const requestedMerchant = toNullableString(params.args.merchant)
  const accountIds = resolveAccountIds(params.args, params.toolContext)
  const limit = Math.min(Math.max(toNumber(params.args.limit, 10), 1), 25)
  const decodedCursor = decodeCursor(toNullableString(params.args.cursor))
  const accountMap = toAccountMap(params.toolContext.accounts)

  if (isRangeOutsideCoverage({
    dateFrom,
    dateTo,
    coverage: params.toolContext.coverage.transactions,
  })) {
    return {
      availability: 'unavailable',
      rows: [],
      limit,
      hasMore: false,
      nextCursor: null,
      period: {
        dateFrom,
        dateTo,
      },
    }
  }

  const rows = await fetchStatementTransactions({
    supabase: params.supabase,
    accountIds: accountIds.length > 0 ? accountIds : params.toolContext.accounts.map((account) => account.id),
    dateFrom,
    dateTo,
  })

  const filteredRows = rows
    .filter((row) => merchantMatches(merchantDisplay(row, accountMap), requestedMerchant))
    .filter((row) => compareCursor(row.txn_date, row.id, decodedCursor))

  const page = filteredRows.slice(0, limit)
  const hasMore = filteredRows.length > limit
  const lastRow = page.at(-1) ?? null
  const nextCursor = hasMore && lastRow
    ? encodeCursor({
        txnDate: lastRow.txn_date,
        id: lastRow.id,
      })
    : null

  return {
    availability: page.length > 0 ? 'available' : 'no_match',
    rows: page.map((row) => ({
      id: row.id,
      txnDate: row.txn_date,
      merchant: merchantDisplay(row, accountMap),
      amount: row.amount,
      currency: row.currency,
      txnType: row.txn_type,
      categoryName: flattenCategory(row.category)?.name ?? null,
      accountName: accountMap.get(row.account_id)?.name ?? 'Unknown account',
    })),
    limit,
    hasMore,
    nextCursor,
    period: {
      dateFrom,
      dateTo,
    },
  }
}

export async function executeChatDataTool(params: ToolExecutionParams) {
  switch (params.name) {
    case 'get_account_summary':
      return runGetAccountSummary(params)
    case 'get_net_worth':
      return runGetNetWorth(params)
    case 'get_spending_summary':
      return runGetSpendingSummary(params)
    case 'get_cash_flow':
      return runGetCashFlow(params)
    case 'get_advances':
      return runGetAdvances(params)
    case 'get_transactions':
      return runGetTransactions(params)
    default:
      throw new Error(`Unsupported chat tool: ${params.name}`)
  }
}
