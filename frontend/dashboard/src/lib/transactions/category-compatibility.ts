import type { Database } from '@/types/database'

type TxnType = Database['public']['Enums']['txn_type']
type PaymentCategoryType = Database['public']['Enums']['category_type']

const CREDIT_COMPATIBLE_TYPES: PaymentCategoryType[] = ['income', 'transfer']
const DEBIT_COMPATIBLE_TYPES: PaymentCategoryType[] = ['expense', 'transfer']

export function normalizeTxnDirection(txnType: string | null | undefined): TxnType {
  return String(txnType).toLowerCase() === 'credit' ? 'credit' : 'debit'
}

export function getCompatiblePaymentCategoryTypes(txnType: string | null | undefined): PaymentCategoryType[] {
  return normalizeTxnDirection(txnType) === 'credit' ? CREDIT_COMPATIBLE_TYPES : DEBIT_COMPATIBLE_TYPES
}

export function isPaymentCategoryTypeCompatible(
  categoryType: string | null | undefined,
  txnType: string | null | undefined,
) {
  return getCompatiblePaymentCategoryTypes(txnType).includes((categoryType ?? 'expense') as PaymentCategoryType)
}
