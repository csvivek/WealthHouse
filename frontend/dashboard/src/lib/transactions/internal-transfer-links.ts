import { normalizeTxnDirection } from './category-compatibility'

const DAY_MS = 24 * 60 * 60 * 1000

export interface InternalTransferLinkRecord {
  id?: string | null
  fromTransactionId: string
  toTransactionId: string
  linkType?: string | null
  status?: string | null
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
  const leftDirectionRank = getDirectionRank(sourceTransaction, left)
  const rightDirectionRank = getDirectionRank(sourceTransaction, right)
  if (leftDirectionRank !== rightDirectionRank) return leftDirectionRank - rightDirectionRank

  const leftAmountDiff = getAmountDiff(sourceTransaction, left)
  const rightAmountDiff = getAmountDiff(sourceTransaction, right)
  if (leftAmountDiff !== rightAmountDiff) return leftAmountDiff - rightAmountDiff

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

function getDirectionRank(
  sourceTransaction: InternalTransferTransactionLike,
  candidate: InternalTransferTransactionLike,
) {
  return normalizeTxnDirection(sourceTransaction.txnType) !== normalizeTxnDirection(candidate.txnType) ? 0 : 1
}

function getAmountDiff(
  sourceTransaction: InternalTransferTransactionLike,
  candidate: InternalTransferTransactionLike,
) {
  return Math.abs(Math.abs(sourceTransaction.amount) - Math.abs(candidate.amount))
}

function getDateDiffDays(left: string, right: string) {
  return Math.abs(Math.round((new Date(left).getTime() - new Date(right).getTime()) / DAY_MS))
}
