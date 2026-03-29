'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { formatCurrency, formatCurrencyCompact } from '@/lib/format'
import { cn } from '@/lib/utils'
import { AnalyticsFilterBar, type AnalyticsFilters, type AccountOption } from '@/components/analytics/AnalyticsFilterBar'
import { BreakdownBarChart } from '@/components/analytics/BreakdownBarChart'
import { TransactionDetailDialog } from '@/components/analytics/TransactionDetailDialog'
import type { AnalyticsBreakdownRow, AnalyticsBreakdownResponse } from '@/app/api/analytics/breakdown/route'

// ─── Donut chart (simple view) ─────────────────────────────────────────────

function AnalyticsDonut({
  rows,
  currency,
  onSliceClick,
}: {
  rows: AnalyticsBreakdownRow[]
  currency: string
  onSliceClick: (row: AnalyticsBreakdownRow) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const topRows = useMemo(() => rows.slice(0, 6), [rows])
  const onSliceClickRef = useRef(onSliceClick)
  onSliceClickRef.current = onSliceClick

  useEffect(() => {
    const svg = svgRef.current
    const container = containerRef.current
    if (!svg || !container) return

    const draw = () => {
      const size = Math.min(container.clientWidth, 260)
      const radius = size / 2
      const root = d3.select(svg).attr('width', size).attr('height', size)
      root.selectAll('*').remove()

      if (topRows.length === 0) {
        root.append('text')
          .attr('x', size / 2).attr('y', size / 2)
          .attr('text-anchor', 'middle').attr('fill', 'currentColor')
          .style('font-size', '13px').text('No data')
        return
      }

      const style = getComputedStyle(document.documentElement)
      const palette = [1, 2, 3, 4, 5, 6].map((i) => {
        const v = style.getPropertyValue(`--chart-${i}`).trim()
        return v ? `oklch(${v})` : '#94a3b8'
      })

      const g = root.append('g').attr('transform', `translate(${radius},${radius})`)
      const pie = d3.pie<AnalyticsBreakdownRow>().value((d) => d.amount).sort(null).padAngle(0.025)
      const arc = d3.arc<d3.PieArcDatum<AnalyticsBreakdownRow>>()
        .innerRadius(radius * 0.52)
        .outerRadius(radius - 4)

      const arcHover = d3.arc<d3.PieArcDatum<AnalyticsBreakdownRow>>()
        .innerRadius(radius * 0.52)
        .outerRadius(radius)

      g.selectAll('path')
        .data(pie(topRows))
        .join('path')
        .attr('d', arc)
        .attr('fill', (_, i) => topRows[i]?.colorHex ?? palette[i] ?? '#94a3b8')
        .style('cursor', 'pointer')
        .on('mouseenter', function (_, d) { d3.select(this).transition().duration(120).attr('d', arcHover(d) ?? '') })
        .on('mouseleave', function (_, d) { d3.select(this).transition().duration(120).attr('d', arc(d) ?? '') })
        .on('click', (_, d) => onSliceClickRef.current(d.data))
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(container)
    return () => observer.disconnect()
  }, [topRows])

  return (
    <div ref={containerRef} className="flex items-center justify-center">
      <svg ref={svgRef} />
    </div>
  )
}

// ─── Summary metric tile ────────────────────────────────────────────────────

function MetricTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold', tone)}>{value}</p>
    </div>
  )
}

// ─── Breakdown table row ────────────────────────────────────────────────────

function BreakdownTableRow({
  row,
  index,
  currency,
  onClick,
}: {
  row: AnalyticsBreakdownRow
  index: number
  currency: string
  onClick: () => void
}) {
  const style = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null
  const getColor = (i: number, hex: string | null) => {
    if (hex) return hex
    const slot = (i % 6) + 1
    const v = style?.getPropertyValue(`--chart-${slot}`).trim()
    return v ? `oklch(${v})` : '#94a3b8'
  }

  return (
    <tr
      className="cursor-pointer border-b border-border/30 transition-colors hover:bg-muted/40 last:border-0"
      onClick={onClick}
    >
      <td className="py-3 pr-3">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-block size-2.5 shrink-0 rounded-full"
            style={{ background: getColor(index, row.colorHex) }}
          />
          <span className="font-medium">{row.label}</span>
        </div>
      </td>
      <td className="py-3 pr-3 text-right text-muted-foreground">{row.count}</td>
      <td className="py-3 pr-3 text-right font-semibold">{formatCurrency(row.amount, currency)}</td>
      <td className="py-3 text-right text-muted-foreground">
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/60"
              style={{ width: `${row.share}%` }}
            />
          </div>
          <span className="w-10 text-xs">{row.share}%</span>
        </div>
      </td>
    </tr>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────

const DEFAULT_FILTERS: AnalyticsFilters = {
  period: 'this_month',
  accountIds: [],
  direction: 'all',
  dimension: 'category',
  view: 'simple',
}

export default function AnalyticsPage() {
  const [filters, setFilters] = useState<AnalyticsFilters>(DEFAULT_FILTERS)
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [data, setData] = useState<AnalyticsBreakdownResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedSlice, setSelectedSlice] = useState<AnalyticsBreakdownRow | null>(null)

  // Fetch available accounts once
  useEffect(() => {
    fetch('/api/accounts')
      .then((r) => r.json())
      .then((d) => {
        const list: AccountOption[] = (d.accounts ?? []).map((a: any) => ({
          id: a.id,
          label: a.nickname ?? a.product_name ?? 'Account',
        }))
        setAccounts(list)
      })
  }, [])

  // Fetch breakdown whenever filters change
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({
      period: filters.period,
      direction: filters.direction,
      dimension: filters.dimension,
    })
    if (filters.accountIds.length > 0) {
      params.set('accountIds', filters.accountIds.join(','))
    }

    fetch(`/api/analytics/breakdown?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false))
  }, [filters.period, filters.accountIds, filters.direction, filters.dimension])

  const handleSliceClick = useCallback((row: AnalyticsBreakdownRow) => {
    setSelectedSlice(row)
  }, [])

  const analyticsParams = useMemo(() => ({
    period: filters.period,
    accountIds: filters.accountIds,
    direction: filters.direction,
    dimension: filters.dimension,
  }), [filters.period, filters.accountIds, filters.direction, filters.dimension])

  const currency = data?.currency ?? 'SGD'
  const rows = data?.rows ?? []

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">Breakdown of your spending and income</p>
      </div>

      <AnalyticsFilterBar filters={filters} accounts={accounts} onChange={setFilters} />

      {/* Summary KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricTile
          label="Total Debits"
          value={data ? formatCurrencyCompact(data.debitTotal, currency) : '—'}
          tone="text-rose-500"
        />
        <MetricTile
          label="Total Credits"
          value={data ? formatCurrencyCompact(data.creditTotal, currency) : '—'}
          tone="text-emerald-500"
        />
        <MetricTile
          label="Net"
          value={data ? formatCurrencyCompact(data.creditTotal - data.debitTotal, currency) : '—'}
          tone={data && data.creditTotal >= data.debitTotal ? 'text-emerald-500' : 'text-rose-500'}
        />
        <MetricTile
          label="Shown Total"
          value={data ? formatCurrencyCompact(data.total, currency) : '—'}
        />
      </div>

      {loading && (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      )}

      {!loading && filters.view === 'simple' && (
        <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
          {/* Donut */}
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <AnalyticsDonut rows={rows} currency={currency} onSliceClick={handleSliceClick} />
          </div>

          {/* Legend + mini list */}
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <h3 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {filters.dimension === 'category' ? 'Categories' : 'Tags'}
            </h3>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data for the selected filters</p>
            ) : (
              <div className="space-y-1">
                {rows.map((row, i) => {
                  const style = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null
                  const slot = (i % 6) + 1
                  const v = style?.getPropertyValue(`--chart-${slot}`).trim()
                  const color = row.colorHex ?? (v ? `oklch(${v})` : '#94a3b8')
                  return (
                    <button
                      key={row.id ?? '__null__'}
                      type="button"
                      onClick={() => handleSliceClick(row)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted/60"
                    >
                      <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: color }} />
                      <span className="flex-1 truncate text-left">{row.label}</span>
                      <span className="text-muted-foreground">{row.share}%</span>
                      <span className="w-24 text-right font-medium">{formatCurrencyCompact(row.amount, currency)}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && filters.view === 'advanced' && (
        <div className="space-y-6">
          {/* Horizontal bar chart */}
          <div className="rounded-xl border border-border/60 bg-card p-5">
            <h3 className="mb-4 text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {filters.dimension === 'category' ? 'By Category' : 'By Tag'} — click a bar to see transactions
            </h3>
            <BreakdownBarChart rows={rows} currency={currency} onRowClick={handleSliceClick} />
          </div>

          {/* Table */}
          {rows.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30">
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {filters.dimension === 'category' ? 'Category' : 'Tag'}
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Transactions
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Amount
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Share
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {rows.map((row, i) => (
                    <BreakdownTableRow
                      key={row.id ?? '__null__'}
                      row={row}
                      index={i}
                      currency={currency}
                      onClick={() => handleSliceClick(row)}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border/60 bg-muted/20">
                    <td className="px-5 py-3 text-sm font-semibold" colSpan={2}>
                      Total
                    </td>
                    <td className="px-5 py-3 text-right text-sm font-semibold">
                      {formatCurrency(data?.total ?? 0, currency)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      <TransactionDetailDialog
        slice={selectedSlice}
        currency={currency}
        analyticsParams={analyticsParams}
        onClose={() => setSelectedSlice(null)}
      />
    </div>
  )
}
