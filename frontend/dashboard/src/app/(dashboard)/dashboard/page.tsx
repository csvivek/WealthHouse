'use client'

import Link from 'next/link'
import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { Wallet } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatCurrencyCompact, formatDateShort } from '@/lib/format'
import {
  DashboardPeriodPills,
  DashboardScopeDrawer,
  ExecutiveMetricCard,
  NetWorthTrendCard,
  SpendBreakdownCard,
  AccountSnapshotCard,
  RecentTransactionLedger,
  type RecentTransactionLedgerItem,
} from '@/components/dashboard/executive'
import { useDashboardAccounts } from '@/hooks/useDashboardAccounts'
import {
  buildExecutivePeriodSummary,
  buildExecutiveSpendBreakdown,
  buildNetWorthProxySeries,
  buildPendingAdvancesSummary,
} from '@/lib/dashboard-executive'
import {
  DEFAULT_OVERVIEW_FILTERS,
  deriveOverviewFilterOptions,
  isDefaultOverviewFilterSelection,
  resolveScopedCategoryIds,
  type OverviewCategory,
} from '@/lib/overview-filters'
import { resolveDatePeriodRange, type DatePeriod } from '@/lib/date-periods'
import { normalizeTxnDirection } from '@/lib/transactions/txn-direction'

const EXECUTIVE_THEME_STYLE: CSSProperties = {
  '--dashboard-bg': '#0B0F1A',
  '--dashboard-surface': '#111827',
  '--dashboard-surface-2': '#172033',
  '--dashboard-border': 'rgba(59, 74, 99, 0.46)',
  '--dashboard-border-strong': 'rgba(78, 95, 122, 0.78)',
  '--dashboard-accent': '#C9A84C',
  '--dashboard-accent-dim': 'rgba(201, 168, 76, 0.16)',
  '--dashboard-accent-glow': 'rgba(201, 168, 76, 0.44)',
  '--dashboard-success': '#2DD4BF',
  '--dashboard-danger': '#F87171',
  '--dashboard-info': '#60A5FA',
  '--dashboard-text': '#E2EAF4',
  '--dashboard-text-dim': '#8896AA',
  '--dashboard-chart-1': '#C9A84C',
  '--dashboard-chart-2': '#2DD4BF',
  '--dashboard-chart-3': '#60A5FA',
  '--dashboard-chart-4': '#F59E0B',
  '--dashboard-chart-5': '#A78BFA',
} as CSSProperties

interface Account {
  id: string
  account_type: string
  product_name: string
  nickname: string | null
  currency: string
}

interface StatementTransaction {
  id: string
  txn_date: string
  amount: number
  txn_type: string
  merchant_normalized: string | null
  merchant_raw: string | null
  merchant?: { name: string | null } | null
  category_id: number | null
  description: string | null
  currency: string
  account_id: string
}

interface CategoryWithHierarchy extends OverviewCategory {
  type: 'income' | 'expense' | 'transfer' | null
  icon_key: string | null
  color_token: string | null
  color_hex: string | null
  domain_type: string | null
  payment_subtype: string | null
}

interface AssetBalance {
  id: string
  account_id: string
  asset_id: string
  balance: number
  assets: { symbol: string; name: string | null; asset_type: string } | null
}

interface AdvanceSummaryRow {
  status: string
  expected_recovery_amount: number
  counterparties: { name: string | null } | null
}

interface AssetBalanceRow {
  id: string
  account_id: string
  asset_id: string
  balance: number
  assets: Array<{ symbol: string; name: string | null; asset_type: string }> | null
}

interface AdvanceSummaryQueryRow {
  status: string
  expected_recovery_amount: number
  counterparties: Array<{ name: string | null }> | null
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

function humanizeAccountType(accountType: string) {
  return accountType
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function EmptyDashboardCard({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: { label: string; href: string }
}) {
  return (
    <Card className="border-[color:var(--dashboard-border)] bg-[linear-gradient(180deg,rgba(17,24,39,0.94),rgba(12,18,31,0.98))] shadow-none">
      <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <div className="rounded-full border border-[color:var(--dashboard-border)] bg-[color:var(--dashboard-surface-2)] p-4">
          <Wallet className="size-8 text-[color:var(--dashboard-text-dim)]" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-[color:var(--dashboard-text)]">{title}</h2>
          <p className="max-w-lg text-sm text-[color:var(--dashboard-text-dim)]">{description}</p>
        </div>
        <Button asChild className="bg-[color:var(--dashboard-accent)] text-[color:var(--dashboard-bg)] hover:bg-[color:var(--dashboard-accent)]/90">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function MetricSkeleton() {
  return (
    <Card className="border-[color:var(--dashboard-border)] bg-[linear-gradient(180deg,rgba(17,24,39,0.94),rgba(12,18,31,0.98))] shadow-none">
      <CardHeader className="space-y-3">
        <Skeleton className="h-4 w-28 bg-white/8" />
        <Skeleton className="h-8 w-40 bg-white/8" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-44 bg-white/8" />
      </CardContent>
    </Card>
  )
}

function SurfaceSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn('border-[color:var(--dashboard-border)] bg-[linear-gradient(180deg,rgba(17,24,39,0.94),rgba(12,18,31,0.98))] shadow-none', className)}>
      <CardHeader className="space-y-3">
        <Skeleton className="h-4 w-28 bg-white/8" />
        <Skeleton className="h-7 w-48 bg-white/8" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-40 w-full bg-white/8" />
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filters, setFilters] = useState({ ...DEFAULT_OVERVIEW_FILTERS })
  const [autoExpandedToAllHistory, setAutoExpandedToAllHistory] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [allTxns, setAllTxns] = useState<StatementTransaction[]>([])
  const [categories, setCategories] = useState<CategoryWithHierarchy[]>([])
  const [assetBalances, setAssetBalances] = useState<AssetBalance[]>([])
  const [advances, setAdvances] = useState<AdvanceSummaryRow[]>([])
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
          setCategories([])
          setAssetBalances([])
          setAdvances([])
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
          setCategories([])
          setAssetBalances([])
          setAdvances([])
          return
        }

        const { data: accountData } = await supabase
          .from('accounts')
          .select('id, account_type, product_name, nickname, currency')
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

        const buildPaymentsQuery = () => {
          let query = supabase
            .from('statement_transactions')
            .select(
              'id, txn_date, amount, txn_type, merchant_normalized, merchant_raw, category_id, description, currency, account_id',
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

        let balancesQuery = supabase
          .from('asset_balances')
          .select('id, account_id, asset_id, balance, assets(symbol, name, asset_type)')

        if (scopedAccountIds.length > 0) {
          balancesQuery = balancesQuery.in('account_id', scopedAccountIds)
        } else if (filters.accountId !== 'all') {
          balancesQuery = balancesQuery.eq('account_id', filters.accountId)
        }

        const [paymentsRes, balancesRes, advancesRes] = await Promise.all([
          buildPaymentsQuery(),
          balancesQuery,
          supabase
            .from('advances')
            .select('status, expected_recovery_amount, counterparties(name)')
            .order('created_at', { ascending: false }),
        ])

        if (paymentsRes.error) throw paymentsRes.error
        if (balancesRes.error) throw balancesRes.error
        if (advancesRes.error) throw advancesRes.error

        if (!isActive) return

        const paymentRows = ((paymentsRes.data as unknown as StatementTransaction[] | null) ?? [])
        const balanceRows = (((balancesRes.data as AssetBalanceRow[] | null) ?? [])).map((row) => ({
          id: row.id,
          account_id: row.account_id,
          asset_id: row.asset_id,
          balance: row.balance,
          assets: Array.isArray(row.assets) ? row.assets[0] ?? null : null,
        }))
        const advanceRows = (((advancesRes.data as AdvanceSummaryQueryRow[] | null) ?? [])).map((row) => ({
          status: row.status,
          expected_recovery_amount: row.expected_recovery_amount,
          counterparties: Array.isArray(row.counterparties) ? row.counterparties[0] ?? null : null,
        }))

        if (
          isDefaultOverviewFilterSelection(filters)
          && paymentRows.length === 0
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

          const historicalPaymentsRes = await historicalPaymentsQuery
          if (historicalPaymentsRes.error) throw historicalPaymentsRes.error

          if (((historicalPaymentsRes.data as Array<{ id: string }> | null) ?? []).length > 0) {
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
        setAllTxns(paymentRows)
        setCategories(categoryRows)
        setAssetBalances(balanceRows)
        setAdvances(advanceRows)
      } catch (error) {
        console.error('Failed to load dashboard data:', error)
        if (!isActive) return
        setLoadError(describeDashboardLoadError(error))
        setAccounts([])
        setAllTxns([])
        setCategories([])
        setAssetBalances([])
        setAdvances([])
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

  const accountMap = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  )

  const usablePortfolioAccounts = useMemo(
    () => portfolioAccounts.filter(isPortfolioSummaryUsable),
    [portfolioAccounts],
  )

  const filteredPortfolioAccounts = useMemo(
    () => (
      filters.accountId === 'all'
        ? usablePortfolioAccounts
        : usablePortfolioAccounts.filter((account) => account.id === filters.accountId)
    ),
    [filters.accountId, usablePortfolioAccounts],
  )

  const displayCurrency =
    accounts.find((account) => account.currency)?.currency
    || filteredPortfolioAccounts.find((account) => account.currency)?.currency
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

  const periodSpend = useMemo(
    () =>
      scopedTransactions
        .filter((transaction) => normalizeTxnDirection(transaction.txn_type) === 'debit')
        .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
    [scopedTransactions],
  )

  const periodIncome = useMemo(
    () =>
      scopedTransactions
        .filter((transaction) => normalizeTxnDirection(transaction.txn_type) === 'credit')
        .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
    [scopedTransactions],
  )

  const spendBreakdown = useMemo(
    () =>
      buildExecutiveSpendBreakdown({
        transactions: scopedTransactions,
        categoriesById: new Map(
          categories.map((category) => [
            category.id,
            {
              name: category.name,
              color_hex: category.color_hex,
              color_token: category.color_token,
            },
          ]),
        ),
      }),
    [categories, scopedTransactions],
  )

  const advancesSummary = useMemo(
    () => buildPendingAdvancesSummary(advances),
    [advances],
  )

  const netWorth = useMemo(() => {
    if (filteredPortfolioAccounts.length > 0) {
      let assets = 0
      let liabilities = 0

      for (const account of filteredPortfolioAccounts) {
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

      if (!filteredPortfolioAccounts.some((account) => ['investment', 'crypto_exchange'].includes(account.accountType))) {
        assets += assetBalances.reduce((sum, balance) => sum + Math.max(balance.balance, 0), 0)
      }

      return assets - liabilities
    }

    return assetBalances.reduce((sum, balance) => sum + Math.max(balance.balance, 0), 0)
  }, [assetBalances, filteredPortfolioAccounts])

  const trendSeries = useMemo(
    () =>
      buildNetWorthProxySeries({
        transactions: scopedTransactions,
        netWorth,
        period: filters.period,
      }),
    [filters.period, netWorth, scopedTransactions],
  )

  const executivePeriod = useMemo(
    () => buildExecutivePeriodSummary(filters.period),
    [filters.period],
  )

  const accountSnapshotItems = useMemo(
    () =>
      filteredPortfolioAccounts
        .map((account) => {
          const rawValue =
            account.accountType === 'credit_card'
              ? -Math.abs(account.statementBalance ?? 0)
              : ['loan', 'balance_transfer', 'easy_credit'].includes(account.accountType)
                ? -Math.abs(account.pendingPrincipal ?? account.statementBalance ?? 0)
                : account.currentBalance ?? account.statementBalance ?? 0

          return {
            id: account.id,
            title: account.title ?? account.accountName,
            subtitle: account.institution ?? account.subtitle ?? humanizeAccountType(account.accountType),
            value: rawValue,
            currency: account.currency,
            note:
              account.dueDate
                ? `Due ${formatDateShort(account.dueDate)}`
                : account.minimumDue != null
                  ? `Min due ${formatCurrency(account.minimumDue, account.currency)}`
                  : humanizeAccountType(account.accountType),
            tone: rawValue < 0 ? 'liability' : 'asset' as 'liability' | 'asset',
          }
        })
        .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
        .slice(0, 5),
    [filteredPortfolioAccounts],
  )

  const recentLedgerItems = useMemo<RecentTransactionLedgerItem[]>(
    () =>
      allTxns.slice(0, 8).map((transaction) => {
        const category =
          transaction.category_id != null ? categoryMap.get(transaction.category_id) : null
        const account = accountMap.get(transaction.account_id)
        const merchant =
          transaction.merchant?.name
          ?? transaction.merchant_normalized
          ?? transaction.merchant_raw
          ?? transaction.description
          ?? 'Unknown'

        return {
          id: transaction.id,
          date: transaction.txn_date,
          merchant,
          category: category?.name ?? 'Uncategorized',
          categoryColorHex: category?.color_hex ?? null,
          categoryColorToken: category?.color_token ?? null,
          accountLabel: account?.nickname ?? account?.product_name ?? 'Unknown account',
          amount: transaction.amount,
          currency: transaction.currency,
          isCredit: normalizeTxnDirection(transaction.txn_type) === 'credit',
        }
      }),
    [accountMap, allTxns, categoryMap],
  )

  const hasAccounts = accounts.length > 0
  const hasTransactions = allTxns.length > 0
  const kpiLoading = loading || portfolioLoading
  const showDashboardSetupEmptyState = !loading && !loadError && !hasAccounts
  const showTransactionsEmptyState = !loading && !loadError && hasAccounts && !hasTransactions

  const handlePrimaryPeriodChange = (period: DatePeriod) => {
    setAutoExpandedToAllHistory(false)
    setFilters((current) => ({ ...current, period }))
  }

  const handleFiltersChange = (nextFilters: typeof filters) => {
    setAutoExpandedToAllHistory(false)
    setFilters(nextFilters)
  }

  const handleFiltersReset = () => {
    setAutoExpandedToAllHistory(false)
    setFilters({ ...DEFAULT_OVERVIEW_FILTERS })
  }

  return (
    <div
      className="space-y-6"
      style={EXECUTIVE_THEME_STYLE}
    >
      <div
        className="space-y-6 text-[color:var(--dashboard-text)]"
        style={{ fontFamily: 'var(--font-dm-sans)' }}
      >
        <div className="space-y-6">
          <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-2">
              <p
                className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--dashboard-text-dim)]"
                style={{ fontFamily: 'var(--font-dm-mono)' }}
              >
                Overview
              </p>
              <h1 className="text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
                Executive household overview
              </h1>
              <p className="max-w-3xl text-sm text-[color:var(--dashboard-text-dim)] sm:text-base">
                {executivePeriod.rangeLabel}
                {' · '}
                Live balances, filtered cash flow, spend concentration, and review workload in one surface.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <DashboardPeriodPills
                value={filters.period}
                onChange={handlePrimaryPeriodChange}
              />
              <DashboardScopeDrawer
                filters={filters}
                accountOptions={accountOptions}
                categoryOptions={categoryOptions}
                groupOptions={groupOptions}
                subgroupOptions={subgroupOptions}
                onChange={handleFiltersChange}
                onReset={handleFiltersReset}
              />
            </div>
          </section>

          {autoExpandedToAllHistory ? (
            <Card className="border-[color:var(--dashboard-border)] bg-[color:var(--dashboard-surface)] shadow-none">
              <CardContent className="px-4 py-3 text-sm text-[color:var(--dashboard-text-dim)]">
                Showing all history because no activity was found for the default month scope.
              </CardContent>
            </Card>
          ) : null}

          {loadError ? (
            <Card className="border-[color:var(--dashboard-danger)]/60 bg-[color:var(--dashboard-surface)] shadow-none">
              <CardHeader>
                <CardTitle className="text-base text-[color:var(--dashboard-text)]">Unable to load dashboard data</CardTitle>
                <CardDescription className="text-[color:var(--dashboard-danger)]">{loadError}</CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {!loadError && showDashboardSetupEmptyState ? (
            <EmptyDashboardCard
              title="Welcome to Wealth House"
              description="Add your first account and import a statement to unlock the executive dashboard."
              action={{ label: 'Add Account', href: '/accounts' }}
            />
          ) : null}

          {!loadError && showTransactionsEmptyState ? (
            <EmptyDashboardCard
              title="No transactions in scope"
              description="Import a statement to populate cash flow, spend concentration, and the activity ledger."
              action={{ label: 'Import Statement', href: '/statements' }}
            />
          ) : null}

          {!loadError && !showDashboardSetupEmptyState && !showTransactionsEmptyState ? (
            <>
              {kpiLoading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <MetricSkeleton key={index} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <ExecutiveMetricCard
                    label="Net Worth"
                    value={formatCurrencyCompact(netWorth, displayCurrency)}
                    description="Live household assets less liabilities."
                    tone="accent"
                    monoFontFamily="var(--font-dm-mono)"
                  />
                  <ExecutiveMetricCard
                    label={executivePeriod.spendLabel}
                    value={formatCurrencyCompact(periodSpend, displayCurrency)}
                    description={`${executivePeriod.rangeLabel} filtered spend.`}
                    tone="red"
                    monoFontFamily="var(--font-dm-mono)"
                  />
                  <ExecutiveMetricCard
                    label={executivePeriod.incomeLabel}
                    value={formatCurrencyCompact(periodIncome, displayCurrency)}
                    description={
                      periodIncome > 0
                        ? `${executivePeriod.rangeLabel} filtered income.`
                        : `No income recorded in ${executivePeriod.label.toLowerCase()}.`
                    }
                    tone="green"
                    monoFontFamily="var(--font-dm-mono)"
                  />
                  <ExecutiveMetricCard
                    label="Pending Advances"
                    value={formatCurrencyCompact(advancesSummary.totalOutstanding, displayCurrency)}
                    description={
                      advancesSummary.advanceCount > 0
                        ? `${advancesSummary.counterpartyCount || advancesSummary.advanceCount} counterparties still open.`
                        : 'All tracked advances are settled.'
                    }
                    tone="blue"
                    monoFontFamily="var(--font-dm-mono)"
                  />
                </div>
              )}

              {loading ? (
                <>
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
                    <SurfaceSkeleton className="xl:col-span-2" />
                    <SurfaceSkeleton />
                    <SurfaceSkeleton />
                  </div>
                  <SurfaceSkeleton />
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
                    <div id="net-worth" className="xl:col-span-2">
                      <NetWorthTrendCard
                        title="Net Worth Proxy Trend"
                        value={netWorth}
                        currency={displayCurrency}
                        series={trendSeries}
                        rangeLabel={executivePeriod.rangeLabel}
                        annotation="Approximation from filtered cash flow"
                        monoFontFamily="var(--font-dm-mono)"
                      />
                    </div>

                    <SpendBreakdownCard
                      rows={spendBreakdown.rows}
                      total={spendBreakdown.total}
                      currency={displayCurrency}
                      monoFontFamily="var(--font-dm-mono)"
                    />

                    <AccountSnapshotCard
                      items={accountSnapshotItems}
                      monoFontFamily="var(--font-dm-mono)"
                    />
                  </div>

                  <RecentTransactionLedger
                    items={recentLedgerItems}
                    monoFontFamily="var(--font-dm-mono)"
                  />
                </>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
