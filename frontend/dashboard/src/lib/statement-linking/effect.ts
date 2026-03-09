import type { LinkCandidate, LinkType } from './types'
import { detectDescriptorClues } from './keywords'

function isBankLike(accountType: string | null) {
  return accountType === 'savings' || accountType === 'current'
}

export function classifyLinkType(candidate: LinkCandidate): { type: LinkType | null; accountCompatibility: number; clues: Record<string, boolean> } {
  const clues = detectDescriptorClues(candidate.sourceDescription, candidate.targetDescription)
  const sourceAccountType = candidate.sourceAccountType
  const targetAccountType = candidate.targetAccountType

  if ((sourceAccountType === 'credit_card' || targetAccountType === 'credit_card') && clues.creditCardPayment) {
    return { type: 'credit_card_payment', accountCompatibility: 1, clues }
  }

  if ((sourceAccountType === 'loan' || targetAccountType === 'loan') && clues.loanRepayment) {
    return { type: 'loan_repayment', accountCompatibility: 1, clues }
  }

  if (isBankLike(sourceAccountType) && (isBankLike(targetAccountType) || targetAccountType === 'credit_card' || targetAccountType === 'loan') && clues.transfer) {
    return { type: 'internal_transfer', accountCompatibility: 0.8, clues }
  }

  if (sourceAccountType === 'credit_card' || targetAccountType === 'credit_card') {
    return { type: 'credit_card_payment', accountCompatibility: 0.6, clues }
  }

  if (sourceAccountType === 'loan' || targetAccountType === 'loan') {
    return { type: 'loan_repayment', accountCompatibility: 0.6, clues }
  }

  return { type: 'internal_transfer', accountCompatibility: 0.5, clues }
}
