import { normalizeMerchantName } from '@/lib/receipts/normalization'

const AUTO_SUGGESTION_THRESHOLD = 0.7
const AUTO_SUGGESTION_LEAD_GAP = 0.1
const MANUAL_CANDIDATE_THRESHOLD = 0.5

const AMOUNT_WEIGHT = 0.45
const DATE_WEIGHT = 0.3
const MERCHANT_WEIGHT = 0.25

export interface ReceiptMatchInput {
  merchantRaw: string | null
  receiptDate: string
  totalAmount: number
  currency: string | null
}

export interface StatementTxnForMatch {
  id: string
  txn_date: string
  merchant_raw: string | null
  merchant_normalized: string | null
  description: string | null
  amount: number
  currency: string
  txn_type: string
}

export interface MatchSignals {
  source: 'auto_suggestion' | 'manual_candidate_pick' | 'user_direct'
  amountScore: number
  dateScore: number
  merchantScore: number
  windowDays: number
  purchasePreferred: boolean
  merchantExact: boolean
  merchantTokenOverlap: number
  amountDelta: number
}

export interface StatementMatchCandidate {
  statementTransactionId: string
  txnDate: string
  merchantRaw: string | null
  description: string | null
  amount: number
  currency: string
  txnType: string
  confidence: number
  signals: Omit<MatchSignals, 'source'>
}

export interface StatementMatchResult {
  autoSuggestion: StatementMatchCandidate | null
  candidates: StatementMatchCandidate[]
  scored: StatementMatchCandidate[]
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000
}

function toDateOnly(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value for statement matching: ${value}`)
  }

  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function signedDayDifference(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00Z`)
  const to = new Date(`${toDate}T00:00:00Z`)
  const ms = to.getTime() - from.getTime()
  return Math.round(ms / (24 * 60 * 60 * 1000))
}

function tokenize(value: string) {
  return value
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
}

function tokenOverlapScore(left: string, right: string) {
  const leftSet = new Set(tokenize(left))
  const rightSet = new Set(tokenize(right))

  if (leftSet.size === 0 || rightSet.size === 0) return 0

  let intersection = 0
  for (const token of leftSet) {
    if (rightSet.has(token)) intersection += 1
  }

  const denominator = Math.max(leftSet.size, rightSet.size)
  if (!denominator) return 0
  return clamp01(intersection / denominator)
}

function scoreAmount(receiptAmount: number, statementAmount: number) {
  const delta = Math.abs(Math.abs(receiptAmount) - Math.abs(statementAmount))

  if (delta <= 0.01) return { score: 1, delta }
  if (delta <= 0.1) return { score: 0.95, delta }
  if (delta <= 0.5) return { score: 0.85, delta }
  if (delta <= 1) return { score: 0.75, delta }
  if (delta <= 2) return { score: 0.6, delta }
  if (delta <= 5) return { score: 0.35, delta }
  return { score: 0, delta }
}

function scoreDate(receiptDate: string, statementDate: string) {
  const days = signedDayDifference(receiptDate, statementDate)
  if (days === 0) return { score: 1, days }
  if (days === -1 || days === 1) return { score: 0.75, days }
  if (days === 2) return { score: 0.55, days }
  return { score: 0, days }
}

function scoreMerchant(receiptMerchant: string | null, statementMerchant: string | null, statementNormalized: string | null) {
  const left = normalizeMerchantForMatch(receiptMerchant)
  const rightRaw = normalizeMerchantForMatch(statementMerchant)
  const rightNorm = normalizeMerchantForMatch(statementNormalized)
  const right = rightNorm || rightRaw

  if (!left || !right) {
    return {
      score: 0,
      exact: false,
      overlap: 0,
    }
  }

  if (left === right) {
    return {
      score: 1,
      exact: true,
      overlap: 1,
    }
  }

  if ((left.includes(right) || right.includes(left)) && Math.min(left.length, right.length) >= 4) {
    return {
      score: 0.9,
      exact: false,
      overlap: tokenOverlapScore(left, right),
    }
  }

  const overlap = tokenOverlapScore(left, right)
  const score = overlap >= 0.75 ? 0.85 : overlap >= 0.5 ? 0.7 : overlap >= 0.3 ? 0.45 : 0

  return {
    score,
    exact: false,
    overlap,
  }
}

export function normalizeMerchantForMatch(value?: string | null) {
  return normalizeMerchantName(value)
}

export function scoreStatementCandidate(receipt: ReceiptMatchInput, statementTxn: StatementTxnForMatch): StatementMatchCandidate {
  const normalizedReceiptDate = toDateOnly(receipt.receiptDate)
  const normalizedTxnDate = toDateOnly(statementTxn.txn_date)

  const amount = scoreAmount(receipt.totalAmount, Number(statementTxn.amount || 0))
  const date = scoreDate(normalizedReceiptDate, normalizedTxnDate)
  const merchant = scoreMerchant(receipt.merchantRaw, statementTxn.merchant_raw, statementTxn.merchant_normalized)

  const isPurchasePreferred = statementTxn.txn_type === 'debit' || statementTxn.txn_type === 'unknown'

  const confidence = clamp01(
    amount.score * AMOUNT_WEIGHT
      + date.score * DATE_WEIGHT
      + merchant.score * MERCHANT_WEIGHT,
  )

  return {
    statementTransactionId: statementTxn.id,
    txnDate: normalizedTxnDate,
    merchantRaw: statementTxn.merchant_raw,
    description: statementTxn.description,
    amount: Number(statementTxn.amount || 0),
    currency: statementTxn.currency,
    txnType: statementTxn.txn_type,
    confidence: round4(confidence),
    signals: {
      amountScore: round4(amount.score),
      dateScore: round4(date.score),
      merchantScore: round4(merchant.score),
      windowDays: date.days,
      purchasePreferred: isPurchasePreferred,
      merchantExact: merchant.exact,
      merchantTokenOverlap: round4(merchant.overlap),
      amountDelta: round4(amount.delta),
    },
  }
}

export function findStatementCandidatesForReceipt(params: {
  receipt: ReceiptMatchInput
  statementTransactions: StatementTxnForMatch[]
}) {
  const scored = params.statementTransactions
    .map((txn) => scoreStatementCandidate(params.receipt, txn))
    .sort((left, right) => {
      if (right.confidence !== left.confidence) return right.confidence - left.confidence
      if (Number(right.signals.purchasePreferred) !== Number(left.signals.purchasePreferred)) {
        return Number(right.signals.purchasePreferred) - Number(left.signals.purchasePreferred)
      }

      if (Math.abs(left.signals.windowDays) !== Math.abs(right.signals.windowDays)) {
        return Math.abs(left.signals.windowDays) - Math.abs(right.signals.windowDays)
      }

      return left.signals.amountDelta - right.signals.amountDelta
    })

  const candidates = scored.filter((candidate) => candidate.confidence >= MANUAL_CANDIDATE_THRESHOLD)

  const top = scored[0] ?? null
  const second = scored[1] ?? null

  const leadGap = top && second ? top.confidence - second.confidence : top ? 1 : 0
  const autoSuggestion =
    top && top.confidence >= AUTO_SUGGESTION_THRESHOLD && leadGap >= AUTO_SUGGESTION_LEAD_GAP
      ? top
      : null

  const result: StatementMatchResult = {
    autoSuggestion,
    candidates,
    scored,
  }

  return result
}
