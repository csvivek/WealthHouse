import {
  canonicalizeInstitutionName,
  normalizeAccountType,
  normalizeInstitutionCode,
} from '@/lib/accounts/normalization'

export interface ParsedStatementAccount {
  account_type?: string | null
  product_name?: string | null
  identifier_hint?: string | null
  card_name?: string | null
  card_last4?: string | null
  currency?: string | null
}

export interface ParsedStatementTransaction {
  date?: string | null
  posting_date?: string | null
  description?: string | null
  merchant?: string | null
  amount?: number | null
  currency?: string | null
  statement_type?: string | null
  category_hint?: string | null
  reference?: string | null
  account?: ParsedStatementAccount | null
}

export interface ParsedStatementResult {
  institution_code?: string | null
  institution_name?: string | null
  statement_date?: string | null
  period_start?: string | null
  period_end?: string | null
  currency?: string | null
  summary?: string | null
  summary_json?: Record<string, unknown> | null
  account?: ParsedStatementAccount | null
  transactions?: ParsedStatementTransaction[]
}

function normalizeParsedAccount(
  account: ParsedStatementAccount | null | undefined,
  fallbackCurrency?: string | null,
): ParsedStatementAccount | null {
  if (!account) return null

  const normalized = {
    ...account,
    account_type: normalizeAccountType(account.account_type, [
      account.product_name,
      account.card_name,
      account.identifier_hint,
    ]),
    currency: account.currency || fallbackCurrency || null,
  }

  return Object.values(normalized).some(Boolean) ? normalized : null
}

export function normalizeParsedStatement(parsed: ParsedStatementResult): ParsedStatementResult {
  const normalizedTransactions = (parsed.transactions ?? []).map((transaction) => ({
    ...transaction,
    account: normalizeParsedAccount(transaction.account, transaction.currency || parsed.currency || null),
  }))

  const normalizedAccount = normalizeParsedAccount(parsed.account, parsed.currency || null)
  const institutionSignals = [
    parsed.institution_name,
    normalizedAccount?.product_name,
    normalizedAccount?.card_name,
    ...normalizedTransactions.flatMap((transaction) => [
      transaction.account?.product_name,
      transaction.account?.card_name,
    ]),
  ]

  const institutionCode = normalizeInstitutionCode(parsed.institution_code, institutionSignals) || parsed.institution_code || null
  const institutionName = canonicalizeInstitutionName({
    institutionCode,
    institutionName: parsed.institution_name,
    fallbackValues: institutionSignals,
  })

  return {
    ...parsed,
    institution_code: institutionCode,
    institution_name: institutionName,
    account: normalizedAccount,
    transactions: normalizedTransactions,
  }
}

export function normalizeDirection(
  transaction: ParsedStatementTransaction,
): 'debit' | 'credit' | 'unknown' {
  const statementType = (transaction.statement_type || '').toLowerCase()

  if (
    statementType.includes('credit_card_payment') ||
    statementType.includes('payment') ||
    statementType.includes('refund') ||
    statementType.includes('reversal') ||
    statementType.includes('interest') ||
    statementType.includes('salary') ||
    statementType.includes('transfer_in') ||
    statementType.includes('deposit')
  ) {
    return 'credit'
  }

  if (
    statementType.includes('purchase') ||
    statementType.includes('fee') ||
    statementType.includes('transfer_out') ||
    statementType.includes('giro') ||
    statementType.includes('withdrawal') ||
    statementType.includes('wallet_topup')
  ) {
    return 'debit'
  }

  if ((transaction.amount ?? 0) > 0) {
    return 'debit'
  }

  if ((transaction.amount ?? 0) < 0) {
    return 'credit'
  }

  return 'unknown'
}
