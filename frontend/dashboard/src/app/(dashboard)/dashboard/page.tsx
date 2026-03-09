'use client'

import { useRef, useEffect, useState, useMemo } from 'react'
import * as d3 from 'd3'
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowDownUp,
  CreditCard,
  Loader2,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  formatCurrency,
  formatCurrencyCompact,
  formatDateShort,
} from '@/lib/format'

/* ------------------------------------------------------------------ */
/*  Interfaces matching the actual database schema                     */
/* ------------------------------------------------------------------ */

interface Account {
  id: string
  account_type: string
  product_name: string
  nickname: string | null
  currency: string
  is_active: boolean
}

interface StatementTransaction {
  id: string
  txn_date: string
  amount: number
  txn_type: string
  merchant_normalized: string | null
  merchant_raw: string | null
  category_id: number | null
  description: string | null
  currency: string
  created_at: string
}

interface Category {
  id: number
  name: string
  group_name: string | null
}

interface CardRow {
  id: string
  account_id: string
  card_name: string
  total_outstanding: number | null
}

interface AssetBalance {
  id: string
  account_id: string
  asset_id: string
  balance: number
  assets: { symbol: string; name: string | null; asset_type: string } | null
}

interface CashFlowDataPoint {
  month: string
  income: number
  expenses: number
}

interface AssetAllocationDataPoint {
  label: string
  value: number
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function computeCashFlowData(
  transactions: StatementTransaction[],
): CashFlowDataPoint[] {
  const now = new Date()
  const months: CashFlowDataPoint[] = []

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const label = d.toLocaleDateString('en-SG', { month: 'short' })
    const year = d.getFullYear()
    const month = d.getMonth()

    let income = 0
    let expenses = 0
    for (const txn of transactions) {
      const txnDate = new Date(txn.txn_date)
      if (txnDate.getFullYear() === year && txnDate.getMonth() === month) {
        if (txn.txn_type === 'credit') {
          income += Math.abs(txn.amount)
        } else if (txn.txn_type === 'debit') {
          expenses += Math.abs(txn.amount)
        }
      }
    }
    months.push({ month: label, income, expenses })
  }

  return months
}

/* ------------------------------------------------------------------ */
/*  D3 Charts                                                          */
/* ------------------------------------------------------------------ */

function CashFlowChart({ data }: { data: CashFlowDataPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return

    const draw = () => {
      const container = containerRef.current!
      const width = container.clientWidth
      const height = 280
      const margin = { top: 20, right: 20, bottom: 40, left: 60 }
      const innerW = width - margin.left - margin.right
      const innerH = height - margin.top - margin.bottom

      const svg = d3
        .select(svgRef.current)
        .attr('width', width)
        .attr('height', height)

      svg.selectAll('*').remove()

      const maxVal = d3.max(data, (d) => Math.max(d.income, d.expenses)) ?? 0

      if (maxVal === 0) {
        svg
          .append('text')
          .attr('x', width / 2)
          .attr('y', height / 2)
          .attr('text-anchor', 'middle')
          .attr('fill', 'currentColor')
          .style('font-size', '14px')
          .text('No cash flow data yet')
        return
      }

      const g = svg
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`)

      const x0 = d3
        .scaleBand()
        .domain(data.map((d) => d.month))
        .rangeRound([0, innerW])
        .paddingInner(0.3)
        .paddingOuter(0.15)

      const x1 = d3
        .scaleBand()
        .domain(['income', 'expenses'])
        .rangeRound([0, x0.bandwidth()])
        .padding(0.08)

      const y = d3
        .scaleLinear()
        .domain([0, maxVal * 1.1])
        .rangeRound([innerH, 0])

      const style = getComputedStyle(document.documentElement)
      const chart1 = style.getPropertyValue('--chart-1').trim()
      const chart2 = style.getPropertyValue('--chart-2').trim()
      const color1 = chart1 ? `oklch(${chart1})` : '#22c55e'
      const color2 = chart2 ? `oklch(${chart2})` : '#3b82f6'

      const textColor = style.getPropertyValue('--muted-foreground').trim()
      const axisColor = textColor ? `oklch(${textColor})` : '#888'

      g.append('g')
        .attr('transform', `translate(0,${innerH})`)
        .call(d3.axisBottom(x0).tickSize(0).tickPadding(10))
        .call((sel) => sel.select('.domain').remove())
        .selectAll('text')
        .attr('fill', axisColor)
        .style('font-size', '12px')

      g.append('g')
        .call(
          d3
            .axisLeft(y)
            .ticks(5)
            .tickFormat((d) => `$${(d as number) / 1000}k`)
            .tickSize(-innerW)
        )
        .call((sel) => sel.select('.domain').remove())
        .call((sel) =>
          sel
            .selectAll('.tick line')
            .attr('stroke', axisColor)
            .attr('stroke-opacity', 0.1)
        )
        .selectAll('text')
        .attr('fill', axisColor)
        .style('font-size', '12px')

      const monthGroups = g
        .selectAll('.month')
        .data(data)
        .join('g')
        .attr('transform', (d) => `translate(${x0(d.month)},0)`)

      monthGroups
        .append('rect')
        .attr('x', () => x1('income')!)
        .attr('y', (d) => y(d.income))
        .attr('width', x1.bandwidth())
        .attr('height', (d) => innerH - y(d.income))
        .attr('rx', 4)
        .attr('fill', color1)

      monthGroups
        .append('rect')
        .attr('x', () => x1('expenses')!)
        .attr('y', (d) => y(d.expenses))
        .attr('width', x1.bandwidth())
        .attr('height', (d) => innerH - y(d.expenses))
        .attr('rx', 4)
        .attr('fill', color2)
    }

    draw()

    const observer = new ResizeObserver(() => draw())
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [data])

  return (
    <div ref={containerRef} className="w-full">
      <svg ref={svgRef} className="w-full" />
      <div className="flex items-center justify-center gap-6 pt-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: 'var(--color-chart-1)' }} />
          Income
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: 'var(--color-chart-2)' }} />
          Expenses
        </div>
      </div>
    </div>
  )
}

function AssetAllocationChart({ data }: { data: AssetAllocationDataPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return

    const draw = () => {
      const container = containerRef.current!
      const size = Math.min(container.clientWidth, 260)
      const radius = size / 2

      const svg = d3
        .select(svgRef.current)
        .attr('width', size)
        .attr('height', size)

      svg.selectAll('*').remove()

      const total = data.reduce((s, d) => s + d.value, 0)

      if (total === 0) {
        svg
          .append('text')
          .attr('x', size / 2)
          .attr('y', size / 2)
          .attr('text-anchor', 'middle')
          .attr('fill', 'currentColor')
          .style('font-size', '14px')
          .text('No asset data yet')
        return
      }

      const g = svg
        .append('g')
        .attr('transform', `translate(${radius},${radius})`)

      const style = getComputedStyle(document.documentElement)
      const colors = [1, 2, 3, 4].map((i) => {
        const val = style.getPropertyValue(`--chart-${i}`).trim()
        return val ? `oklch(${val})` : ['#22c55e', '#3b82f6', '#a855f7', '#eab308'][i - 1]
      })

      const pie = d3
        .pie<(typeof data)[0]>()
        .value((d) => d.value)
        .sort(null)
        .padAngle(0.03)

      const arc = d3
        .arc<d3.PieArcDatum<(typeof data)[0]>>()
        .innerRadius(radius * 0.55)
        .outerRadius(radius - 8)
        .cornerRadius(4)

      g.selectAll('path')
        .data(pie(data))
        .join('path')
        .attr('d', arc)
        .attr('fill', (_, i) => colors[i])

      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '-0.2em')
        .attr('fill', 'currentColor')
        .style('font-size', '13px')
        .style('font-weight', '500')
        .text('Total Assets')

      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '1.2em')
        .attr('fill', 'currentColor')
        .style('font-size', '16px')
        .style('font-weight', '700')
        .text(formatCurrencyCompact(total))
    }

    draw()

    const observer = new ResizeObserver(() => draw())
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [data])

  const style =
    typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null
  const legendColors = [1, 2, 3, 4].map((i) => {
    const val = style?.getPropertyValue(`--chart-${i}`).trim()
    return val ? `oklch(${val})` : ['#22c55e', '#3b82f6', '#a855f7', '#eab308'][i - 1]
  })

  return (
    <div className="flex flex-col items-center gap-4">
      <div ref={containerRef} className="flex w-full justify-center">
        <svg ref={svgRef} />
      </div>
      <div className="grid w-full grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {data.map((d, i) => (
          <div key={d.label} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-sm"
              style={{ background: legendColors[i] }}
            />
            <span className="text-muted-foreground">{d.label}</span>
            <span className="ml-auto font-medium">{formatCurrencyCompact(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Dashboard Page                                                */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [recentTxns, setRecentTxns] = useState<StatementTransaction[]>([])
  const [allTxns, setAllTxns] = useState<StatementTransaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [cards, setCards] = useState<CardRow[]>([])
  const [assetBalances, setAssetBalances] = useState<AssetBalance[]>([])

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single()

      if (!profile) { setLoading(false); return }

      const { data: accts } = await supabase
        .from('accounts')
        .select('id, account_type, product_name, nickname, currency, is_active')
        .eq('household_id', profile.household_id)

      const accountList = accts ?? []
      setAccounts(accountList)
      const accountIds = accountList.map((a) => a.id)

      if (accountIds.length === 0) {
        setLoading(false)
        return
      }

      const [recentRes, allRes, catRes, cardsRes, balancesRes] = await Promise.all([
        supabase
          .from('statement_transactions')
          .select('id, txn_date, amount, txn_type, merchant_normalized, merchant_raw, category_id, description, currency, created_at')
          .in('account_id', accountIds)
          .order('txn_date', { ascending: false })
          .limit(8),
        supabase
          .from('statement_transactions')
          .select('id, txn_date, amount, txn_type, merchant_normalized, merchant_raw, category_id, description, currency, created_at')
          .in('account_id', accountIds),
        supabase.from('categories').select('id, name, group_name, icon_key, color_token, color_hex, display_order, is_active, is_archived, is_system'),
        supabase
          .from('cards')
          .select('id, account_id, card_name, total_outstanding')
          .in('account_id', accountIds),
        supabase
          .from('asset_balances')
          .select('id, account_id, asset_id, balance, assets(symbol, name, asset_type)')
          .in('account_id', accountIds),
      ])

      setRecentTxns((recentRes.data as StatementTransaction[]) ?? [])
      setAllTxns((allRes.data as StatementTransaction[]) ?? [])
      setCategories((catRes.data as Category[]) ?? [])
      setCards((cardsRes.data as CardRow[]) ?? [])
      setAssetBalances((balancesRes.data as AssetBalance[]) ?? [])
      setLoading(false)
    }
    fetchData()
  }, [])

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  )

  const totalCardOutstanding = useMemo(
    () => cards.reduce((s, c) => s + (c.total_outstanding ?? 0), 0),
    [cards],
  )

  const monthlyCashFlow = useMemo(() => {
    const income = allTxns
      .filter((t) => t.txn_type === 'credit')
      .reduce((s, t) => s + Math.abs(t.amount), 0)
    const expenses = allTxns
      .filter((t) => t.txn_type === 'debit')
      .reduce((s, t) => s + Math.abs(t.amount), 0)
    return income - expenses
  }, [allTxns])

  const cashFlowData = useMemo(() => computeCashFlowData(allTxns), [allTxns])

  const assetAllocationData = useMemo<AssetAllocationDataPoint[]>(() => {
    const groups: Record<string, number> = {}
    for (const ab of assetBalances) {
      const type = ab.assets?.asset_type ?? 'other'
      const label = type.charAt(0).toUpperCase() + type.slice(1)
      groups[label] = (groups[label] ?? 0) + ab.balance
    }
    return Object.entries(groups).map(([label, value]) => ({ label, value }))
  }, [assetBalances])

  const activeAccounts = accounts.filter((a) => a.is_active).length

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isPositiveFlow = monthlyCashFlow >= 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Your financial overview at a glance.
        </p>
      </div>

      {/* Row 1: Summary Cards */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Accounts</CardDescription>
            <CardTitle className="text-2xl">{activeAccounts}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Wallet className="h-4 w-4" />
              <span>Linked to household</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Investment Holdings</CardDescription>
            <CardTitle className="text-2xl">{assetBalances.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              <span>Asset positions</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Card Outstanding</CardDescription>
            <CardTitle className="text-2xl">
              {formatCurrency(totalCardOutstanding)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <CreditCard className="h-4 w-4" />
              <span>Credit card balances</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Monthly Cash Flow</CardDescription>
            <CardTitle
              className={cn(
                'text-2xl',
                isPositiveFlow ? 'text-emerald-500' : 'text-red-500',
              )}
            >
              {isPositiveFlow ? '+' : ''}
              {formatCurrency(monthlyCashFlow)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <ArrowDownUp className="h-4 w-4" />
              <span>Income minus expenses</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Cash Flow Chart + Asset Allocation */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Cash Flow</CardTitle>
            <CardDescription>
              Monthly income vs expenses over the last 6 months
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CashFlowChart data={cashFlowData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Asset Allocation</CardTitle>
            <CardDescription>Breakdown by asset class</CardDescription>
          </CardHeader>
          <CardContent>
            <AssetAllocationChart data={assetAllocationData} />
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
          <CardDescription>Your latest statement activity</CardDescription>
        </CardHeader>
        <CardContent>
          {recentTxns.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No transactions yet
            </p>
          ) : (
            <div className="space-y-1">
              {recentTxns.map((txn) => {
                const category =
                  txn.category_id != null
                    ? categoryMap.get(txn.category_id)
                    : undefined
                const isCredit = txn.txn_type === 'credit'
                const merchantName =
                  txn.merchant_normalized ??
                  txn.merchant_raw ??
                  txn.description ??
                  'Unknown'
                return (
                  <div
                    key={txn.id}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{merchantName}</p>
                      <p className="text-xs text-muted-foreground">
                        {category?.name ?? 'Uncategorized'} ·{' '}
                        {formatDateShort(txn.txn_date)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 font-medium tabular-nums',
                        isCredit ? 'text-emerald-500' : 'text-foreground',
                      )}
                    >
                      {isCredit ? '+' : '-'}
                      {formatCurrency(Math.abs(txn.amount))}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
