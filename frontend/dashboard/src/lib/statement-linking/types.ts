export type LinkType = 'internal_transfer' | 'credit_card_payment' | 'loan_repayment'

export type LinkStatus = 'needs_review' | 'confirmed' | 'approved' | 'auto_approved' | 'rejected'

export interface LinkCandidate {
  sourceKind: 'staging' | 'committed'
  sourceId: string
  sourceAccountId: string
  sourceAccountType: string | null
  sourceTxnDate: string
  sourceAmount: number
  sourceTxnType: string
  sourceDescription: string
  sourceReference: string | null

  targetKind: 'staging' | 'committed'
  targetId: string
  targetAccountId: string
  targetAccountType: string | null
  targetTxnDate: string
  targetAmount: number
  targetTxnType: string
  targetDescription: string
  targetReference: string | null
}

export interface LinkScoreResult {
  score: number
  linkType: LinkType | null
  reason: Record<string, unknown>
}

export interface SuggestedLink {
  fromStagingId: string
  toStagingId: string | null
  toTransactionId: string | null
  linkType: LinkType
  linkScore: number
  linkReason: Record<string, unknown>
  status: LinkStatus
  matchedBy: 'system' | 'user'
}
