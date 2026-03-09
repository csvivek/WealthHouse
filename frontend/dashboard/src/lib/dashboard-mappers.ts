import type { BreakdownDimension } from '@/lib/breakdown-dimensions'

export type BreakdownTab = 'payments' | 'receipts'

export interface BreakdownRowDto {
  key: string
  name: string
  transactionCount: number
  totalValue: number
  shareOfTotal: number
}

export interface BreakdownKpis {
  totalValue: number
  totalTransactions: number
  averageValue: number
  topShare: number
}

export interface BreakdownTabDto {
  rows: BreakdownRowDto[]
  kpis: BreakdownKpis
}

export interface OverviewBreakdownDto {
  dimension: BreakdownDimension
  payments: BreakdownTabDto
  receipts: BreakdownTabDto
}

export interface OverviewBreakdownRpcRow {
  tab?: string | null
  flow_type?: string | null
  kind?: string | null

  dimension_key?: string | null
  dimension_name?: string | null

  group_key?: string | null
  group_name?: string | null

  subgroup_key?: string | null
  subgroup_name?: string | null

  category_key?: string | null
  category_name?: string | null

  name?: string | null
  label?: string | null

  transaction_count?: number | string | null
  txn_count?: number | string | null
  count?: number | string | null

  total_value?: number | string | null
  total_amount?: number | string | null
  value?: number | string | null
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function normalizeTab(value: string | null | undefined): BreakdownTab | null {
  if (!value) return null
  const normalized = value.toLowerCase()
  if (['payment', 'payments', 'debit', 'expense', 'expenses'].includes(normalized)) {
    return 'payments'
  }
  if (['receipt', 'receipts', 'credit', 'income'].includes(normalized)) {
    return 'receipts'
  }
  return null
}

function pickDimensionName(row: OverviewBreakdownRpcRow, dimension: BreakdownDimension): string {
  if (dimension === 'group') {
    return row.group_name ?? row.dimension_name ?? row.label ?? row.name ?? 'Unassigned'
  }
  if (dimension === 'subgroup') {
    return row.subgroup_name ?? row.dimension_name ?? row.label ?? row.name ?? 'Unassigned'
  }
  return row.category_name ?? row.dimension_name ?? row.label ?? row.name ?? 'Unassigned'
}

function pickDimensionKey(row: OverviewBreakdownRpcRow, dimension: BreakdownDimension): string {
  if (dimension === 'group') {
    return row.group_key ?? row.dimension_key ?? pickDimensionName(row, dimension)
  }
  if (dimension === 'subgroup') {
    return row.subgroup_key ?? row.dimension_key ?? pickDimensionName(row, dimension)
  }
  return row.category_key ?? row.dimension_key ?? pickDimensionName(row, dimension)
}

function mapTabRows(
  rows: OverviewBreakdownRpcRow[],
  tab: BreakdownTab,
  dimension: BreakdownDimension,
): BreakdownTabDto {
  const filtered = rows.filter((row) => {
    const rowTab = normalizeTab(row.tab ?? row.flow_type ?? row.kind)
    return rowTab ? rowTab === tab : true
  })

  const normalized: BreakdownRowDto[] = filtered
    .map((row) => {
      const name = pickDimensionName(row, dimension)
      const key = pickDimensionKey(row, dimension)
      const transactionCount = asNumber(
        row.transaction_count ?? row.txn_count ?? row.count,
      )
      const totalValue = Math.abs(asNumber(row.total_value ?? row.total_amount ?? row.value))

      return {
        key,
        name,
        transactionCount,
        totalValue,
        shareOfTotal: 0,
      }
    })
    .filter((row) => row.totalValue > 0 || row.transactionCount > 0)
    .sort((a, b) => b.totalValue - a.totalValue || b.transactionCount - a.transactionCount || a.name.localeCompare(b.name))

  const totalValue = normalized.reduce((sum, row) => sum + row.totalValue, 0)
  const totalTransactions = normalized.reduce((sum, row) => sum + row.transactionCount, 0)

  const rowsWithShare = normalized.map((row) => ({
    ...row,
    shareOfTotal: totalValue > 0 ? row.totalValue / totalValue : 0,
  }))

  return {
    rows: rowsWithShare,
    kpis: {
      totalValue,
      totalTransactions,
      averageValue: totalTransactions > 0 ? totalValue / totalTransactions : 0,
      topShare: rowsWithShare[0]?.shareOfTotal ?? 0,
    },
  }
}

export function mapOverviewBreakdownRows(
  dimension: BreakdownDimension,
  rows: OverviewBreakdownRpcRow[],
): OverviewBreakdownDto {
  return {
    dimension,
    payments: mapTabRows(rows, 'payments', dimension),
    receipts: mapTabRows(rows, 'receipts', dimension),
  }
}
