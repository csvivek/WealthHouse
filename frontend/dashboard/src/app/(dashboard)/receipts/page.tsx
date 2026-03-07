'use client'

import { useState, useEffect } from 'react'
import { Receipt, Loader2, CheckCircle2, XCircle, AlertTriangle, Copy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const statusConfig: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  pending_confirm: { label: 'Pending', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400', icon: AlertTriangle },
  confirmed: { label: 'Confirmed', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400', icon: CheckCircle2 },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400', icon: XCircle },
  duplicate: { label: 'Duplicate', className: 'bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-400', icon: Copy },
}

interface ReceiptRow {
  id: string
  receipt_datetime: string | null
  merchant_raw: string
  total_amount: number
  currency: string
  extraction_confidence: number
  status: string
  source: string
  created_at: string
}

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<ReceiptRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    async function fetchReceipts() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data } = await supabase
        .from('receipts')
        .select('id, receipt_datetime, merchant_raw, total_amount, currency, extraction_confidence, status, source, created_at')
        .order('created_at', { ascending: false })

      setReceipts((data as ReceiptRow[]) ?? [])
      setLoading(false)
    }
    fetchReceipts()
  }, [])

  const pendingCount = receipts.filter(r => r.status === 'pending_confirm').length
  const confirmedCount = receipts.filter(r => r.status === 'confirmed').length

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
        <h1 className="text-2xl font-bold tracking-tight">Receipts</h1>
        <p className="text-muted-foreground">Review parsed receipts from Telegram and uploads.</p>
        <div className="mt-4">
          <label className="inline-flex items-center gap-2">
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={async e => {
                const file = e.target.files?.[0]
                if (!file) return
                setUploading(true)
                try {
                  const fd = new FormData()
                  fd.append('receipt', file)
                  const res = await fetch('/api/receipts/upload', {
                    method: 'POST',
                    body: fd,
                  })
                  if (res.ok) {
                    await res.json()
                    // refresh receipts
                    const supabase = createClient()
                    const { data } = await supabase
                      .from('receipts')
                      .select('id, receipt_datetime, merchant_raw, total_amount, currency, extraction_confidence, status, source, created_at')
                      .order('created_at', { ascending: false })
                    setReceipts((data as ReceiptRow[]) ?? [])
                  } else {
                    console.error('Upload failed', await res.text())
                  }
                } catch (err) {
                  console.error(err)
                } finally {
                  setUploading(false)
                  e.target.value = ''
                }
              }}
            />
            <span className="cursor-pointer rounded bg-blue-500 px-4 py-2 text-white text-sm font-medium hover:bg-blue-600">
              {uploading ? 'Uploading…' : 'Upload Receipt'}
            </span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">Total Receipts</p>
            <p className="text-2xl font-bold">{receipts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">Pending Review</p>
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">Confirmed</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{confirmedCount}</p>
          </CardContent>
        </Card>
      </div>

      {receipts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Receipt className="mb-4 size-12 text-muted-foreground" />
            <p className="text-lg font-medium text-muted-foreground">
              No receipts yet. Send receipt images via Telegram or upload them to start tracking.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Receipts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Date</th>
                    <th className="pb-3 pr-4 font-medium">Merchant</th>
                    <th className="pb-3 pr-4 font-medium">Amount</th>
                    <th className="pb-3 pr-4 font-medium">Source</th>
                    <th className="pb-3 pr-4 font-medium">Confidence</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map(receipt => {
                    const config = statusConfig[receipt.status] ?? statusConfig.pending_confirm
                    const confidencePct = Math.round(receipt.extraction_confidence * 100)
                    return (
                      <tr key={receipt.id} className="border-b last:border-0">
                        <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                          {receipt.receipt_datetime ? formatDate(receipt.receipt_datetime) : formatDate(receipt.created_at)}
                        </td>
                        <td className="py-3 pr-4 font-medium">{receipt.merchant_raw}</td>
                        <td className="py-3 pr-4 font-medium tabular-nums">
                          {formatCurrency(receipt.total_amount, receipt.currency)}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground capitalize">{receipt.source}</td>
                        <td className="py-3 pr-4">
                          <span className={cn(
                            'text-xs font-medium',
                            confidencePct >= 90 ? 'text-green-600' : confidencePct >= 70 ? 'text-yellow-600' : 'text-red-600'
                          )}>
                            {confidencePct}%
                          </span>
                        </td>
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
