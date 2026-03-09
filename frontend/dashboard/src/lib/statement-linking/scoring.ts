import { classifyLinkType } from './effect'
import type { LinkCandidate, LinkScoreResult } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

function dayDiff(a: string, b: string) {
  return Math.abs(Math.round((new Date(a).getTime() - new Date(b).getTime()) / DAY_MS))
}

export function scoreCandidate(candidate: LinkCandidate): LinkScoreResult {
  const absAmountDiff = Math.abs(Math.abs(candidate.sourceAmount) - Math.abs(candidate.targetAmount))
  const amountScore = absAmountDiff === 0 ? 1 : absAmountDiff <= 0.01 ? 0.95 : absAmountDiff <= 1 ? 0.5 : 0

  const sourceDirection = String(candidate.sourceTxnType).toLowerCase() === 'credit' ? 'credit' : 'debit'
  const targetDirection = String(candidate.targetTxnType).toLowerCase() === 'credit' ? 'credit' : 'debit'
  const oppositeDirection = sourceDirection !== targetDirection
  const directionScore = oppositeDirection ? 1 : 0

  const diffDays = dayDiff(candidate.sourceTxnDate, candidate.targetTxnDate)
  const dateScore = diffDays === 0 ? 1 : diffDays <= 1 ? 0.8 : diffDays <= 3 ? 0.5 : 0

  const sameAccount = candidate.sourceAccountId === candidate.targetAccountId
  const accountScore = sameAccount ? 0 : 1

  const effect = classifyLinkType(candidate)

  const weighted = amountScore * 0.35 + directionScore * 0.2 + dateScore * 0.2 + accountScore * 0.1 + effect.accountCompatibility * 0.15
  const score = Math.max(0, Math.min(1, Number(weighted.toFixed(4))))

  return {
    score,
    linkType: effect.type,
    reason: {
      amount: { absAmountDiff, amountScore },
      direction: { sourceDirection, targetDirection, oppositeDirection, directionScore },
      date: { diffDays, dateScore },
      account: { sameAccount, accountScore, sourceAccountType: candidate.sourceAccountType, targetAccountType: candidate.targetAccountType },
      descriptorClues: effect.clues,
      accountCompatibility: effect.accountCompatibility,
    },
  }
}
