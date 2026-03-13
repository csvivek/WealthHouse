import { describe, expect, it } from 'vitest'
import {
  computeCashFlowData,
  DEFAULT_OVERVIEW_FILTERS,
  deriveOverviewFilterOptions,
  isDefaultOverviewFilterSelection,
  nextFiltersForGroupChange,
  nextFiltersForSubgroupChange,
  resolveScopedCategoryIds,
  type OverviewCategory,
} from '@/lib/overview-filters'

const categories: OverviewCategory[] = [
  {
    id: 1,
    name: 'Groceries',
    group_id: 10,
    subgroup_id: 100,
    category_group: { id: 10, name: 'Living' },
    category_subgroup: { id: 100, name: 'Food', group_id: 10 },
  },
  {
    id: 2,
    name: 'Dining',
    group_id: 10,
    subgroup_id: 100,
    category_group: { id: 10, name: 'Living' },
    category_subgroup: { id: 100, name: 'Food', group_id: 10 },
  },
  {
    id: 3,
    name: 'Taxi',
    group_id: 20,
    subgroup_id: 200,
    category_group: { id: 20, name: 'Transport' },
    category_subgroup: { id: 200, name: 'Daily Commute', group_id: 20 },
  },
]

describe('overview filter helpers', () => {
  it('identifies untouched default dashboard filters', () => {
    expect(isDefaultOverviewFilterSelection({ ...DEFAULT_OVERVIEW_FILTERS })).toBe(true)
    expect(
      isDefaultOverviewFilterSelection({ ...DEFAULT_OVERVIEW_FILTERS, period: 'all_history' }),
    ).toBe(false)
    expect(
      isDefaultOverviewFilterSelection({ ...DEFAULT_OVERVIEW_FILTERS, accountId: 'account-1' }),
    ).toBe(false)
  })

  it('resets subgroup and category when group changes', () => {
    const next = nextFiltersForGroupChange(
      { ...DEFAULT_OVERVIEW_FILTERS, subgroupId: '100', categoryId: '1' },
      '20',
    )

    expect(next.groupId).toBe('20')
    expect(next.subgroupId).toBe('all')
    expect(next.categoryId).toBe('all')
  })

  it('resets category when subgroup changes', () => {
    const next = nextFiltersForSubgroupChange(
      { ...DEFAULT_OVERVIEW_FILTERS, categoryId: '1' },
      '100',
    )

    expect(next.subgroupId).toBe('100')
    expect(next.categoryId).toBe('all')
  })

  it('derives options and scoped category ids correctly', () => {
    const filters = { ...DEFAULT_OVERVIEW_FILTERS, groupId: '10' as const }
    const options = deriveOverviewFilterOptions({
      accounts: [
        { id: 'a2', product_name: 'DBS', nickname: null },
        { id: 'a1', product_name: 'OCBC', nickname: 'Primary' },
      ],
      categories,
      filters,
    })

    expect(options.accountOptions.map((item) => item.label)).toEqual(['DBS', 'Primary'])
    expect(options.groupOptions.map((item) => item.label)).toEqual(['Living', 'Transport'])
    expect(options.subgroupOptions.map((item) => item.label)).toEqual(['Food'])
    expect(options.categoryOptions.map((item) => item.label)).toEqual(['Dining', 'Groceries'])

    const scopedIds = resolveScopedCategoryIds(categories, {
      ...filters,
      subgroupId: '100',
      categoryId: '2',
    })
    expect(scopedIds).toEqual([2])
  })
})

describe('cash flow helper', () => {
  it('builds six-month data points and aggregates by month', () => {
    const rows = computeCashFlowData(
      [
        { txn_date: '2026-01-15', txn_type: 'payment', amount: 1000 },
        { txn_date: '2026-01-20', txn_type: 'purchase', amount: 250 },
        { txn_date: '2026-02-01', txn_type: 'purchase', amount: 100 },
      ],
      new Date('2026-02-10T00:00:00.000Z'),
    )

    expect(rows).toHaveLength(6)
    expect(rows[4]).toMatchObject({ month: 'Jan', income: 1000, expenses: 250 })
    expect(rows[5]).toMatchObject({ month: 'Feb', income: 0, expenses: 100 })
  })
})
