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

export function normalizeDirection(
  transaction: ParsedStatementTransaction,
): 'debit' | 'credit' | 'unknown' {
  const statementType = (transaction.statement_type || '').toLowerCase()

  if (
    statementType.includes('payment') ||
    statementType.includes('refund') ||
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
