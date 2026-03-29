'use client'

import { useEffect, useState } from 'react'
import { Loader2, TrendingDown, TrendingUp } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AnalyticsBreakdownRow } from '@/app/api/analytics/breakdown/route'
import type { AnalyticsTransaction } from '@/app/api/analytics/transactions/route'

interface TransactionDetailDialogProps {
  slice: AnalyticsBreakdownRow | null
  currency: string
  analyticsParams: {
    period: string
    accountIds: string[]
    direction: string
    dimension: string
  }
  onClose: () => void
}

export function TransactionDetailDialog({
  slice,
  currency,
  analyticsParams,
  onClose,
}: TransactionDetailDialogProps) {
  const [transactions, setTransactions] = useState<AnalyticsTransaction[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!slice) return
    setLoading(true)
    setTransactions([])

    const params = new URLSearchParams({
      period: analyticsParams.period,
      direction: analyticsParams.direction,
      dimension: analyticsParams.dimension,
      dimensionId: slice.id == null ? 'null' : String(slice.id),
    })
    if (analyticsParams.accountIds.length > 0) {
      params.set('accountIds', analyticsParams.accountIds.join(','))
    }

    fetch(`/api/analytics/transactions?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setTransactions(data.transactions ?? [])
        setTotal(data.total ?? 0)
      })
      .finally(() => setLoading(false))
  }, [slice, analyticsParams])

  return (
    <Dialog open={slice !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{slice?.label}</span>
            {!loading && (
              <span className="text-base font-normal text-muted-foreground">
                — {formatCurrency(slice?.amount ?? 0, currency)} ({slice?.count} txn{(slice?.count ?? 0) !== 1 ? 's' : ''})
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            No transactions found
          </div>
        ) : (
          <>
            <ScrollArea className="max-h-[420px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Date</th>
                    <th className="pb-2 pr-3 font-medium">Account</th>
                    <th className="pb-2 pr-3 font-medium">Merchant / Description</th>
                    <th className="pb-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((txn) => {
                    const isCredit = txn.txn_type === 'credit'
                    const label = txn.merchant_normalized || txn.description || '—'
                    return (
                      <tr key={txn.id} className="border-b border-border/40 last:border-0">
                        <td className="py-2.5 pr-3 text-muted-foreground whitespace-nowrap">
                          {formatDate(txn.txn_date)}
                        </td>
                        <td className="py-2.5 pr-3 text-muted-foreground whitespace-nowrap max-w-[100px] truncate">
                          {txn.account_label}
                        </td>
                        <td className="py-2.5 pr-3 max-w-[200px]">
                          <span className="block truncate">{label}</span>
                          {txn.tags.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {txn.tags.map((tag) => (
                                <Badge key={tag.name} variant="secondary" className="h-4 px-1.5 text-[10px]">
                                  {tag.name}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className={cn(
                          'py-2.5 text-right font-medium whitespace-nowrap',
                          isCredit ? 'text-emerald-500' : 'text-foreground',
                        )}>
                          <span className="inline-flex items-center gap-1">
                            {isCredit
                              ? <TrendingUp className="size-3 shrink-0" />
                              : <TrendingDown className="size-3 shrink-0" />}
                            {formatCurrency(txn.amount, txn.currency)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </ScrollArea>

            <div className="flex items-center justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">{transactions.length} transactions</span>
              <span className="font-semibold">{formatCurrency(total, currency)}</span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
