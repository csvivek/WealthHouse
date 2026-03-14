'use client'

import Link from 'next/link'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import {
  ArrowLeftRight,
  ArrowRight,
  CreditCard,
  Landmark,
  PiggyBank,
  Receipt,
  ShoppingCart,
  Wallet,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { isMerchantSchemaNotReadyError } from '@/lib/merchants/config'
import {
  formatCurrency,
  formatCurrencyCompact,
  formatDateShort,
} from '@/lib/format'
import {
  OverviewFilterBar,
  type OverviewFilters,
} from '@/components/dashboard/OverviewFilterBar'
import {
  OverviewTabs,
  type OverviewTabValue,
} from '@/components/dashboard/OverviewTabs'
import { DATE_PERIOD_LABELS, resolveDatePeriodRange } from '@/lib/date-periods'
import { CategoryBadge } from '@/components/category-badge'
import { AccountPortfolioSection } from '@/components/dashboard/AccountPortfolioSection'
import { EmptyState } from '@/components/empty-state'
import { useDashboardAccounts } from '@/hooks/useDashboardAccounts'
import {
  computeCashFlowData,
  DEFAULT_OVERVIEW_FILTERS,
  deriveOverviewFilterOptions,
  isDefaultOverviewFilterSelection,
  resolveScopedCategoryIds,
  type OverviewCategory,
} from '@/lib/overview-filters'
import { normalizeTxnDirection } from '@/lib/transactions/txn-direction'

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
  merchant: { name: string | null } | null
  category_id: number | null
  description: string | null
  currency: string
  created_at: string
}

interface CategoryWithHierarchy extends OverviewCategory {
  type: 'income' | 'expense' | 'transfer' | null
  icon_key: string | null
  color_token: string | null
  color_hex: string | null
  domain_type: string | null
  payment_subtype: string | null
}

interface ReceiptRow {
  id: string
  receipt_datetime: string | null
  merchant_raw: string
  merchant: { name: string | null } | null
  total_amount: number
  suggested_account_id: string | null
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

interface AssetAllocationDataPoint {
  label: string
  value: number
}

function describeDashboardLoadError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const message = typeof record.message === 'string' ? record.message : ''
    const details = typeof record.details === 'string' ? record.details : ''
    const hint = typeof record.hint === 'string' ? record.hint : ''
    const code = typeof record.code === 'string' ? record.code : ''
    const summary = [message, details, hint]
      .filter((value) => value.trim().length > 0)
      .join(' ')

    if (summary.length > 0) {
      return code ? `${summary} (${code})` : summary
    }
  }

  return 'Failed to load dashboard data.'
}

function getChartColor(index: number, fallback: string) {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--chart-${index}`)
    .trim()
  return value ? `oklch(${value})` : fallback
}

function toMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function formatSignedCurrency(value: number, currency: string) {
  if (value === 0) return formatCurrency(0, currency)
  return `${value > 0 ? '+' : '-'}${formatCurrency(Math.abs(value), currency)}`
}

function isTransferLikeTransaction(
  transaction: StatementTransaction,
  category: CategoryWithHierarchy | undefined,
) {
  const normalizedType = transaction.txn_type.trim().toLowerCase()
  if (
    normalizedType.includes('transfer')
    || normalizedType.includes('payment')
    || normalizedType.includes('repayment')
  ) {
    return true
  }

  return (
    category?.type === 'transfer'
    || category?.payment_subtype === 'transfer'
    || category?.domain_type === 'transfer'
  )
}

function isPortfolioSummaryUsable(account: {
  accountType: string
  currentBalance: number | null
  statementBalance: number | null
  pendingPrincipal: number | null
}) {
  return (
    account.accountType !== 'unknown'
    || account.currentBalance != null
    || account.statementBalance != null
    || account.pendingPrincipal != null
  )
}

function ChartSectionSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[320px] w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[320px] w-full" />
        </CardContent>
      </Card>
    </div>
  )
}

function RecentTransactionsSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-24" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center justify-between rounded-lg border px-3 py-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  valueClassName,
}: {
  title: string
  value: string
  description: ReactNode
  icon: typeof Landmark
  valueClassName?: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2 text-sm">
          <Icon className="size-4" />
          {title}
        </CardDescription>
        <CardTitle className={cn('text-3xl font-bold tabular-nums', valueClassName)}>
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-xs text-muted-foreground">{description}</div>
      </CardContent>
    </Card>
  )
}

function CashFlowChart({ data }: { data: ReturnType<typeof computeCashFlowData> }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const legendColors = useMemo(
    () => [getChartColor(1, '#22c55e'), getChartColor(2, '#4f46e5')],
    [],
  )

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return

    const draw = () => {
      const container = containerRef.current
      if (!container) return

      const width = container.clientWidth
      const height = 280
      const margin = { top: 20, right: 20, bottom: 40, left: 60 }
      const innerWidth = width - margin.left - margin.right
      const innerHeight = height - margin.top - margin.bottom

      const svg = d3
        .select(svgRef.current)
        .attr('width', width)
        .attr('height', height)

      svg.selectAll('*').remove()

      const maxValue = d3.max(data, (point) => Math.max(point.income, point.expenses)) ?? 0

      if (maxValue === 0) {
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

      const chartGroup = svg
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`)

      const x0 = d3
        .scaleBand()
        .domain(data.map((point) => point.month))
        .rangeRound([0, innerWidth])
        .paddingInner(0.3)
        .paddingOuter(0.15)

      const x1 = d3
        .scaleBand()
        .domain(['income', 'expenses'])
        .rangeRound([0, x0.bandwidth()])
        .padding(0.08)

      const y = d3
        .scaleLinear()
        .domain([0, maxValue * 1.1])
        .rangeRound([innerHeight, 0])

      const axisColorValue = getComputedStyle(document.documentElement)
        .getPropertyValue('--muted-foreground')
        .trim()
      const axisColor = axisColorValue ? `oklch(${axisColorValue})` : '#888'

      chartGroup
        .append('g')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x0).tickSize(0).tickPadding(10))
        .call((selection) => selection.select('.domain').remove())
        .selectAll('text')
        .attr('fill', axisColor)
        .style('font-size', '12px')

      chartGroup
        .append('g')
        .call(
          d3
            .axisLeft(y)
            .ticks(5)
            .tickFormat((value) => `$${(value as number) / 1000}k`)
            .tickSize(-innerWidth),
        )
        .call((selection) => selection.select('.domain').remove())
        .call((selection) =>
          selection
            .selectAll('.tick line')
            .attr('stroke', axisColor)
            .attr('stroke-opacity', 0.1),
        )
        .selectAll('text')
        .attr('fill', axisColor)
        .style('font-size', '12px')

      const monthGroups = chartGroup
        .selectAll('.month')
        .data(data)
        .join('g')
        .attr('transform', (point) => `translate(${x0(point.month)},0)`)

      monthGroups
        .append('rect')
        .attr('x', () => x1('income') ?? 0)
        .attr('y', (point) => y(point.income))
        .attr('width', x1.bandwidth())
        .attr('height', (point) => innerHeight - y(point.income))
        .attr('rx', 4)
        .attr('fill', legendColors[0])

      monthGroups
        .append('rect')
        .attr('x', () => x1('expenses') ?? 0)
        .attr('y', (point) => y(point.expenses))
        .attr('width', x1.bandwidth())
        .attr('height', (point) => innerHeight - y(point.expenses))
        .attr('rx', 4)
        .attr('fill', legendColors[1])
    }

    draw()

    const observer = new ResizeObserver(() => draw())
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [data, legendColors])

  return (
    <div ref={containerRef} className="w-full">
      <svg ref={svgRef} className="w-full" />
      <div className="flex items-center justify-center gap-6 pt-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: legendColors[0] }} />
          Income
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: legendColors[1] }} />
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
      const container = containerRef.current
      if (!container) return

      const size = Math.min(container.clientWidth, 260)
      const radius = size / 2

      const svg = d3
        .select(svgRef.current)
        .attr('width', size)
        .attr('height', size)

      svg.selectAll('*').remove()

      const total = data.reduce((sum, point) => sum + point.value, 0)

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

      const chartGroup = svg
        .append('g')
        .attr('transform', `translate(${radius},${radius})`)

      const colors = [1, 2, 3, 4].map((index) =>
        getChartColor(index, ['#22c55e', '#4f46e5', '#60a5fa', '#f59e0b'][index - 1]),
      )

      const pie = d3
        .pie<(typeof data)[0]>()
        .value((point) => point.value)
        .sort(null)
        .padAngle(0.03)

      const arc = d3
        .arc<d3.PieArcDatum<(typeof data)[0]>>()
        .innerRadius(radius * 0.55)
        .outerRadius(radius - 8)
        .cornerRadius(4)

      chartGroup
        .selectAll('path')
        .data(pie(data))
        .join('path')
        .attr('d', arc)
        .attr('fill', (_, index) => colors[index])

      chartGroup
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '-0.2em')
        .attr('fill', 'currentColor')
        .style('font-size', '13px')
        .style('font-weight', '500')
        .text('Total Assets')

      chartGroup
        .append('text')
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

  const legendColors = [1, 2, 3, 4].map((index) =>
    getChartColor(index, ['#22c55e', '#4f46e5', '#60a5fa', '#f59e0b'][index - 1]),
  )

  return (
    <div className="flex flex-col items-center gap-4">
      <div ref={containerRef} className="flex w-full justify-center">
        <svg ref={svgRef} />
      </div>
      <div className="grid w-full grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {data.map((point, index) => (
          <div key={point.label} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-sm"
              style={{ background: legendColors[index] }}
            />
            <span className="text-muted-foreground">{point.label}</span>
            <span className="ml-auto font-medium">{formatCurrencyCompact(point.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<OverviewTabValue>('payments')
  const [filters, setFilters] = useState<OverviewFilters>({ ...DEFAULT_OVERVIEW_FILTERS })
  const [autoExpandedToAllHistory, setAutoExpandedToAllHistory] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [allTxns, setAllTxns] = useState<StatementTransaction[]>([])
  const [receipts, setReceipts] = useState<ReceiptRow[]>([])
  const [categories, setCategories] = useState<CategoryWithHierarchy[]>([])
  const [cards, setCards] = useState<CardRow[]>([])
  const [assetBalances, setAssetBalances] = useState<AssetBalance[]>([])
  const { accounts: portfolioAccounts, loading: portfolioLoading } = useDashboardAccounts()

  useEffect(() => {
    let isActive = true

    async function fetchData() {
      setLoading(true)
      setLoadError(null)

      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          if (!isActive) return
          setAccounts([])
          setAllTxns([])
          setReceipts([])
          setCategories([])
          setCards([])
          setAssetBalances([])
          return
        }

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('household_id')
          .eq('id', user.id)
          .single()

        if (!profile?.household_id) {
          if (!isActive) return
          setAccounts([])
          setAllTxns([])
          setReceipts([])
          setCategories([])
          setCards([])
          setAssetBalances([])
          return
        }

        const { data: accountData } = await supabase
          .from('accounts')
          .select('id, account_type, product_name, nickname, currency, is_active')
          .eq('household_id', profile.household_id)

        const accountList = (accountData as Account[] | null) ?? []
        const scopedAccounts =
          filters.accountId === 'all'
            ? accountList
            : accountList.filter((account) => account.id === filters.accountId)

        const scopedAccountIds = scopedAccounts.map((account) => account.id)

        const { data: categoryData } = await supabase
          .from('categories')
          .select(
            'id, name, type, group_id, subgroup_id, icon_key, color_token, color_hex, domain_type, payment_subtype, category_group:category_groups(id, name), category_subgroup:category_subgroups(id, name, group_id)',
          )

        const categoryRows = (categoryData as CategoryWithHierarchy[] | null) ?? []
        const scopedCategoryIds = resolveScopedCategoryIds(categoryRows, filters)
        const { start, end } = resolveDatePeriodRange(filters.period)
        const hasCategoryFilters =
          filters.groupId !== 'all'
          || filters.subgroupId !== 'all'
          || filters.categoryId !== 'all'

        const buildPaymentsQuery = (includeMerchantJoin: boolean) => {
          let query = supabase
            .from('statement_transactions')
            .select(
              includeMerchantJoin
                ? 'id, txn_date, amount, txn_type, merchant_normalized, merchant_raw, merchant:merchants(name), category_id, description, currency, created_at'
                : 'id, txn_date, amount, txn_type, merchant_normalized, merchant_raw, category_id, description, currency, created_at',
            )
            .order('txn_date', { ascending: false })

          if (scopedAccountIds.length > 0) {
            query = query.in('account_id', scopedAccountIds)
          } else if (filters.accountId !== 'all') {
            query = query.eq('account_id', filters.accountId)
          }

          if (hasCategoryFilters) {
            query = query.in('category_id', scopedCategoryIds.length > 0 ? scopedCategoryIds : [-1])
          }

          if (start) query = query.gte('txn_date', start)
          if (end) query = query.lte('txn_date', end)

          return query
        }

        const buildReceiptsQuery = (includeMerchantJoin: boolean) => {
          let query = supabase
            .from('receipts')
            .select(
              includeMerchantJoin
                ? 'id, receipt_datetime, merchant_raw, merchant:merchants(name), total_amount, suggested_account_id'
                : 'id, receipt_datetime, merchant_raw, total_amount, suggested_account_id',
            )
            .eq('status', 'confirmed')
            .order('receipt_datetime', { ascending: false, nullsFirst: false })

          if (filters.accountId !== 'all') {
            query = query.eq('suggested_account_id', filters.accountId)
          }

          if (start) query = query.gte('receipt_datetime', `${start}T00:00:00.000Z`)
          if (end) query = query.lte('receipt_datetime', `${end}T23:59:59.999Z`)

          return query
        }

        const [initialPaymentsRes, initialReceiptsRes, cardsRes, balancesRes] = await Promise.all([
          buildPaymentsQuery(true),
          buildReceiptsQuery(true),
          scopedAccountIds.length > 0
            ? supabase
                .from('cards')
                .select('id, account_id, card_name, total_outstanding')
                .in('account_id', scopedAccountIds)
            : Promise.resolve({ data: [] as CardRow[] }),
          scopedAccountIds.length > 0
            ? supabase
                .from('asset_balances')
                .select('id, account_id, asset_id, balance, assets(symbol, name, asset_type)')
                .in('account_id', scopedAccountIds)
            : Promise.resolve({ data: [] as AssetBalance[] }),
        ])

        let paymentsRes = initialPaymentsRes
        let receiptsRes = initialReceiptsRes

        if (isMerchantSchemaNotReadyError(paymentsRes.error, 'merchants')) {
          paymentsRes = await buildPaymentsQuery(false)
        }

        if (isMerchantSchemaNotReadyError(receiptsRes.error, 'merchants')) {
          receiptsRes = await buildReceiptsQuery(false)
        }

        if (paymentsRes.error) throw paymentsRes.error
        if (receiptsRes.error) throw receiptsRes.error

        if (!isActive) return

        const paymentRows = (paymentsRes.data as unknown as StatementTransaction[] | null) ?? []
        const receiptRows = (receiptsRes.data as unknown as ReceiptRow[] | null) ?? []
        const cardRows = (cardsRes.data as CardRow[] | null) ?? []
        const balanceRows = (balancesRes.data as AssetBalance[] | null) ?? []

        if (
          isDefaultOverviewFilterSelection(filters)
          && paymentRows.length === 0
          && receiptRows.length === 0
        ) {
          let historicalPaymentsQuery = supabase
            .from('statement_transactions')
            .select('id')
            .limit(1)

          if (scopedAccountIds.length > 0) {
            historicalPaymentsQuery = historicalPaymentsQuery.in('account_id', scopedAccountIds)
          } else if (filters.accountId !== 'all') {
            historicalPaymentsQuery = historicalPaymentsQuery.eq('account_id', filters.accountId)
          }

          let historicalReceiptsQuery = supabase
            .from('receipts')
            .select('id')
            .eq('status', 'confirmed')
            .limit(1)

          if (filters.accountId !== 'all') {
            historicalReceiptsQuery = historicalReceiptsQuery.eq('suggested_account_id', filters.accountId)
          }

          const [historicalPaymentsRes, historicalReceiptsRes] = await Promise.all([
            historicalPaymentsQuery,
            historicalReceiptsQuery,
          ])

          if (historicalPaymentsRes.error) throw historicalPaymentsRes.error
          if (historicalReceiptsRes.error) throw historicalReceiptsRes.error

          const hasHistoricalActivity =
            (((historicalPaymentsRes.data as Array<{ id: string }> | null) ?? []).length > 0)
            || (((historicalReceiptsRes.data as Array<{ id: string }> | null) ?? []).length > 0)

          if (hasHistoricalActivity) {
            setAutoExpandedToAllHistory(true)
            setFilters((current) =>
              isDefaultOverviewFilterSelection(current)
                ? { ...current, period: 'all_history' }
                : current,
            )
            return
          }
        }

        setAccounts(accountList)
        setCategories(categoryRows)
        setAllTxns(paymentRows)
        setReceipts(receiptRows)
        setCards(cardRows)
        setAssetBalances(balanceRows)
      } catch (error) {
        console.error('Failed to load dashboard data:', error)
        if (!isActive) return
        setLoadError(describeDashboardLoadError(error))
        setAccounts([])
        setAllTxns([])
        setReceipts([])
        setCategories([])
        setCards([])
        setAssetBalances([])
      } finally {
        if (isActive) {
          setLoading(false)
        }
      }
    }

    void fetchData()

    return () => {
      isActive = false
    }
  }, [filters])

  const { accountOptions, groupOptions, subgroupOptions } = useMemo(
    () => deriveOverviewFilterOptions({ accounts, categories, filters }),
    [accounts, categories, filters],
  )

  const categoryOptions = useMemo(
    () =>
      categories
        .filter((category) => {
          if (filters.groupId !== 'all' && String(category.group_id) !== filters.groupId) return false
          if (filters.subgroupId !== 'all' && String(category.subgroup_id) !== filters.subgroupId) return false
          return true
        })
        .map((category) => ({
          value: String(category.id),
          label: category.category_group?.name
            ? `${category.category_group.name} / ${category.name}`
            : category.name,
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [categories, filters.groupId, filters.subgroupId],
  )

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )

  const usablePortfolioAccounts = useMemo(
    () => portfolioAccounts.filter(isPortfolioSummaryUsable),
    [portfolioAccounts],
  )

  const displayCurrency =
    accounts.find((account) => account.currency)?.currency
    || usablePortfolioAccounts.find((account) => account.currency)?.currency
    || 'SGD'

  const scopedTransactions = useMemo(
    () =>
      allTxns.filter((transaction) => {
        const category =
          transaction.category_id != null ? categoryMap.get(transaction.category_id) : undefined
        return !isTransferLikeTransaction(transaction, category)
      }),
    [allTxns, categoryMap],
  )

  const monthlyIncome = useMemo(
    () =>
      scopedTransactions
        .filter((transaction) => normalizeTxnDirection(transaction.txn_type) === 'credit')
        .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
    [scopedTransactions],
  )

  const monthlySpend = useMemo(
    () =>
      scopedTransactions
        .filter((transaction) => normalizeTxnDirection(transaction.txn_type) === 'debit')
        .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
    [scopedTransactions],
  )

  const savingsRate = monthlyIncome > 0 ? ((monthlyIncome - monthlySpend) / monthlyIncome) * 100 : null

  const savingsRateColor =
    savingsRate == null
      ? 'text-muted-foreground'
      : savingsRate >= 20
        ? 'text-emerald-500'
        : savingsRate >= 10
          ? 'text-amber-500'
          : 'text-red-500'

  const totalCardOutstanding = useMemo(
    () => cards.reduce((sum, card) => sum + (card.total_outstanding ?? 0), 0),
    [cards],
  )

  const largestCard = useMemo(
    () =>
      [...cards].sort(
        (left, right) => (right.total_outstanding ?? 0) - (left.total_outstanding ?? 0),
      )[0] ?? null,
    [cards],
  )

  const netWorth = useMemo(() => {
    if (usablePortfolioAccounts.length > 0) {
      let assets = 0
      let liabilities = 0

      for (const account of usablePortfolioAccounts) {
        if (account.accountType === 'credit_card') {
          liabilities += Math.abs(account.statementBalance ?? 0)
          continue
        }

        if (['loan', 'balance_transfer', 'easy_credit'].includes(account.accountType)) {
          liabilities += Math.abs(account.pendingPrincipal ?? account.statementBalance ?? 0)
          continue
        }

        assets += Math.max(account.currentBalance ?? 0, 0)
      }

      if (!usablePortfolioAccounts.some((account) => ['investment', 'crypto_exchange'].includes(account.accountType))) {
        assets += assetBalances.reduce((sum, balance) => sum + Math.max(balance.balance, 0), 0)
      }

      return assets - liabilities
    }

    return assetBalances.reduce((sum, balance) => sum + Math.max(balance.balance, 0), 0) - totalCardOutstanding
  }, [assetBalances, totalCardOutstanding, usablePortfolioAccounts])

  const netWorthProxy = useMemo(() => {
    const now = new Date()
    const currentMonthKey = toMonthKey(now)
    const previousMonthKey = toMonthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))

    const calculateMonthNetCashFlow = (monthKey: string) =>
      scopedTransactions.reduce((sum, transaction) => {
        if (transaction.txn_date.slice(0, 7) !== monthKey) return sum

        const direction = normalizeTxnDirection(transaction.txn_type)
        if (direction === 'credit') return sum + Math.abs(transaction.amount)
        if (direction === 'debit') return sum - Math.abs(transaction.amount)
        return sum
      }, 0)

    const hasCurrentMonth = scopedTransactions.some(
      (transaction) => transaction.txn_date.slice(0, 7) === currentMonthKey,
    )
    const hasPreviousMonth = scopedTransactions.some(
      (transaction) => transaction.txn_date.slice(0, 7) === previousMonthKey,
    )

    return {
      currentMonthNetCashFlow: calculateMonthNetCashFlow(currentMonthKey),
      previousMonthNetCashFlow: calculateMonthNetCashFlow(previousMonthKey),
      hasComparison: hasCurrentMonth && hasPreviousMonth,
    }
  }, [scopedTransactions])

  const cashFlowData = useMemo(() => computeCashFlowData(scopedTransactions), [scopedTransactions])

  const assetAllocationData = useMemo<AssetAllocationDataPoint[]>(
    () => {
      const groups: Record<string, number> = {}
      for (const balance of assetBalances) {
        const assetType = balance.assets?.asset_type ?? 'other'
        const label = assetType.charAt(0).toUpperCase() + assetType.slice(1)
        groups[label] = (groups[label] ?? 0) + balance.balance
      }

      return Object.entries(groups).map(([label, value]) => ({ label, value }))
    },
    [assetBalances],
  )

  const recentTxns = useMemo(() => allTxns.slice(0, 10), [allTxns])

  const kpiLoading = loading || portfolioLoading
  const hasAccounts = accounts.length > 0
  const hasTransactions = allTxns.length > 0
  const showDashboardSetupEmptyState = !loading && !loadError && !hasAccounts
  const showTransactionsEmptyState = !loading && !loadError && hasAccounts && !hasTransactions

  const handleFiltersChange = (nextFilters: OverviewFilters) => {
    setAutoExpandedToAllHistory(false)
    setFilters(nextFilters)
  }

  const handleFiltersReset = () => {
    setAutoExpandedToAllHistory(false)
    setFilters({ ...DEFAULT_OVERVIEW_FILTERS })
  }

  const netWorthDescription = netWorthProxy.hasComparison ? (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
      <span>Proxy:</span>
      <span
        className={cn(
          'font-medium',
          netWorthProxy.currentMonthNetCashFlow > 0
            ? 'text-emerald-600'
            : netWorthProxy.currentMonthNetCashFlow < 0
              ? 'text-red-500'
              : 'text-muted-foreground',
        )}
      >
        {formatSignedCurrency(netWorthProxy.currentMonthNetCashFlow, displayCurrency)} this month
      </span>
      <span>vs</span>
      <span
        className={cn(
          'font-medium',
          netWorthProxy.previousMonthNetCashFlow > 0
            ? 'text-emerald-600'
            : netWorthProxy.previousMonthNetCashFlow < 0
              ? 'text-red-500'
              : 'text-muted-foreground',
        )}
      >
        {formatSignedCurrency(netWorthProxy.previousMonthNetCashFlow, displayCurrency)} last month
      </span>
    </div>
  ) : (
    'Current snapshot only'
  )

  const monthlySpendDescription = DATE_PERIOD_LABELS[filters.period]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Your financial overview at a glance.</p>
      </div>

      {loadError ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">Unable to load dashboard data</CardTitle>
            <CardDescription className="text-destructive">{loadError}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <OverviewTabs value={activeTab} onValueChange={setActiveTab} />
      <OverviewFilterBar
        filters={filters}
        accountOptions={accountOptions}
        categoryOptions={categoryOptions}
        groupOptions={groupOptions}
        subgroupOptions={subgroupOptions}
        onChange={handleFiltersChange}
        onReset={handleFiltersReset}
      />

      {autoExpandedToAllHistory ? (
        <p className="text-sm text-muted-foreground">
          Showing all history because no activity was found for this month.
        </p>
      ) : null}

      {!loadError && activeTab === 'receipts' ? (
        <Card>
          <CardHeader>
            <CardTitle>Receipts</CardTitle>
            <CardDescription>Confirmed receipts linked to your selected filters.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="flex items-center justify-between rounded-lg border px-3 py-3">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : receipts.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No receipts yet"
                description="Upload a receipt to start tracking household purchases alongside your statements."
                action={{ label: 'Upload Receipt', href: '/receipts' }}
              />
            ) : (
              <div className="space-y-2">
                {receipts.slice(0, 10).map((receipt) => (
                  <div
                    key={receipt.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-3 last:border-b"
                  >
                    <div>
                      <p className="font-medium">{receipt.merchant?.name ?? receipt.merchant_raw}</p>
                      <p className="text-xs text-muted-foreground">
                        {receipt.receipt_datetime ? formatDateShort(receipt.receipt_datetime) : 'No date'}
                      </p>
                    </div>
                    <p className="font-medium">{formatCurrency(receipt.total_amount, displayCurrency)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : !loadError && showDashboardSetupEmptyState ? (
        <EmptyState
          icon={Wallet}
          title="Welcome to Wealth House"
          description="Start by adding your accounts and uploading a statement to unlock your dashboard."
          action={{ label: 'Add Account', href: '/accounts' }}
        />
      ) : !loadError && showTransactionsEmptyState ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="No transactions yet"
          description="Import your first bank statement to see spending, income, and card activity here."
          action={{ label: 'Import Statement', href: '/statements' }}
        />
      ) : !loadError ? (
        <>
          {kpiLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Card key={index}>
                  <CardHeader className="space-y-3">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-8 w-36" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-44" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                title="Net Worth"
                value={formatCurrency(netWorth, displayCurrency)}
                description={netWorthDescription}
                icon={Landmark}
              />
              <MetricCard
                title="Monthly Spend"
                value={formatCurrency(monthlySpend, displayCurrency)}
                description={monthlySpendDescription}
                icon={ShoppingCart}
              />
              <MetricCard
                title="Card Outstanding"
                value={formatCurrency(totalCardOutstanding, displayCurrency)}
                description={
                  largestCard
                    ? `Largest: ${largestCard.card_name} ${formatCurrency(largestCard.total_outstanding ?? 0, displayCurrency)}`
                    : 'No active card balances'
                }
                icon={CreditCard}
              />
              <MetricCard
                title="Savings Rate"
                value={savingsRate == null ? 'N/A' : `${Math.round(savingsRate)}%`}
                description="Income minus expenses / income"
                icon={PiggyBank}
                valueClassName={savingsRateColor}
              />
            </div>
          )}

          {loading ? (
            <>
              <ChartSectionSkeleton />
              <RecentTransactionsSkeleton />
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Cash Flow</CardTitle>
                    <CardDescription>Monthly income vs expenses over the last 6 months</CardDescription>
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

              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>Recent Transactions</CardTitle>
                    <CardDescription>Your latest statement activity</CardDescription>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="ml-auto">
                    <Link href="/transactions">
                      View all
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent>
                  {recentTxns.length === 0 ? (
                    <EmptyState
                      icon={ArrowLeftRight}
                      title="No transactions yet"
                      description="Import a statement to begin building your dashboard activity feed."
                      action={{ label: 'Import Statement', href: '/statements' }}
                    />
                  ) : (
                    <div className="space-y-1">
                      {recentTxns.map((transaction) => {
                        const category =
                          transaction.category_id != null ? categoryMap.get(transaction.category_id) : undefined
                        const isCredit = normalizeTxnDirection(transaction.txn_type) === 'credit'
                        const merchantName =
                          transaction.merchant?.name
                          ?? transaction.merchant_normalized
                          ?? transaction.merchant_raw
                          ?? transaction.description
                          ?? 'Unknown'

                        return (
                          <div
                            key={transaction.id}
                            className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">{merchantName}</p>
                              <p className="text-xs text-muted-foreground">
                                <CategoryBadge
                                  {...(category ?? {})}
                                  name={category?.name ?? null}
                                  fallbackLabel="Uncategorized"
                                  className="h-5 px-1.5 text-[11px]"
                                />{' '}
                                · {formatDateShort(transaction.txn_date)}
                              </p>
                            </div>
                            <span
                              className={cn(
                                'shrink-0 font-medium tabular-nums',
                                isCredit ? 'text-emerald-500' : 'text-foreground',
                              )}
                            >
                              {isCredit ? '+' : '-'}
                              {formatCurrency(Math.abs(transaction.amount), transaction.currency)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </>
      ) : null}

      <AccountPortfolioSection />
    </div>
  )
}
