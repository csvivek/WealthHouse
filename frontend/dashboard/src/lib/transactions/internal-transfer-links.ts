import { normalizeTxnDirection } from './category-compatibility'

const DAY_MS = 24 * 60 * 60 * 1000
const TRANSFER_CATEGORY_NAME_TO_LINK_TYPE = {
  'internal transfer': 'internal_transfer',
  'credit card payment': 'credit_card_payment',
  'cc payment': 'credit_card_payment',
  'loan repayment': 'loan_repayment',
} as const

const TRANSFER_LINK_LABELS = {
  internal_transfer: 'Transfer',
  credit_card_payment: 'CC Payment',
  loan_repayment: 'Loan Repayment',
} as const

export interface InternalTransferLinkRecord {
  id?: string | null
  fromTransactionId: string
  toTransactionId: string
  linkType?: string | null
  status?: string | null
  transferChainId?: string | null
  allocatedAmount?: number | null
}

export interface InternalTransferAccountLike {
  id: string
  name: string | null
}

export interface InternalTransferTransactionLike {
  id: string
  accountId: string
  txnType: string | null | undefined
  txnDate: string
  amount: number
  merchantNormalized: string | null
  merchantRaw: string | null
  description: string | null
}

export interface InternalTransferLinkSummary {
  counterpartTransactionId: string
  counterpartAccountId: string
  counterpartAccountName: string | null
  counterpartTxnType: 'credit' | 'debit'
  counterpartTxnDate: string
  counterpartAmount: number
  counterpartDisplayName: string | null
  directionLabel: 'to' | 'from'
}

export function isInternalTransferCategoryName(name: string | null | undefined) {
  return String(name ?? '').trim().toLowerCase() === 'internal transfer'
}

export function isTransferCategoryName(name: string | null | undefined) {
  return Boolean(resolveTransferCategoryLinkType(name))
}

export function resolveTransferCategoryLinkType(name: string | null | undefined) {
  const normalized = String(name ?? '').trim().toLowerCase()
  return TRANSFER_CATEGORY_NAME_TO_LINK_TYPE[normalized as keyof typeof TRANSFER_CATEGORY_NAME_TO_LINK_TYPE] ?? null
}

export function getTransferLinkLabel(linkType: string | null | undefined) {
  if (!linkType) return 'Transfer'
  return TRANSFER_LINK_LABELS[linkType as keyof typeof TRANSFER_LINK_LABELS] ?? 'Transfer'
}

export function getInternalTransferCounterpartId(transactionId: string, link: InternalTransferLinkRecord) {
  if (link.fromTransactionId === transactionId) return link.toTransactionId
  if (link.toTransactionId === transactionId) return link.fromTransactionId
  return null
}

export function buildInternalTransferLinkSummary(params: {
  sourceTransaction: InternalTransferTransactionLike
  counterpartTransaction: InternalTransferTransactionLike
  counterpartAccountName?: string | null
}): InternalTransferLinkSummary {
  const { sourceTransaction, counterpartTransaction, counterpartAccountName = null } = params
  const counterpartTxnType = normalizeTxnDirection(counterpartTransaction.txnType) === 'credit' ? 'credit' : 'debit'

  return {
    counterpartTransactionId: counterpartTransaction.id,
    counterpartAccountId: counterpartTransaction.accountId,
    counterpartAccountName,
    counterpartTxnType,
    counterpartTxnDate: counterpartTransaction.txnDate,
    counterpartAmount: counterpartTransaction.amount,
    counterpartDisplayName: getTransactionDisplayName(counterpartTransaction),
    directionLabel: normalizeTxnDirection(sourceTransaction.txnType) === 'debit' ? 'to' : 'from',
  }
}

export function resolveInternalTransferLinkSummary(params: {
  transactionId: string
  transactionsById: Record<string, InternalTransferTransactionLike>
  accountsById?: Record<string, InternalTransferAccountLike>
  links: InternalTransferLinkRecord[]
}): InternalTransferLinkSummary | null {
  const { transactionId, transactionsById, accountsById = {}, links } = params
  const sourceTransaction = transactionsById[transactionId]
  if (!sourceTransaction) return null

  const matchingLink = links.find((link) => (
    link.fromTransactionId === transactionId || link.toTransactionId === transactionId
  ))
  if (!matchingLink) return null

  const counterpartId = getInternalTransferCounterpartId(transactionId, matchingLink)
  if (!counterpartId) return null

  const counterpartTransaction = transactionsById[counterpartId]
  if (!counterpartTransaction) return null

  return buildInternalTransferLinkSummary({
    sourceTransaction,
    counterpartTransaction,
    counterpartAccountName: accountsById[counterpartTransaction.accountId]?.name ?? null,
  })
}

export function compareInternalTransferCandidates(
  sourceTransaction: InternalTransferTransactionLike,
  left: InternalTransferTransactionLike,
  right: InternalTransferTransactionLike,
) {
  const leftDateDiff = getDateDiffDays(sourceTransaction.txnDate, left.txnDate)
  const rightDateDiff = getDateDiffDays(sourceTransaction.txnDate, right.txnDate)
  if (leftDateDiff !== rightDateDiff) return leftDateDiff - rightDateDiff

  const leftName = getTransactionDisplayName(left) ?? ''
  const rightName = getTransactionDisplayName(right) ?? ''
  return leftName.localeCompare(rightName) || left.id.localeCompare(right.id)
}

export function getTransactionDisplayName(transaction: InternalTransferTransactionLike) {
  return transaction.merchantNormalized ?? transaction.merchantRaw ?? transaction.description ?? null
}

export function isTransferCandidateWithinPastDays(
  sourceTxnDate: string,
  candidateTxnDate: string,
  maxPastDays: number,
) {
  const sourceDay = parseCalendarDateToDayNumber(sourceTxnDate)
  const candidateDay = parseCalendarDateToDayNumber(candidateTxnDate)
  if (sourceDay === null || candidateDay === null) return false

  const diff = sourceDay - candidateDay
  return diff >= 0 && diff <= maxPastDays
}

export function hasExactTransferCandidateAmount(
  sourceAmount: number,
  candidateAmount: number,
) {
  return Math.abs(sourceAmount) === Math.abs(candidateAmount)
}

function getDateDiffDays(left: string, right: string) {
  const leftDay = parseCalendarDateToDayNumber(left)
  const rightDay = parseCalendarDateToDayNumber(right)
  if (leftDay === null || rightDay === null) return Number.MAX_SAFE_INTEGER
  return Math.abs(leftDay - rightDay)
}

function parseCalendarDateToDayNumber(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const [, year, month, day] = match
  return Math.floor(Date.UTC(Number(year), Number(month) - 1, Number(day)) / DAY_MS)
}
