import type { DatePeriod } from '@/lib/date-periods'

export interface DashboardFilters {
  period: DatePeriod
  accountId: string
  categoryId: string
  groupId: string
  subgroupId: string
}

export interface OverviewFilterOption {
  value: string
  label: string
}

export interface OverviewAccount {
  id: string
  product_name: string
  nickname: string | null
}

export interface OverviewCategory {
  id: number
  name: string
  group_id: number | null
  subgroup_id: number | null
  category_group: { id: number; name: string } | null
  category_subgroup: { id: number; name: string; group_id: number } | null
}

export interface CashFlowDataPoint {
  month: string
  income: number
  expenses: number
}

export interface CashFlowTransaction {
  txn_date: string
  txn_type: string
  amount: number
}

export const DEFAULT_OVERVIEW_FILTERS: DashboardFilters = {
  period: 'this_month',
  accountId: 'all',
  categoryId: 'all',
  groupId: 'all',
  subgroupId: 'all',
}

export function nextFiltersForGroupChange(filters: DashboardFilters, groupId: string): DashboardFilters {
  return {
    ...filters,
    groupId,
    subgroupId: 'all',
    categoryId: 'all',
  }
}

export function nextFiltersForSubgroupChange(filters: DashboardFilters, subgroupId: string): DashboardFilters {
  return {
    ...filters,
    subgroupId,
    categoryId: 'all',
  }
}

export function resolveScopedCategoryIds(categories: OverviewCategory[], filters: DashboardFilters): number[] {
  return categories
    .filter((category) => filters.groupId === 'all' || String(category.group_id) === filters.groupId)
    .filter((category) => filters.subgroupId === 'all' || String(category.subgroup_id) === filters.subgroupId)
    .filter((category) => filters.categoryId === 'all' || String(category.id) === filters.categoryId)
    .map((category) => category.id)
}

export function deriveOverviewFilterOptions(params: {
  accounts: OverviewAccount[]
  categories: OverviewCategory[]
  filters: DashboardFilters
}) {
  const accountOptions: OverviewFilterOption[] = params.accounts
    .map((account) => ({
      value: account.id,
      label: account.nickname?.trim() || account.product_name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const groupMap = new Map<number, string>()
  for (const category of params.categories) {
    if (category.category_group) {
      groupMap.set(category.category_group.id, category.category_group.name)
    }
  }

  const groupOptions: OverviewFilterOption[] = Array.from(groupMap.entries())
    .map(([id, label]) => ({ value: String(id), label }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const subgroupMap = new Map<number, { name: string; groupId: number }>()
  for (const category of params.categories) {
    if (!category.category_subgroup) continue
    if (params.filters.groupId !== 'all' && String(category.category_subgroup.group_id) !== params.filters.groupId) {
      continue
    }

    subgroupMap.set(category.category_subgroup.id, {
      name: category.category_subgroup.name,
      groupId: category.category_subgroup.group_id,
    })
  }

  const subgroupOptions: OverviewFilterOption[] = Array.from(subgroupMap.entries())
    .map(([id, row]) => ({ value: String(id), label: row.name }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const categoryOptions: OverviewFilterOption[] = params.categories
    .filter((category) => {
      if (params.filters.groupId !== 'all' && String(category.group_id) !== params.filters.groupId) return false
      if (params.filters.subgroupId !== 'all' && String(category.subgroup_id) !== params.filters.subgroupId) {
        return false
      }
      return true
    })
    .map((category) => ({ value: String(category.id), label: category.name }))
    .sort((a, b) => a.label.localeCompare(b.label))

  return {
    accountOptions,
    groupOptions,
    subgroupOptions,
    categoryOptions,
  }
}

export function computeCashFlowData(
  transactions: CashFlowTransaction[],
  nowInput: Date = new Date(),
  monthCount = 6,
): CashFlowDataPoint[] {
  const monthKeyFromDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

  const now = new Date(nowInput)
  const rowsByMonth = new Map<string, { income: number; expenses: number }>()

  for (const transaction of transactions) {
    const monthKey = transaction.txn_date.slice(0, 7)
    const existing = rowsByMonth.get(monthKey) ?? { income: 0, expenses: 0 }
    if (transaction.txn_type === 'credit') {
      existing.income += Math.abs(Number(transaction.amount) || 0)
    } else if (transaction.txn_type === 'debit') {
      existing.expenses += Math.abs(Number(transaction.amount) || 0)
    }
    rowsByMonth.set(monthKey, existing)
  }

  return Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1 - index), 1)
    const monthKey = monthKeyFromDate(date)
    const monthData = rowsByMonth.get(monthKey) ?? { income: 0, expenses: 0 }

    return {
      month: date.toLocaleDateString('en-SG', { month: 'short' }),
      income: monthData.income,
      expenses: monthData.expenses,
    }
  })
}
