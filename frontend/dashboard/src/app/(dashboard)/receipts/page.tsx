'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, UploadCloud, FileText, TriangleAlert, CheckCircle2, CircleX, Eye } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface UploadRow {
  id: string
  status: string
  original_filename: string
  file_size_bytes: number
  mime_type: string
  created_at: string
  parse_error: string | null
  committed_receipt_id: string | null
}

interface FinalReceiptRow {
  id: string
  merchant_raw: string
  total_amount: number
  currency: string
  created_at: string
  approved_at: string | null
  status: string
  source_upload_id: string | null
}

interface UploadStats {
  totalUploads: number
  parsing: number
  needsReview: number
  ready: number
  committed: number
  failed: number
  finalReceipts: number
}

const statusConfig: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  uploaded: { label: 'Uploaded', className: 'bg-slate-100 text-slate-700 dark:bg-slate-900/50 dark:text-slate-300', icon: FileText },
  parsing: { label: 'Parsing', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300', icon: Loader2 },
  needs_review: { label: 'Needs Review', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300', icon: TriangleAlert },
  ready_for_approval: { label: 'Ready', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300', icon: CheckCircle2 },
  committed: { label: 'Committed', className: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300', icon: CheckCircle2 },
  failed: { label: 'Failed', className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300', icon: CircleX },
}

function humanFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

export default function ReceiptsPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploads, setUploads] = useState<UploadRow[]>([])
  const [receipts, setReceipts] = useState<FinalReceiptRow[]>([])
  const [stats, setStats] = useState<UploadStats>({
    totalUploads: 0,
    parsing: 0,
    needsReview: 0,
    ready: 0,
    committed: 0,
    failed: 0,
    finalReceipts: 0,
  })

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/receipts/uploads', { cache: 'no-store' })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const message = payload?.action ? String(payload.error) + ' ' + String(payload.action) : payload?.error ?? 'Failed to load receipts data'
        throw new Error(message)
      }

      const payload = await response.json() as {
        uploads: UploadRow[]
        receipts: FinalReceiptRow[]
        stats: UploadStats
      }

      setUploads(payload.uploads ?? [])
      setReceipts(payload.receipts ?? [])
      setStats((current) => payload.stats ?? current)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load receipts data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!uploads.some((upload) => upload.status === 'parsing')) return

    const timer = setInterval(() => {
      void fetchData()
    }, 2500)

    return () => clearInterval(timer)
  }, [uploads, fetchData])

  const latestUploads = useMemo(() => uploads.slice(0, 12), [uploads])
  const latestReceipts = useMemo(() => receipts.slice(0, 10), [receipts])

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('receipt', file)

      const response = await fetch('/api/receipts/upload', {
        method: 'POST',
        body: form,
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        const message = payload?.error || 'Upload failed'
        const action = payload?.action
        toast.error(action ? `${message} ${action}` : message)
        return
      }

      const uploadId = payload.uploadId as string | undefined
      toast.success('Receipt uploaded. Parsing started.')
      await fetchData()
      if (uploadId) {
        router.push(`/receipts/review/${uploadId}`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Receipts</h1>
          <p className="text-muted-foreground">Upload receipts, review staged extraction, then approve into final receipt records.</p>
        </div>

        <label className="inline-flex items-center gap-2">
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              await handleUpload(file)
              event.target.value = ''
            }}
          />
          <span className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
            {uploading ? 'Uploading…' : 'Upload Receipt'}
          </span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Card><CardContent className="pt-0"><p className="text-xs text-muted-foreground">Total Uploads</p><p className="text-2xl font-bold">{stats.totalUploads}</p></CardContent></Card>
        <Card><CardContent className="pt-0"><p className="text-xs text-muted-foreground">Parsing</p><p className="text-2xl font-bold text-blue-600">{stats.parsing}</p></CardContent></Card>
        <Card><CardContent className="pt-0"><p className="text-xs text-muted-foreground">Needs Review</p><p className="text-2xl font-bold text-amber-600">{stats.needsReview}</p></CardContent></Card>
        <Card><CardContent className="pt-0"><p className="text-xs text-muted-foreground">Ready</p><p className="text-2xl font-bold text-emerald-600">{stats.ready}</p></CardContent></Card>
        <Card><CardContent className="pt-0"><p className="text-xs text-muted-foreground">Committed</p><p className="text-2xl font-bold text-green-600">{stats.committed}</p></CardContent></Card>
        <Card><CardContent className="pt-0"><p className="text-xs text-muted-foreground">Final Receipts</p><p className="text-2xl font-bold">{stats.finalReceipts}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receipt Upload Queue</CardTitle>
        </CardHeader>
        <CardContent>
          {latestUploads.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No receipt uploads yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Uploaded</th>
                    <th className="pb-2 pr-4 font-medium">File</th>
                    <th className="pb-2 pr-4 font-medium">Size</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Error</th>
                    <th className="pb-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {latestUploads.map((upload) => {
                    const config = statusConfig[upload.status] || statusConfig.uploaded
                    const StatusIcon = config.icon
                    return (
                      <tr key={upload.id} className="border-b last:border-0">
                        <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">{formatDate(upload.created_at)}</td>
                        <td className="py-3 pr-4 font-medium">{upload.original_filename}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{humanFileSize(upload.file_size_bytes)}</td>
                        <td className="py-3 pr-4">
                          <Badge className={cn('inline-flex items-center gap-1 border-0 text-xs', config.className)}>
                            <StatusIcon className={cn('size-3', upload.status === 'parsing' && 'animate-spin')} />
                            {config.label}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4 text-xs text-muted-foreground">{upload.parse_error || '-'}</td>
                        <td className="py-3">
                          <Button variant="outline" size="sm" className="gap-1" onClick={() => router.push(`/receipts/review/${upload.id}`)}>
                            <Eye className="size-3.5" />
                            Review
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recently Approved Receipts</CardTitle>
        </CardHeader>
        <CardContent>
          {latestReceipts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No approved receipts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Date</th>
                    <th className="pb-2 pr-4 font-medium">Merchant</th>
                    <th className="pb-2 pr-4 font-medium">Amount</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {latestReceipts.map((receipt) => (
                    <tr key={receipt.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 text-muted-foreground">{formatDate(receipt.approved_at || receipt.created_at)}</td>
                      <td className="py-3 pr-4 font-medium">{receipt.merchant_raw}</td>
                      <td className="py-3 pr-4 font-medium">{formatCurrency(receipt.total_amount, receipt.currency)}</td>
                      <td className="py-3">
                        <Badge className="border-0 bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">{receipt.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
