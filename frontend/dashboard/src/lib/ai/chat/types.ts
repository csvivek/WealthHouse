export type ChatIntent =
  | 'spending'
  | 'net_worth'
  | 'cash_flow'
  | 'advances'
  | 'transactions'
  | 'financial_advice'
  | 'general'

export type ChatCurrencyMode = 'segment_by_currency' | 'single_currency'

export interface ChatAccountSummary {
  id: string
  name: string
  productName: string
  nickname: string | null
  institutionName: string | null
  identifierHint: string | null
  accountType: string
  currency: string
}

export interface ChatCoverageRange {
  start: string | null
  end: string | null
}

export interface ChatCoverage {
  transactions: ChatCoverageRange
  ledger: ChatCoverageRange
  statementSummaries: ChatCoverageRange
}

export interface ChatSessionPayload {
  userDisplayName: string | null
  householdId: string
  householdName: string | null
  baseCurrency: string
  accounts: ChatAccountSummary[]
  promptChips: string[]
  coverage: ChatCoverage
}

export interface ChatAssistantContext {
  intent: ChatIntent
  periodLabel: string
  dateFrom: string | null
  dateTo: string | null
  comparisonDateFrom: string | null
  comparisonDateTo: string | null
  comparisonPeriodLabel: string | null
  accountIds: string[]
  accountNames: string[]
  merchant: string | null
  categoryNames: string[]
  counterpartyName: string | null
  currencyMode: ChatCurrencyMode
  groupBy: 'merchant' | 'category' | 'month' | 'account' | 'none'
  nextCursor: string | null
  dataAvailability: 'available' | 'no_match' | 'unavailable' | 'missing_account' | 'out_of_scope'
}

export interface ChatHistoryItem {
  role: 'user' | 'assistant'
  content: string
  assistantContext?: ChatAssistantContext | null
}

export interface ChatRouteDecision {
  intent: ChatIntent
  periodLabel: string
  dateFrom: string | null
  dateTo: string | null
  comparisonDateFrom: string | null
  comparisonDateTo: string | null
  comparisonPeriodLabel: string | null
  accountIds: string[]
  merchant: string | null
  categoryNames: string[]
  counterpartyName: string | null
  institutionName: string | null
  currencyMode: ChatCurrencyMode
  groupBy: 'merchant' | 'category' | 'month' | 'account' | 'none'
  limit: number
  cursor: string | null
  missingAccountName: string | null
  missingInstitutionName: string | null
  requiresAccountSummary: boolean
}

export interface ChatToolContext {
  householdId: string
  baseCurrency: string
  accounts: ChatAccountSummary[]
  coverage: ChatCoverage
}

export interface ChatTurnParams {
  message: string
  history: ChatHistoryItem[]
  session: ChatSessionPayload
}
