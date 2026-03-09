'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { DrilldownSummaryCard } from '@/components/dashboard/DrilldownSummaryCard'
import { TransactionDrilldownTable } from '@/components/dashboard/TransactionDrilldownTable'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatDate } from '@/lib/format'
import { useBreakdownTransactions } from '@/hooks/useBreakdownTransactions'

const PAGE_SIZE = 25

export default function DashboardDrilldownPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const tab = searchParams.get('tab') ?? 'spending'
  const filter = searchParams.get('filter') ?? 'all'
  const dimensionKey = searchParams.get('dimensionKey') ?? 'all'
  const page = Number(searchParams.get('page') ?? '1')
  const safePage = Number.isFinite(page) && page > 0 ? page : 1

  const { data, loading, error } = useBreakdownTransactions({
    tab,
    filter,
    dimensionKey,
    limit: PAGE_SIZE,
    offset: (safePage - 1) * PAGE_SIZE,
  })

  const onPageChange = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(nextPage))
    router.push(`/dashboard/drilldown?${params.toString()}`)
  }

  return (
    <div className="space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">
          Dashboard
        </Link>{' '}
        / <span className="text-foreground">Drilldown</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Drilldown</h1>
        <p className="text-muted-foreground">
          Tab: {tab} • Filter: {filter} • Dimension: {dimensionKey}
        </p>
      </div>

      {loading ? (
        <div className="flex h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card>
          <CardHeader>
            <CardTitle>Unable to load drilldown</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <DrilldownSummaryCard
              label="Selected period"
              value={data?.selectedPeriodLabel ?? 'Selected period'}
            />
            <DrilldownSummaryCard
              label="Subtotal"
              value={formatCurrency(data?.subtotal ?? 0)}
            />
            <DrilldownSummaryCard
              label="Transaction count"
              value={String(data?.totalCount ?? 0)}
            />
            <DrilldownSummaryCard
              label="Busiest day"
              value={data?.busiestDay ? formatDate(data.busiestDay) : '-'}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <TransactionDrilldownTable
                transactions={data?.transactions ?? []}
                page={safePage}
                pageSize={PAGE_SIZE}
                totalCount={data?.totalCount ?? 0}
                onPageChange={onPageChange}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
