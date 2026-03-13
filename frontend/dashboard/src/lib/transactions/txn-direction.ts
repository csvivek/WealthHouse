const CREDIT_LIKE_TXN_TYPES = new Set([
  'credit',
  'payment',
  'refund',
  'interest',
  'salary',
  'deposit',
  'cash_deposit',
  'credit_card_payment',
  'transfer_in',
  'dividend',
  'investment_sale',
])

const DEBIT_LIKE_TXN_TYPES = new Set([
  'debit',
  'purchase',
  'fee',
  'withdrawal',
  'giro',
  'wallet_topup',
  'transfer_out',
  'investment_purchase',
])

export function normalizeTxnDirection(txnType: string | null | undefined): 'credit' | 'debit' {
  const normalized = String(txnType ?? '').trim().toLowerCase()

  if (CREDIT_LIKE_TXN_TYPES.has(normalized)) return 'credit'
  if (DEBIT_LIKE_TXN_TYPES.has(normalized)) return 'debit'

  if (
    normalized.includes('refund')
    || normalized.includes('reversal')
    || normalized.includes('payment')
    || normalized.includes('deposit')
    || normalized.includes('salary')
    || normalized.includes('interest')
    || normalized.includes('dividend')
  ) {
    return 'credit'
  }

  if (
    normalized.includes('purchase')
    || normalized.includes('fee')
    || normalized.includes('withdrawal')
    || normalized.includes('giro')
    || normalized.includes('wallet_topup')
  ) {
    return 'debit'
  }

  // Legacy semantic "transfer" does not preserve in/out direction.
  return 'debit'
}
