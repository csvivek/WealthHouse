// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  buildAssistantContext,
  executeChatDataTool,
  isRangeOutsideCoverage,
  sanitizeRouteDecision,
} from '@/lib/ai/chat/tools'
import type { ChatRouteDecision, ChatSessionPayload, ChatToolContext } from '@/lib/ai/chat/types'

const session: ChatSessionPayload = {
  userDisplayName: 'Owner User',
  householdId: 'hh-1',
  householdName: 'Home',
  baseCurrency: 'SGD',
  accounts: [
    {
      id: 'acct-1',
      name: 'DBS Altitude',
      productName: 'DBS Altitude',
      nickname: null,
      institutionName: 'DBS Bank',
      identifierHint: '1234',
      accountType: 'credit_card',
      currency: 'SGD',
    },
    {
      id: 'acct-2',
      name: 'MariBank',
      productName: 'Mari Savings',
      nickname: 'MariBank',
      institutionName: 'MariBank',
      identifierHint: null,
      accountType: 'bank_account',
      currency: 'SGD',
    },
  ],
  promptChips: [],
  coverage: {
    transactions: { start: '2026-01-01', end: '2026-03-31' },
    ledger: { start: '2026-01-01', end: '2026-03-31' },
    statementSummaries: { start: '2026-01-31', end: '2026-03-31' },
  },
}

class LedgerQueryBuilder {
  public inCalls: Array<{ column: string; values: unknown[] }> = []

  constructor(private readonly rows: unknown[]) {}

  select() {
    return this
  }

  in(column: string, values: unknown[]) {
    this.inCalls.push({ column, values })
    return this
  }

  order() {
    return this
  }

  range() {
    return this
  }

  gte() {
    return this
  }

  lte() {
    return this
  }

  then<TResult1 = { data: unknown[]; error: null }>(
    onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => PromiseLike<never>) | null,
  ) {
    return Promise.resolve({ data: this.rows, error: null as null }).then(onfulfilled, onrejected)
  }
}

describe('chat tools', () => {
  it('sanitizes routing output and resolves institution-scoped account ids', () => {
    const decision = sanitizeRouteDecision({
      rawDecision: {
        intent: 'spending',
        periodLabel: 'last month',
        institutionName: 'DBS',
        accountIds: ['unknown-account'],
        groupBy: 'invalid-group',
        limit: 99,
        currencyMode: 'single_currency',
        categoryNames: ['Food'],
      },
      session,
    })

    expect(decision).toEqual(expect.objectContaining({
      intent: 'spending',
      periodLabel: 'last month',
      institutionName: 'DBS',
      accountIds: ['acct-1'],
      groupBy: 'merchant',
      limit: 25,
      currencyMode: 'single_currency',
      missingInstitutionName: null,
      requiresAccountSummary: false,
    }))
  })

  it('builds assistant context with resolved account names and pagination cursor', () => {
    const routeDecision: ChatRouteDecision = {
      intent: 'transactions',
      periodLabel: 'March 2026',
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
      comparisonDateFrom: null,
      comparisonDateTo: null,
      comparisonPeriodLabel: null,
      accountIds: ['acct-1', 'acct-2'],
      merchant: 'Grab',
      categoryNames: [],
      counterpartyName: null,
      institutionName: null,
      currencyMode: 'single_currency',
      groupBy: 'none',
      limit: 10,
      cursor: null,
      missingAccountName: null,
      missingInstitutionName: null,
      requiresAccountSummary: false,
    }

    const context = buildAssistantContext({
      routeDecision,
      toolContext: session,
      availability: 'available',
      nextCursor: 'cursor-123',
    })

    expect(context).toEqual(expect.objectContaining({
      intent: 'transactions',
      periodLabel: 'March 2026',
      accountIds: ['acct-1', 'acct-2'],
      accountNames: ['DBS Altitude', 'MariBank'],
      merchant: 'Grab',
      nextCursor: 'cursor-123',
      dataAvailability: 'available',
    }))
  })

  it('detects when a requested range falls outside imported coverage', () => {
    expect(isRangeOutsideCoverage({
      dateFrom: '2026-02-01',
      dateTo: '2026-02-29',
      coverage: session.coverage.transactions,
    })).toBe(false)

    expect(isRangeOutsideCoverage({
      dateFrom: '2025-11-01',
      dateTo: '2025-11-30',
      coverage: session.coverage.transactions,
    })).toBe(true)
  })

  it('scopes cash-flow queries to household account ids when no explicit account filter is provided', async () => {
    const ledgerQuery = new LedgerQueryBuilder([
      {
        id: 'ledger-1',
        entry_date: '2026-03-05',
        amount: 120,
        currency: 'SGD',
        merchant_display: 'Salary',
        payment_account_id: 'acct-2',
        category: {
          name: 'Salary',
          group_name: 'Income',
          payment_subtype: 'income',
          type: 'income',
        },
      },
    ])

    const result = await executeChatDataTool({
      name: 'get_cash_flow',
      args: {
        dateFrom: '2026-03-01',
        dateTo: '2026-03-31',
      },
      supabase: {
        from(table: string) {
          if (table !== 'ledger_entries') {
            throw new Error(`Unexpected table ${table}`)
          }

          return ledgerQuery as never
        },
      } as never,
      toolContext: session as ChatToolContext,
    })

    expect(ledgerQuery.inCalls).toEqual([
      { column: 'payment_account_id', values: ['acct-1', 'acct-2'] },
    ])
    expect(result).toEqual(expect.objectContaining({
      availability: 'available',
      incomeTotal: 120,
      expenseTotal: 0,
      net: 120,
    }))
  })
})
