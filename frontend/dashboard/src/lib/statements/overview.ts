type JsonRecord = Record<string, unknown>

export type StatementOverviewType =
  | 'Credit Card'
  | 'Savings'
  | 'Credit Line'
  | 'Balance Transfer'
  | 'Investment'
  | 'Other'

export interface StatementOverviewFileImport {
  id: string
  file_name: string
  status: string
  institution_code: string | null
  statement_date: string | null
  statement_period_start: string | null
  statement_period_end: string | null
  currency: string | null
  raw_parse_result: JsonRecord | null
  summary_json: JsonRecord | null
  card_info_json: JsonRecord | null
  total_rows: number | null
  duplicate_rows: number | null
  storage_bucket?: string | null
  storage_path?: string | null
  created_at: string
}

export interface StatementOverviewStagingRow {
  id: string
  file_import_id: string
  row_index: number
  review_status: string
  txn_date: string
  merchant_raw: string
  description: string | null
  amount: number
  txn_type: string
  currency: string
  original_data: JsonRecord | null
}

export interface StatementOverviewSummary {
  creditLimit: number | null
  minimumPayment: number | null
  paymentDueDate: string | null
  grandTotal: number | null
  openingBalance: number | null
  closingBalance: number | null
}

export interface StatementOverviewTransaction {
  id: string
  date: string
  description: string
  amount: number
  txnType: 'debit' | 'credit' | 'unknown'
  currency: string
  isBalanceTransferInstalment: boolean
}

export interface StatementOverviewSubCard {
  key: string
  name: string
  last4: string | null
  netAmount: number
  debitTotal: number
  creditTotal: number
}

export interface StatementOverviewCard {
  id: string
  status: string
  bankKey: string
  bankLabel: string
  canonicalType: StatementOverviewType
  badgeLabel: string
  title: string
  subtitle: string | null
  accountHint: string | null
  statementDate: string | null
  periodStart: string | null
  periodEnd: string | null
  currency: string
  summary: StatementOverviewSummary
  transactionCount: number
  duplicateCount: number
  matchedAccountLabel: string | null
  institutionName: string | null
  importFileName: string
  createdAt: string
  subCards: StatementOverviewSubCard[]
  transactions: StatementOverviewTransaction[]
  reviewUrl: string
  reviewLabel: 'Review' | 'View'
  downloadUrl: string | null
  downloadAvailable: boolean
  downloadUnavailableReason: string | null
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeText(value?: string | null) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function extractLast4(value?: string | null) {
  const digits = (value ?? '').replace(/\D/g, '')
  return digits ? digits.slice(-4) : null
}

export function deriveStatementOverviewBank(params: {
  institutionCode?: string | null
  institutionName?: string | null
}) {
  const code = normalizeText(params.institutionCode)
  const name = normalizeText(params.institutionName)
  const combined = `${code} ${name}`

  if (combined.includes('dbs') || combined.includes('posb')) {
    return { key: 'dbs', label: 'DBS' }
  }
  if (combined.includes('ocbc')) {
    return { key: 'ocbc', label: 'OCBC' }
  }
  if (combined.includes('citibank') || combined.includes('citi')) {
    return { key: 'citi', label: 'Citi' }
  }
  if (combined.includes('hsbc')) {
    return { key: 'hsbc', label: 'HSBC' }
  }
  if (combined.includes('trust')) {
    return { key: 'trust', label: 'Trust' }
  }
  if (combined.includes('uob')) {
    return { key: 'uob', label: 'UOB' }
  }
  if (combined.includes('gxs')) {
    return { key: 'gxs', label: 'GXS' }
  }

  const fallback = readString(params.institutionName) || readString(params.institutionCode) || 'Other'
  return {
    key: normalizeText(fallback).replace(/\s+/g, '-') || 'other',
    label: titleCase(fallback),
  }
}

export function deriveStatementOverviewType(params: {
  accountType?: string | null
  productName?: string | null
  cardName?: string | null
  fileName?: string | null
}) {
  const accountType = normalizeText(params.accountType)
  const signals = normalizeText([params.productName, params.cardName, params.fileName].filter(Boolean).join(' '))

  if (signals.includes('balance transfer') || /\bbt\b/.test(signals)) {
    return 'Balance Transfer' as const
  }
  if (accountType.includes('credit') || accountType.includes('card')) {
    return 'Credit Card' as const
  }
  if (accountType.includes('loan') || signals.includes('credit line') || signals.includes('line of credit')
    || signals.includes('ready credit') || signals.includes('cash line') || signals.includes('easicredit')
    || signals.includes('cashplus') || signals.includes('flexiloan')) {
    return 'Credit Line' as const
  }
  if (accountType.includes('invest') || accountType.includes('crypto')) {
    return 'Investment' as const
  }
  if (accountType.includes('savings') || accountType.includes('current') || accountType.includes('deposit')) {
    return 'Savings' as const
  }

  return 'Other' as const
}

function buildBadgeLabel(type: StatementOverviewType, productName: string | null) {
  if (!productName) return type
  if (type === 'Credit Line') return productName
  if (type === 'Balance Transfer') return productName.includes('Transfer') ? productName : 'Balance Transfer'
  return type
}

function buildSummary(summary: JsonRecord | null): StatementOverviewSummary {
  return {
    creditLimit: readNumber(summary?.credit_limit),
    minimumPayment: readNumber(summary?.minimum_payment),
    paymentDueDate: readString(summary?.payment_due_date),
    grandTotal: readNumber(summary?.grand_total),
    openingBalance: readNumber(summary?.opening_balance),
    closingBalance: readNumber(summary?.closing_balance),
  }
}

function extractMatchedAccountLabel(rawParseResult: JsonRecord | null, cardInfo: JsonRecord | null) {
  const rawMatch = asArray(rawParseResult?.matched_accounts)
    .map((entry) => asRecord(entry))
    .find(Boolean)
  if (rawMatch) {
    return readString(rawMatch.label)
  }

  const cardMatch = asArray(cardInfo?.matchedAccounts)
    .map((entry) => asRecord(entry))
    .find(Boolean)
  if (cardMatch) {
    return readString(cardMatch.label)
  }

  return null
}

function buildTransactionPreview(rows: StatementOverviewStagingRow[]): StatementOverviewTransaction[] {
  return rows
    .slice()
    .sort((left, right) => {
      const dateCompare = right.txn_date.localeCompare(left.txn_date)
      if (dateCompare !== 0) return dateCompare
      return right.row_index - left.row_index
    })
    .slice(0, 5)
    .map((row) => {
      const description = row.description?.trim() || row.merchant_raw || 'Imported transaction'
      const normalizedDescription = normalizeText(description)

      return {
        id: row.id,
        date: row.txn_date,
        description,
        amount: Number(row.amount),
        txnType: (
          row.txn_type === 'debit' || row.txn_type === 'credit'
            ? row.txn_type
            : 'unknown'
        ) as StatementOverviewTransaction['txnType'],
        currency: row.currency || 'SGD',
        isBalanceTransferInstalment: normalizedDescription.includes('balance transfer')
          || normalizedDescription.includes('bt instalment')
          || normalizedDescription.includes('bt installment'),
      }
    })
}

function buildSubCards(rows: StatementOverviewStagingRow[]) {
  const groups = new Map<string, StatementOverviewSubCard>()

  for (const row of rows) {
    const originalData = asRecord(row.original_data)
    const cardName = readString(originalData?.matchedCardName)
    const cardLast4 = extractLast4(readString(originalData?.matchedCardLast4))
    if (!cardName && !cardLast4) continue

    const key = `${cardName || 'Card'}:${cardLast4 || 'unknown'}`
    const existing = groups.get(key) ?? {
      key,
      name: cardName || 'Card',
      last4: cardLast4,
      netAmount: 0,
      debitTotal: 0,
      creditTotal: 0,
    }

    const amount = Number(row.amount)
    if (row.txn_type === 'credit') {
      existing.creditTotal += amount
      existing.netAmount -= amount
    } else {
      existing.debitTotal += amount
      existing.netAmount += amount
    }

    groups.set(key, existing)
  }

  return Array.from(groups.values()).sort((left, right) => left.name.localeCompare(right.name))
}

export function buildStatementOverviewCards(params: {
  imports: StatementOverviewFileImport[]
  stagingRows: StatementOverviewStagingRow[]
}) {
  const rowsByImportId = new Map<string, StatementOverviewStagingRow[]>()

  for (const row of params.stagingRows) {
    const existing = rowsByImportId.get(row.file_import_id) ?? []
    existing.push(row)
    rowsByImportId.set(row.file_import_id, existing)
  }

  return params.imports.map((fileImport) => {
    const rawParseResult = asRecord(fileImport.raw_parse_result)
    const parsedAccount = asRecord(rawParseResult?.account)
    const cardInfo = asRecord(fileImport.card_info_json)
    const importRows = rowsByImportId.get(fileImport.id) ?? []
    const institutionName = readString(rawParseResult?.institution_name)
    const productName = readString(parsedAccount?.product_name)
    const cardName = readString(parsedAccount?.card_name)
    const matchedAccountLabel = extractMatchedAccountLabel(rawParseResult, cardInfo)
    const accountHint = extractLast4(readString(parsedAccount?.card_last4))
      || extractLast4(readString(parsedAccount?.identifier_hint))
    const importLabel = readString(rawParseResult?.import_label)
    const title = importLabel || matchedAccountLabel || cardName || productName || fileImport.file_name
    const subtitle = matchedAccountLabel && matchedAccountLabel !== title
      ? matchedAccountLabel
      : institutionName
    const bank = deriveStatementOverviewBank({
      institutionCode: fileImport.institution_code,
      institutionName,
    })
    const canonicalType = deriveStatementOverviewType({
      accountType: readString(parsedAccount?.account_type),
      productName,
      cardName,
      fileName: fileImport.file_name,
    })
    const badgeLabel = buildBadgeLabel(canonicalType, cardName || productName)
    const summary = buildSummary(asRecord(fileImport.summary_json))

    return {
      id: fileImport.id,
      status: fileImport.status,
      bankKey: bank.key,
      bankLabel: bank.label,
      canonicalType,
      badgeLabel,
      title,
      subtitle,
      accountHint: accountHint ? `•••• ${accountHint}` : null,
      statementDate: fileImport.statement_date,
      periodStart: fileImport.statement_period_start,
      periodEnd: fileImport.statement_period_end,
      currency: fileImport.currency || readString(parsedAccount?.currency) || 'SGD',
      summary,
      transactionCount: importRows.length || fileImport.total_rows || 0,
      duplicateCount: fileImport.duplicate_rows || 0,
      matchedAccountLabel,
      institutionName,
      importFileName: fileImport.file_name,
      createdAt: fileImport.created_at,
      subCards: buildSubCards(importRows),
      transactions: buildTransactionPreview(importRows),
      reviewUrl: `/statements/review/${fileImport.id}`,
      reviewLabel: fileImport.status === 'in_review' ? 'Review' : 'View',
      downloadUrl: fileImport.storage_bucket && fileImport.storage_path
        ? `/api/statements/${fileImport.id}/download`
        : null,
      downloadAvailable: Boolean(fileImport.storage_bucket && fileImport.storage_path),
      downloadUnavailableReason: fileImport.storage_bucket && fileImport.storage_path
        ? null
        : 'Original file unavailable for legacy imports.',
    } satisfies StatementOverviewCard
  })
}
