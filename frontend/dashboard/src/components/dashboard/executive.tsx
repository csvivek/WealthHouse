'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, ChevronRight, SlidersHorizontal } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DATE_PERIOD_LABELS, type DatePeriod } from '@/lib/date-periods'
import {
  DEFAULT_OVERVIEW_FILTERS,
  nextFiltersForGroupChange,
  nextFiltersForSubgroupChange,
  type OverviewFilterOption,
} from '@/lib/overview-filters'
import type { ExecutivePrimaryPeriod, ExecutiveSpendRow, ExecutiveTrendPoint } from '@/lib/dashboard-executive'
import type { OverviewFilters } from '@/components/dashboard/OverviewFilterBar'
import { cn } from '@/lib/utils'
import { formatCurrency, formatCurrencyCompact, formatDateShort } from '@/lib/format'

interface DashboardExecutiveRailItem {
  label: string
  href: string
  active?: boolean
  badgeCount?: number
}

interface ExecutiveMetricCardProps {
  label: string
  value: string
  description: string
  tone?: 'accent' | 'green' | 'blue' | 'red'
  monoFontFamily: string
}

interface DashboardPeriodPillsProps {
  value: DatePeriod
  onChange: (period: ExecutivePrimaryPeriod) => void
}

interface DashboardScopeDrawerProps {
  filters: OverviewFilters
  accountOptions: OverviewFilterOption[]
  categoryOptions: OverviewFilterOption[]
  groupOptions: OverviewFilterOption[]
  subgroupOptions: OverviewFilterOption[]
  onChange: (filters: OverviewFilters) => void
  onReset: () => void
}

interface NetWorthTrendCardProps {
  title: string
  value: number
  currency: string
  series: ExecutiveTrendPoint[]
  rangeLabel: string
  annotation: string
  monoFontFamily: string
}

interface SpendBreakdownCardProps {
  rows: ExecutiveSpendRow[]
  total: number
  currency: string
  monoFontFamily: string
}

interface AccountSnapshotItem {
  id: string
  title: string
  subtitle: string
  value: number
  currency: string
  note: string
  tone: 'asset' | 'liability'
}

interface AccountSnapshotCardProps {
  items: AccountSnapshotItem[]
  monoFontFamily: string
}

export interface RecentTransactionLedgerItem {
  id: string
  date: string
  merchant: string
  category: string
  categoryColorHex: string | null
  categoryColorToken: string | null
  accountLabel: string
  amount: number
  currency: string
  isCredit: boolean
}

interface RecentTransactionLedgerProps {
  items: RecentTransactionLedgerItem[]
  monoFontFamily: string
}

const RAIL_FALLBACK_COLORS = [
  'var(--dashboard-chart-1)',
  'var(--dashboard-chart-2)',
  'var(--dashboard-chart-3)',
  'var(--dashboard-chart-4)',
  'var(--dashboard-chart-5)',
]

function countActiveFilters(filters: OverviewFilters) {
  return [
    filters.period !== DEFAULT_OVERVIEW_FILTERS.period,
    filters.accountId !== DEFAULT_OVERVIEW_FILTERS.accountId,
    filters.categoryId !== DEFAULT_OVERVIEW_FILTERS.categoryId,
    filters.groupId !== DEFAULT_OVERVIEW_FILTERS.groupId,
    filters.subgroupId !== DEFAULT_OVERVIEW_FILTERS.subgroupId,
  ].filter(Boolean).length
}

function resolveAccentColor(
  colorHex: string | null | undefined,
  colorToken: string | null | undefined,
  index = 0,
) {
  if (colorHex) return colorHex
  if (colorToken?.startsWith('chart-')) {
    return `var(--dashboard-${colorToken})`
  }
  return RAIL_FALLBACK_COLORS[index % RAIL_FALLBACK_COLORS.length]
}

function renderAmount(value: number, currency: string) {
  return value < 0
    ? `-${formatCurrency(Math.abs(value), currency)}`
    : formatCurrency(value, currency)
}

export function DashboardExecutiveRail({
  items,
  monoFontFamily,
}: {
  items: DashboardExecutiveRailItem[]
  monoFontFamily: string
}) {
  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-[color:var(--dashboard-border)] bg-[linear-gradient(180deg,rgba(11,15,26,0.98),rgba(11,15,26,0.94))] px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex items-center gap-3 overflow-x-auto">
        <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-[color:var(--dashboard-border-strong)] bg-[color:var(--dashboard-surface)] px-3 py-2">
          <BrandLogo variant="mark" alt="" priority className="size-10 rounded-xl" />
          <div>
            <p className="text-sm font-semibold tracking-[0.02em] text-[color:var(--dashboard-text)]">
              Wealth House
            </p>
            <p
              className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--dashboard-text-dim)]"
              style={{ fontFamily: monoFontFamily }}
            >
              Executive dashboard
            </p>
          </div>
        </div>

        <nav className="flex min-w-max items-center gap-2">
          {items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors',
                item.active
                  ? 'border-[color:var(--dashboard-accent-glow)] bg-[color:var(--dashboard-accent-dim)] text-[color:var(--dashboard-accent)]'
                  : 'border-transparent bg-transparent text-[color:var(--dashboard-text-dim)] hover:border-[color:var(--dashboard-border-strong)] hover:bg-[color:var(--dashboard-surface)] hover:text-[color:var(--dashboard-text)]',
              )}
            >
              <span>{item.label}</span>
              {item.badgeCount && item.badgeCount > 0 ? (
                <span
                  className="rounded-full bg-[color:var(--dashboard-accent)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--dashboard-bg)]"
                  style={{ fontFamily: monoFontFamily }}
                >
                  {item.badgeCount}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}

export function ExecutiveMetricCard({
  label,
  value,
  description,
  tone = 'accent',
  monoFontFamily,
}: ExecutiveMetricCardProps) {
  const toneClassName = {
    accent: 'text-[color:var(--dashboard-accent)]',
    green: 'text-[color:var(--dashboard-success)]',
    blue: 'text-[color:var(--dashboard-info)]',
    red: 'text-[color:var(--dashboard-danger)]',
  }[tone]

  return (
    <Card className="border-[color:var(--dashboard-border)] bg-[linear-gradient(180deg,rgba(17,24,39,0.94),rgba(12,18,31,0.98))] shadow-none">
      <CardHeader className="pb-3">
        <CardDescription
          className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--dashboard-text-dim)]"
          style={{ fontFamily: monoFontFamily }}
        >
          {label}
        </CardDescription>
        <CardTitle className={cn('text-2xl font-semibold tracking-[-0.03em]', toneClassName)}>
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm text-[color:var(--dashboard-text-dim)]">{description}</p>
      </CardContent>
    </Card>
  )
}

export function DashboardPeriodPills({ value, onChange }: DashboardPeriodPillsProps) {
  return (
    <div className="inline-flex flex-wrap items-center gap-2 rounded-2xl border border-[color:var(--dashboard-border)] bg-[color:var(--dashboard-surface)] p-1.5">
      {(['this_week', 'this_month', 'this_quarter', 'this_year'] as ExecutivePrimaryPeriod[]).map(
        (period) => {
          const active = period === value
          return (
            <button
              key={period}
              type="button"
              onClick={() => onChange(period)}
              className={cn(
                'rounded-xl px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-[color:var(--dashboard-accent)] font-semibold text-[color:var(--dashboard-bg)]'
                  : 'text-[color:var(--dashboard-text-dim)] hover:bg-[color:var(--dashboard-surface-2)] hover:text-[color:var(--dashboard-text)]',
              )}
            >
              {DATE_PERIOD_LABELS[period]}
            </button>
          )
        },
      )}
    </div>
  )
}

export function DashboardScopeDrawer({
  filters,
  accountOptions,
  categoryOptions,
  groupOptions,
  subgroupOptions,
  onChange,
  onReset,
}: DashboardScopeDrawerProps) {
  const [open, setOpen] = useState(false)
  const activeCount = useMemo(() => countActiveFilters(filters), [filters])

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="border-[color:var(--dashboard-border-strong)] bg-[color:var(--dashboard-surface)] text-[color:var(--dashboard-text)] hover:bg-[color:var(--dashboard-surface-2)] hover:text-[color:var(--dashboard-text)]"
      >
        <SlidersHorizontal className="size-4" />
        More Filters
        {activeCount > 0 ? (
          <Badge className="border-0 bg-[color:var(--dashboard-accent)] text-[color:var(--dashboard-bg)]">
            {activeCount}
          </Badge>
        ) : null}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full border-[color:var(--dashboard-border)] bg-[color:var(--dashboard-bg)] text-[color:var(--dashboard-text)] sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-[color:var(--dashboard-text)]">Scope Filters</SheetTitle>
            <SheetDescription className="text-[color:var(--dashboard-text-dim)]">
              Refine the executive view without leaving the dashboard.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <Select
              value={filters.period}
              onValueChange={(value) => onChange({ ...filters, period: value as DatePeriod })}
            >
              <SelectTrigger className="w-full border-[color:var(--dashboard-border-strong)] bg-[color:var(--dashboard-surface)]">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent className="border-[color:var(--dashboard-border)] bg-[color:var(--dashboard-surface)] text-[color:var(--dashboard-text)]">
                {Object.entries(DATE_PERIOD_LABELS).map(([nextValue, label]) => (
                  <SelectItem key={nextValue} value={nextValue}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.accountId}
              onValueChange={(value) => onChange({ ...filters, accountId: value })}
            >
              <SelectTrigger className="w-full border-[color:var(--dashboard-border-strong)] bg-[color:var(--dashboard-surface)]">
                <SelectValue placeholder="Account" />
              </SelectTrigger>
              <SelectContent className="border-[color:var(--dashboard-border)] bg-[color:var(--dashboard-surface)] text-[color:var(--dashboard-text)]">
                <SelectItem value="all">All Accounts</SelectItem>
                {accountOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.groupId}
              onValueChange={(value) => onChange(nextFiltersForGroupChange(filters, value))}
            >
              <SelectTrigger className="w-full border-[color:var(--dashboard-border-strong)] bg-[color:var(--dashboard-surface)]">
                <SelectValue placeholder="Group" />
              </SelectTrigger>
              <SelectContent className="border-[color:var(--dashboard-border)] bg-[color:var(--dashboard-surface)] text-[color:var(--dashboard-text)]">
                <SelectItem value="all">All Groups</SelectItem>
                {groupOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.subgroupId}
              onValueChange={(value) => onChange(nextFiltersForSubgroupChange(filters, value))}
            >
              <SelectTrigger className="w-full border-[color:var(--dashboard-border-strong)] bg-[color:var(--dashboard-surface)]">
                <SelectValue placeholder="Subgroup" />
              </SelectTrigger>
              <SelectContent className="border-[color:var(--dashboard-border)] bg-[color:var(--dashboard-surface)] text-[color:var(--dashboard-text)]">
                <SelectItem value="all">All Subgroups</SelectItem>
                {subgroupOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.categoryId}
              onValueChange={(value) => onChange({ ...filters, categoryId: value })}
            >
              <SelectTrigger className="w-full border-[color:var(--dashboard-border-strong)] bg-[color:var(--dashboard-surface)]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent className="border-[color:var(--dashboard-border)] bg-[color:var(--dashboard-surface)] text-[color:var(--dashboard-text)]">
                <SelectItem value="all">All Categories</SelectItem>
                {categoryOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              className="w-full border-[color:var(--dashboard-border-strong)] bg-transparent text-[color:var(--dashboard-text)] hover:bg-[color:var(--dashboard-surface-2)] hover:text-[color:var(--dashboard-text)]"
              onClick={() => {
                onReset()
                setOpen(false)
              }}
            >
              Reset Filters
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

export function NetWorthTrendCard({
  title,
  value,
  currency,
  series,
  rangeLabel,
  annotation,
  monoFontFamily,
}: NetWorthTrendCardProps) {
  const safeSeries = series.length > 1 ? series : [...series, ...series]
  const chartWidth = 360
  const chartHeight = 150
  const left = 12
  const top = 12
  const right = 12
  const bottom = 26
  const values = safeSeries.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = max - min || Math.max(Math.abs(max) * 0.04, 1)

  const points = safeSeries.map((point, index) => {
    const x = left + (index / Math.max(1, safeSeries.length - 1)) * (chartWidth - left - right)
    const y =
      top
      + (1 - (point.value - min) / spread) * (chartHeight - top - bottom)
    return { ...point, x, y }
  })

  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ')
  const area = `${polyline} ${points.at(-1)?.x ?? chartWidth},${chartHeight - bottom} ${points[0]?.x ?? left},${chartHeight - bottom}`
  const latest = points.at(-1) ?? points[0]

  return (
    <Card className="border-[color:var(--dashboard-border)] bg-[linear-gradient(180deg,rgba(17,24,39,0.94),rgba(12,18,31,0.98))] shadow-none lg:col-span-2">
      <CardHeader className="space-y-3 pb-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardDescription
              className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--dashboard-text-dim)]"
              style={{ fontFamily: monoFontFamily }}
            >
              {title}
            </CardDescription>
            <CardTitle
              className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--dashboard-text)]"
              style={{ fontFamily: monoFontFamily }}
            >
              {formatCurrencyCompact(value, currency)}
            </CardTitle>
          </div>
          <div className="rounded-xl border border-[color:var(--dashboard-border)] bg-[color:var(--dashboard-surface-2)] px-3 py-2 text-right">
            <p className="text-xs text-[color:var(--dashboard-text-dim)]">{rangeLabel}</p>
            <p className="text-sm font-medium text-[color:var(--dashboard-text)]">{annotation}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-40 w-full overflow-visible">
          <defs>
            <linearGradient id="executive-net-worth-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--dashboard-accent)" stopOpacity="0.34" />
              <stop offset="100%" stopColor="var(--dashboard-accent)" stopOpacity="0.04" />
            </linearGradient>
          </defs>
          <path d={`M ${polyline}`} fill="none" stroke="var(--dashboard-accent)" strokeWidth="2.5" />
          <polygon points={area} fill="url(#executive-net-worth-fill)" />
          {points.map((point) => (
            <text
              key={`${point.isoDate}-${point.label}`}
              x={point.x}
              y={chartHeight - 6}
              textAnchor="middle"
              fill="var(--dashboard-text-dim)"
              fontSize="10"
              fontFamily={monoFontFamily}
            >
              {point.label}
            </text>
          ))}
          <circle cx={latest.x} cy={latest.y} r="4" fill="var(--dashboard-accent)" />
        </svg>
      </CardContent>
    </Card>
  )
}

export function SpendBreakdownCard({
  rows,
  total,
  currency,
  monoFontFamily,
}: SpendBreakdownCardProps) {
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const segments = useMemo(() => {
    return rows.reduce<Array<ExecutiveSpendRow & { length: number; dashOffset: number }>>(
      (accumulator, row) => {
        const runningLength = accumulator.reduce((sum, segment) => sum + segment.length, 0)
        return [
          ...accumulator,
          {
            ...row,
            length: row.share * circumference,
            dashOffset: circumference * 0.25 - runningLength,
          },
        ]
      },
      [],
    )
  }, [circumference, rows])

  return (
    <Card className="border-[color:var(--dashboard-border)] bg-[linear-gradient(180deg,rgba(17,24,39,0.94),rgba(12,18,31,0.98))] shadow-none">
      <CardHeader className="pb-3">
        <CardDescription
          className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--dashboard-text-dim)]"
          style={{ fontFamily: monoFontFamily }}
        >
          Spend Breakdown
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 xl:flex-row xl:items-center">
        <div className="flex justify-center">
          <svg width="124" height="124" viewBox="0 0 124 124">
            <circle
              cx="62"
              cy="62"
              r={radius}
              fill="none"
              stroke="var(--dashboard-border)"
              strokeWidth="14"
            />
            {segments.map((row, index) => {
              const dashArray = `${row.length} ${circumference - row.length}`
              return (
                <circle
                  key={row.key}
                  cx="62"
                  cy="62"
                  r={radius}
                  fill="none"
                  stroke={resolveAccentColor(row.colorHex, row.colorToken, index)}
                  strokeWidth="14"
                  strokeDasharray={dashArray}
                  strokeDashoffset={row.dashOffset}
                />
              )
            })}
            <text
              x="62"
              y="56"
              textAnchor="middle"
              fill="var(--dashboard-text-dim)"
              fontSize="11"
              fontFamily={monoFontFamily}
            >
              Spend
            </text>
            <text
              x="62"
              y="72"
              textAnchor="middle"
              fill="var(--dashboard-accent)"
              fontSize="13"
              fontFamily={monoFontFamily}
            >
              {formatCurrencyCompact(total, currency)}
            </text>
          </svg>
        </div>

        <div className="space-y-3">
          {rows.length === 0 ? (
            <p className="text-sm text-[color:var(--dashboard-text-dim)]">No spend captured in this period.</p>
          ) : (
            rows.map((row, index) => (
              <div key={row.key} className="flex items-center gap-3">
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: resolveAccentColor(row.colorHex, row.colorToken, index) }}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-[color:var(--dashboard-text)]">
                  {row.label}
                </span>
                <span
                  className="text-xs text-[color:var(--dashboard-text-dim)]"
                  style={{ fontFamily: monoFontFamily }}
                >
                  {(row.share * 100).toFixed(0)}%
                </span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function AccountSnapshotCard({
  items,
  monoFontFamily,
}: AccountSnapshotCardProps) {
  return (
    <Card className="border-[color:var(--dashboard-border)] bg-[linear-gradient(180deg,rgba(17,24,39,0.94),rgba(12,18,31,0.98))] shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardDescription
            className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--dashboard-text-dim)]"
            style={{ fontFamily: monoFontFamily }}
          >
            Account Snapshot
          </CardDescription>
          <CardTitle className="mt-2 text-base text-[color:var(--dashboard-text)]">
            Largest balances at a glance
          </CardTitle>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-[color:var(--dashboard-text-dim)]">
          <Link href="/accounts">
            View all
            <ChevronRight className="size-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-[color:var(--dashboard-text-dim)]">No active account balances available.</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-[color:var(--dashboard-border)] bg-[color:var(--dashboard-surface-2)] px-3 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[color:var(--dashboard-text)]">{item.title}</p>
                <p className="truncate text-xs text-[color:var(--dashboard-text-dim)]">{item.subtitle}</p>
              </div>
              <div className="text-right">
                <p
                  className={cn(
                    'text-sm font-medium',
                    item.tone === 'liability'
                      ? 'text-[color:var(--dashboard-danger)]'
                      : 'text-[color:var(--dashboard-text)]',
                  )}
                  style={{ fontFamily: monoFontFamily }}
                >
                  {renderAmount(item.value, item.currency)}
                </p>
                <p className="text-xs text-[color:var(--dashboard-text-dim)]">{item.note}</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function LedgerCategoryBadge({
  label,
  colorHex,
  colorToken,
  index,
  monoFontFamily,
}: {
  label: string
  colorHex: string | null
  colorToken: string | null
  index: number
  monoFontFamily: string
}) {
  const color = resolveAccentColor(colorHex, colorToken, index)

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px]"
      style={{
        color,
        borderColor: color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        fontFamily: monoFontFamily,
      }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

export function RecentTransactionLedger({
  items,
  monoFontFamily,
}: RecentTransactionLedgerProps) {
  return (
    <Card className="border-[color:var(--dashboard-border)] bg-[linear-gradient(180deg,rgba(17,24,39,0.94),rgba(12,18,31,0.98))] shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div>
          <CardDescription
            className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--dashboard-text-dim)]"
            style={{ fontFamily: monoFontFamily }}
          >
            Recent Transactions
          </CardDescription>
          <CardTitle className="mt-2 text-base text-[color:var(--dashboard-text)]">
            Latest statement activity
          </CardTitle>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-[color:var(--dashboard-text-dim)]">
          <Link href="/transactions">
            View all
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[color:var(--dashboard-border)] px-4 py-8 text-center text-sm text-[color:var(--dashboard-text-dim)]">
            No transactions match the current dashboard scope.
          </p>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-2xl border border-[color:var(--dashboard-border)] md:block">
              <table className="w-full">
                <thead className="bg-[color:var(--dashboard-surface-2)]">
                  <tr className="text-left text-xs uppercase tracking-[0.18em] text-[color:var(--dashboard-text-dim)]">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Merchant</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Account</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr
                      key={item.id}
                      className="border-t border-[color:var(--dashboard-border)] text-sm text-[color:var(--dashboard-text)]"
                    >
                      <td className="px-4 py-3" style={{ fontFamily: monoFontFamily }}>
                        {formatDateShort(item.date)}
                      </td>
                      <td className="px-4 py-3 font-medium">{item.merchant}</td>
                      <td className="px-4 py-3">
                        <LedgerCategoryBadge
                          label={item.category}
                          colorHex={item.categoryColorHex}
                          colorToken={item.categoryColorToken}
                          index={index}
                          monoFontFamily={monoFontFamily}
                        />
                      </td>
                      <td className="px-4 py-3 text-[color:var(--dashboard-text-dim)]">
                        {item.accountLabel}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3 text-right font-medium',
                          item.isCredit
                            ? 'text-[color:var(--dashboard-success)]'
                            : 'text-[color:var(--dashboard-text)]',
                        )}
                        style={{ fontFamily: monoFontFamily }}
                      >
                        {item.isCredit ? '+' : '-'}
                        {formatCurrency(Math.abs(item.amount), item.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-[color:var(--dashboard-border)] bg-[color:var(--dashboard-surface-2)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[color:var(--dashboard-text)]">{item.merchant}</p>
                      <p className="mt-1 text-xs text-[color:var(--dashboard-text-dim)]">
                        {formatDateShort(item.date)} · {item.accountLabel}
                      </p>
                    </div>
                    <p
                      className={cn(
                        'shrink-0 text-sm font-medium',
                        item.isCredit
                          ? 'text-[color:var(--dashboard-success)]'
                          : 'text-[color:var(--dashboard-text)]',
                      )}
                      style={{ fontFamily: monoFontFamily }}
                    >
                      {item.isCredit ? '+' : '-'}
                      {formatCurrency(Math.abs(item.amount), item.currency)}
                    </p>
                  </div>
                  <div className="mt-3">
                    <LedgerCategoryBadge
                      label={item.category}
                      colorHex={item.categoryColorHex}
                      colorToken={item.categoryColorToken}
                      index={index}
                      monoFontFamily={monoFontFamily}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
