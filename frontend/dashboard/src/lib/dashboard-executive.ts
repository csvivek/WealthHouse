import { DATE_PERIOD_LABELS, resolveDatePeriodRange, type DatePeriod } from '@/lib/date-periods'
import { normalizeTxnDirection } from '@/lib/transactions/txn-direction'

export type ExecutivePrimaryPeriod =
  | 'this_week'
  | 'this_month'
  | 'this_quarter'
  | 'this_year'

export interface ExecutiveCategoryLike {
  name: string
  color_hex: string | null
  color_token: string | null
}

export interface ExecutiveTransactionLike {
  txn_date: string
  txn_type: string
  amount: number
  category_id: number | null
}

export interface ExecutiveAdvanceLike {
  status: string
  expected_recovery_amount: number
  counterparties?: { name: string | null } | null
}

export interface ExecutiveSpendRow {
  key: string
  label: string
  amount: number
  share: number
  colorHex: string | null
  colorToken: string | null
}

export interface ExecutiveSpendBreakdown {
  rows: ExecutiveSpendRow[]
  total: number
}

export interface ExecutiveTrendPoint {
  label: string
  isoDate: string
  value: number
}

export interface ExecutivePendingAdvancesSummary {
  totalOutstanding: number
  advanceCount: number
  counterpartyCount: number
}

export interface ExecutivePeriodSummary {
  label: string
  rangeLabel: string
  spendLabel: string
  incomeLabel: string
}

export const EXECUTIVE_PRIMARY_PERIODS: Array<{
  value: ExecutivePrimaryPeriod
  label: string
}> = [
  { value: 'this_week', label: DATE_PERIOD_LABELS.this_week },
  { value: 'this_month', label: DATE_PERIOD_LABELS.this_month },
  { value: 'this_quarter', label: DATE_PERIOD_LABELS.this_quarter },
  { value: 'this_year', label: DATE_PERIOD_LABELS.this_year },
]

const MONTHLY_PERIODS = new Set<DatePeriod>(['this_month', 'last_month'])
const QUARTERLY_PERIODS = new Set<DatePeriod>(['this_quarter', 'last_quarter'])
const YEARLY_PERIODS = new Set<DatePeriod>(['this_year', 'last_year', 'all_history'])

function toIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function startOfQuarter(date: Date) {
  const month = Math.floor(date.getMonth() / 3) * 3
  return new Date(date.getFullYear(), month, 1)
}

function monthLabel(date: Date) {
  return date.toLocaleDateString('en-SG', { month: 'short' })
}

function weekdayLabel(date: Date) {
  return date.toLocaleDateString('en-SG', { weekday: 'short' })
}

function shortMonthDay(date: Date) {
  return date.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' })
}

function rangeLabel(start: string | null, end: string | null) {
  if (!start && !end) return 'All history'
  if (!start || !end) return start ?? end ?? 'All history'

  const startDate = new Date(start)
  const endDate = new Date(end)

  if (
    startDate.getFullYear() === endDate.getFullYear()
    && startDate.getMonth() === endDate.getMonth()
    && startDate.getDate() === 1
    && endDate.getDate() === endOfMonth(endDate).getDate()
  ) {
    return startDate.toLocaleDateString('en-SG', { month: 'short', year: 'numeric' })
  }

  if (
    startDate.getFullYear() === endDate.getFullYear()
    && startDate.getMonth() === endDate.getMonth()
  ) {
    return `${shortMonthDay(startDate)} – ${endDate.getDate()}`
  }

  return `${shortMonthDay(startDate)} – ${shortMonthDay(endDate)}`
}

function monthlyBuckets(start: Date, end: Date) {
  const buckets: Array<{ start: string; end: string; label: string }> = []
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1)

  while (cursor <= end) {
    const bucketStart = cursor < start ? start : cursor
    const bucketEnd = endOfMonth(cursor) > end ? end : endOfMonth(cursor)
    buckets.push({
      start: toIsoDate(bucketStart),
      end: toIsoDate(bucketEnd),
      label: monthLabel(bucketEnd),
    })
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }

  return buckets
}

function weeklyBuckets(start: Date, end: Date) {
  const buckets: Array<{ start: string; end: string; label: string }> = []
  let cursor = new Date(start)

  while (cursor <= end) {
    const bucketEnd = addDays(cursor, 6) > end ? end : addDays(cursor, 6)
    buckets.push({
      start: toIsoDate(cursor),
      end: toIsoDate(bucketEnd),
      label: String(bucketEnd.getDate()),
    })
    cursor = addDays(bucketEnd, 1)
  }

  return buckets
}

function dailyBuckets(start: Date, end: Date) {
  const buckets: Array<{ start: string; end: string; label: string }> = []
  let cursor = new Date(start)

  while (cursor <= end) {
    buckets.push({
      start: toIsoDate(cursor),
      end: toIsoDate(cursor),
      label: weekdayLabel(cursor),
    })
    cursor = addDays(cursor, 1)
  }

  return buckets
}

function resolveTrendBuckets(period: DatePeriod, nowInput: Date = new Date()) {
  const now = new Date(nowInput)

  if (period === 'all_history') {
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    return monthlyBuckets(start, end)
  }

  const range = resolveDatePeriodRange(period, now)
  const start = range.start ? new Date(range.start) : startOfMonth(now)
  const end = range.end ? new Date(range.end) : now

  if (period === 'this_week' || period === 'last_week') return dailyBuckets(start, end)
  if (MONTHLY_PERIODS.has(period)) return weeklyBuckets(start, end)
  if (QUARTERLY_PERIODS.has(period) || YEARLY_PERIODS.has(period)) return monthlyBuckets(start, end)
  return monthlyBuckets(start, end)
}

function sumBucketCashFlow(
  transactions: ExecutiveTransactionLike[],
  start: string,
  end: string,
) {
  return transactions.reduce((sum, transaction) => {
    if (transaction.txn_date < start || transaction.txn_date > end) return sum

    const direction = normalizeTxnDirection(transaction.txn_type)
    if (direction === 'credit') return sum + Math.abs(transaction.amount)
    if (direction === 'debit') return sum - Math.abs(transaction.amount)
    return sum
  }, 0)
}

export function isExecutivePrimaryPeriod(period: DatePeriod): period is ExecutivePrimaryPeriod {
  return EXECUTIVE_PRIMARY_PERIODS.some((candidate) => candidate.value === period)
}

export function buildExecutivePeriodSummary(
  period: DatePeriod,
  nowInput: Date = new Date(),
): ExecutivePeriodSummary {
  const now = new Date(nowInput)
  const { start, end } = resolveDatePeriodRange(period, now)
  const isThisYear = period === 'this_year'

  return {
    label: DATE_PERIOD_LABELS[period],
    rangeLabel:
      period === 'this_quarter'
        ? `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`
        : period === 'last_quarter'
          ? (() => {
              const lastQuarter = startOfQuarter(new Date(now.getFullYear(), now.getMonth() - 3, 1))
              return `Q${Math.floor(lastQuarter.getMonth() / 3) + 1} ${lastQuarter.getFullYear()}`
            })()
          : period === 'this_year'
            ? `${now.getFullYear()} YTD`
            : period === 'last_year'
              ? `${now.getFullYear() - 1}`
              : rangeLabel(start, end),
    spendLabel:
      period === 'this_week' || period === 'last_week'
        ? 'Week Spend'
        : isThisYear
          ? 'YTD Spend'
          : period === 'all_history'
            ? 'Total Spend'
            : QUARTERLY_PERIODS.has(period)
              ? 'Quarter Spend'
              : 'Month Spend',
    incomeLabel:
      period === 'this_week' || period === 'last_week'
        ? 'Week Income'
        : isThisYear
          ? 'YTD Income'
          : period === 'all_history'
            ? 'Total Income'
            : QUARTERLY_PERIODS.has(period)
              ? 'Quarter Income'
              : 'Month Income',
  }
}

export function buildExecutiveSpendBreakdown(params: {
  transactions: ExecutiveTransactionLike[]
  categoriesById: Map<number, ExecutiveCategoryLike>
  limit?: number
}): ExecutiveSpendBreakdown {
  const grouped = new Map<string, ExecutiveSpendRow>()

  for (const transaction of params.transactions) {
    if (normalizeTxnDirection(transaction.txn_type) !== 'debit') continue

    const category =
      transaction.category_id != null ? params.categoriesById.get(transaction.category_id) : null
    const label = category?.name ?? 'Uncategorized'
    const amount = Math.abs(transaction.amount)
    const current = grouped.get(label) ?? {
      key: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      label,
      amount: 0,
      share: 0,
      colorHex: category?.color_hex ?? null,
      colorToken: category?.color_token ?? null,
    }

    current.amount += amount
    grouped.set(label, current)
  }

  const total = Array.from(grouped.values()).reduce((sum, row) => sum + row.amount, 0)
  const sorted = Array.from(grouped.values()).sort((left, right) => right.amount - left.amount)
  const limit = Math.max(1, params.limit ?? 5)

  let rows = sorted
  if (sorted.length > limit) {
    const topRows = sorted.slice(0, limit - 1)
    const otherAmount = sorted.slice(limit - 1).reduce((sum, row) => sum + row.amount, 0)
    rows = [
      ...topRows,
      {
        key: 'other',
        label: 'Other',
        amount: otherAmount,
        share: 0,
        colorHex: null,
        colorToken: 'chart-5',
      },
    ]
  }

  return {
    total,
    rows: rows.map((row) => ({
      ...row,
      share: total > 0 ? row.amount / total : 0,
    })),
  }
}

export function buildPendingAdvancesSummary(
  advances: ExecutiveAdvanceLike[],
): ExecutivePendingAdvancesSummary {
  const pending = advances.filter((advance) => ['pending', 'partial'].includes(advance.status))
  const counterpartyNames = new Set(
    pending
      .map((advance) => advance.counterparties?.name?.trim() ?? '')
      .filter((name) => name.length > 0),
  )

  return {
    totalOutstanding: pending.reduce(
      (sum, advance) => sum + Math.abs(advance.expected_recovery_amount || 0),
      0,
    ),
    advanceCount: pending.length,
    counterpartyCount: counterpartyNames.size,
  }
}

export function buildNetWorthProxySeries(params: {
  transactions: ExecutiveTransactionLike[]
  netWorth: number
  period: DatePeriod
  nowInput?: Date
}): ExecutiveTrendPoint[] {
  const buckets = resolveTrendBuckets(params.period, params.nowInput)
  if (buckets.length === 0) {
    return [{ label: 'Now', isoDate: toIsoDate(params.nowInput ?? new Date()), value: params.netWorth }]
  }

  const bucketChanges = buckets.map((bucket) =>
    sumBucketCashFlow(params.transactions, bucket.start, bucket.end),
  )

  let cumulativeAfter = 0
  const points = new Array<ExecutiveTrendPoint>(buckets.length)

  for (let index = buckets.length - 1; index >= 0; index -= 1) {
    points[index] = {
      label: buckets[index].label,
      isoDate: buckets[index].end,
      value: params.netWorth - cumulativeAfter,
    }
    cumulativeAfter += bucketChanges[index]
  }

  return points
}
