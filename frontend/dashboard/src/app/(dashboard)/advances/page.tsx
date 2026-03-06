'use client'

import { useState, useEffect } from 'react'
import { HandCoins, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' },
  partial: { label: 'Partial', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  settled: { label: 'Settled', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  written_off: { label: 'Written Off', className: 'bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-400' },
}

interface AdvanceRow {
  id: string
  is_recoverable: boolean
  expected_recovery_amount: number
  status: string
  due_date: string | null
  notes: string | null
  counterparties: { name: string; relationship: string | null } | null
}

export default function AdvancesPage() {
  const [advances, setAdvances] = useState<AdvanceRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const { data } = await supabase
        .from('advances')
        .select('id, is_recoverable, expected_recovery_amount, status, due_date, notes, counterparties(name, relationship)')
        .order('created_at', { ascending: false })

      setAdvances((data as AdvanceRow[]) ?? [])
      setLoading(false)
    }
    fetchData()
  }, [])

  const totalPending = advances
    .filter(a => a.status === 'pending' || a.status === 'partial')
    .reduce((s, a) => s + a.expected_recovery_amount, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Advances</h1>
        <p className="text-muted-foreground">Track money lent to or borrowed from others.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">Total Advances</p>
            <p className="text-2xl font-bold">{advances.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">Outstanding Amount</p>
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {formatCurrency(totalPending)}
            </p>
          </CardContent>
        </Card>
      </div>

      {advances.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <HandCoins className="mb-4 size-12 text-muted-foreground" />
            <p className="text-lg font-medium text-muted-foreground">
              No advances tracked yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">All Advances</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Counterparty</th>
                    <th className="pb-3 pr-4 font-medium">Amount</th>
                    <th className="pb-3 pr-4 font-medium">Due Date</th>
                    <th className="pb-3 pr-4 font-medium">Recoverable</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {advances.map(adv => {
                    const config = statusConfig[adv.status] ?? statusConfig.pending
                    return (
                      <tr key={adv.id} className="border-b last:border-0">
                        <td className="py-3 pr-4">
                          <p className="font-medium">{adv.counterparties?.name ?? 'Unknown'}</p>
                          {adv.counterparties?.relationship && (
                            <p className="text-xs text-muted-foreground">{adv.counterparties.relationship}</p>
                          )}
                        </td>
                        <td className="py-3 pr-4 font-medium tabular-nums">{formatCurrency(adv.expected_recovery_amount)}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{adv.due_date ? formatDate(adv.due_date) : '—'}</td>
                        <td className="py-3 pr-4">{adv.is_recoverable ? 'Yes' : 'No'}</td>
                        <td className="py-3">
                          <Badge className={cn('text-xs border-0', config.className)}>{config.label}</Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
