import { AccountSummaryCard } from '@/components/dashboard/AccountSummaryCard'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDashboardAccounts } from '@/hooks/useDashboardAccounts'

function AccountCardSkeleton() {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-2/3" />
      </CardContent>
    </Card>
  )
}

export function AccountPortfolioSection() {
  const { accounts, loading } = useDashboardAccounts()

  return (
    <section>
      <Card>
        <CardHeader>
          <CardTitle>Account Portfolio</CardTitle>
          <CardDescription>Household account balances and payment metrics.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <AccountCardSkeleton key={index} />
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No household accounts found yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {accounts.map((account) => (
                <AccountSummaryCard key={account.id} account={account} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
