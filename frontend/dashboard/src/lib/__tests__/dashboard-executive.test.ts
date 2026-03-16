import { describe, expect, it } from 'vitest'
import {
  buildExecutivePeriodSummary,
  buildExecutiveSpendBreakdown,
  buildNetWorthProxySeries,
  buildPendingAdvancesSummary,
  isExecutivePrimaryPeriod,
} from '@/lib/dashboard-executive'

describe('dashboard executive helpers', () => {
  it('identifies the four primary executive periods', () => {
    expect(isExecutivePrimaryPeriod('this_week')).toBe(true)
    expect(isExecutivePrimaryPeriod('this_month')).toBe(true)
    expect(isExecutivePrimaryPeriod('last_month')).toBe(false)
    expect(isExecutivePrimaryPeriod('all_history')).toBe(false)

    expect(buildExecutivePeriodSummary('this_year', new Date('2026-03-14T09:00:00Z'))).toMatchObject({
      spendLabel: 'YTD Spend',
      incomeLabel: 'YTD Income',
      rangeLabel: '2026 YTD',
    })
  })

  it('builds a spend breakdown from debit transactions only', () => {
    const breakdown = buildExecutiveSpendBreakdown({
      transactions: [
        { txn_date: '2026-03-10', txn_type: 'purchase', amount: -120, category_id: 1 },
        { txn_date: '2026-03-11', txn_type: 'purchase', amount: -80, category_id: 1 },
        { txn_date: '2026-03-12', txn_type: 'purchase', amount: -50, category_id: 2 },
        { txn_date: '2026-03-13', txn_type: 'salary', amount: 3000, category_id: 1 },
      ],
      categoriesById: new Map([
        [1, { name: 'Dining', color_hex: null, color_token: 'chart-1' }],
        [2, { name: 'Groceries', color_hex: '#22c55e', color_token: null }],
      ]),
    })

    expect(breakdown.total).toBe(250)
    expect(breakdown.rows).toEqual([
      expect.objectContaining({ label: 'Dining', amount: 200, share: 0.8 }),
      expect.objectContaining({ label: 'Groceries', amount: 50, share: 0.2 }),
    ])
  })

  it('summarizes pending and partial advances only', () => {
    const summary = buildPendingAdvancesSummary([
      {
        status: 'pending',
        expected_recovery_amount: 500,
        counterparties: { name: 'Alex' },
      },
      {
        status: 'partial',
        expected_recovery_amount: 300,
        counterparties: { name: 'Alex' },
      },
      {
        status: 'settled',
        expected_recovery_amount: 999,
        counterparties: { name: 'Jamie' },
      },
    ])

    expect(summary).toEqual({
      totalOutstanding: 800,
      advanceCount: 2,
      counterpartyCount: 1,
    })
  })

  it('builds a proxy net-worth series from period cash flow', () => {
    const series = buildNetWorthProxySeries({
      transactions: [
        { txn_date: '2026-01-05', txn_type: 'salary', amount: 100, category_id: 1 },
        { txn_date: '2026-02-12', txn_type: 'purchase', amount: -20, category_id: 2 },
        { txn_date: '2026-03-01', txn_type: 'salary', amount: 30, category_id: 1 },
      ],
      netWorth: 1000,
      period: 'this_year',
      nowInput: new Date('2026-03-14T09:00:00Z'),
    })

    expect(series.map((point) => point.label)).toEqual(['Jan', 'Feb', 'Mar'])
    expect(series.map((point) => point.value)).toEqual([990, 970, 1000])
  })
})
