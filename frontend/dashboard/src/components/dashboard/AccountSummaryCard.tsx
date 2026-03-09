import { Building2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatDateShort } from '@/lib/format'
import type { DashboardAccountSummary } from '@/hooks/useDashboardAccounts'

interface AccountSummaryCardProps {
  account: DashboardAccountSummary
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

export function AccountSummaryCard({ account }: AccountSummaryCardProps) {
  const displayTitle = account.title ?? account.accountType.replaceAll('_', ' ')
  const dueDate = account.dueDate ? formatDateShort(account.dueDate) : '—'

  const isCash = ['bank', 'savings', 'current'].includes(account.accountType)
  const isCard = account.accountType === 'credit_card'
  const isLoan = ['loan', 'balance_transfer', 'easy_credit'].includes(account.accountType)

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="text-base leading-tight">{account.accountName}</CardTitle>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="capitalize">{displayTitle}</p>
          {account.subtitle && <p>{account.subtitle}</p>}
          <p className="flex items-center gap-1.5">
            <Building2 className="size-3" />
            <span>{account.institution ?? 'Manual account'}</span>
          </p>
          <p>{account.currency}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {(isCash || (!isCard && !isLoan)) && (
          <MetricRow
            label="Current balance"
            value={formatCurrency(account.currentBalance ?? 0, account.currency)}
          />
        )}

        {isCard && (
          <>
            <MetricRow
              label="Statement balance"
              value={formatCurrency(account.statementBalance ?? 0, account.currency)}
            />
            <MetricRow
              label="Minimum due"
              value={formatCurrency(account.minimumDue ?? 0, account.currency)}
            />
            <MetricRow label="Due date" value={dueDate} />
          </>
        )}

        {isLoan && (
          <>
            <MetricRow
              label="Pending principal"
              value={formatCurrency(account.pendingPrincipal ?? 0, account.currency)}
            />
            <MetricRow
              label="Minimum due"
              value={formatCurrency(account.minimumDue ?? 0, account.currency)}
            />
            <MetricRow label="Due date" value={dueDate} />
          </>
        )}
      </CardContent>
    </Card>
  )
}
