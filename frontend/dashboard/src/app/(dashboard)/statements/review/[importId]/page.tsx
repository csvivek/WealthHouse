'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  Copy,
  Pencil,
  Check,
  X,
  ChevronDown,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ── Types ──

interface ImportMeta {
  id: string
  status: string
  fileName: string
  institutionCode: string | null
  statementDate: string | null
  period: { start: string | null; end: string | null }
  summary: Record<string, unknown> | null
  cardInfo: Record<string, unknown> | null
  currency: string | null
  createdAt: string
}

interface StagingRow {
  id: string
  rowIndex: number
  reviewStatus: 'pending' | 'approved' | 'rejected' | 'committed'
  duplicateStatus: 'none' | 'existing_final' | 'within_import'
  duplicateTransactionId: string | null
  isEdited: boolean
  txnDate: string
  postingDate: string | null
  merchantRaw: string
  description: string | null
  amount: number
  txnType: string
  currency: string
  reference: string | null
  originalAmount: number | null
  originalCurrency: string | null
  originalData: Record<string, unknown>
  reviewNote: string | null
}

interface Stats {
  total: number
  pending: number
  approved: number
  rejected: number
  committed: number
  duplicates: number
  debitTotal: number
  creditTotal: number
}

type FilterStatus = 'all' | 'pending' | 'approved' | 'rejected' | 'committed' | 'duplicate'

// ── Status badge helpers ──

const reviewStatusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  committed: { label: 'Committed', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
}

const duplicateStatusConfig: Record<string, { label: string; className: string }> = {
  none: { label: '', className: '' },
  existing_final: { label: 'Duplicate', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' },
  within_import: { label: 'Dup in file', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
}

// ── Main Component ──

export default function ReviewPage() {
  const params = useParams()
  const router = useRouter()
  const importId = params.importId as string

  const [loading, setLoading] = useState(true)
  const [importMeta, setImportMeta] = useState<ImportMeta | null>(null)
  const [rows, setRows] = useState<StagingRow[]>([])
  const [stats, setStats] = useState<Stats | null>(null)

  const [filter, setFilter] = useState<FilterStatus>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<StagingRow>>({})

  const [actionLoading, setActionLoading] = useState(false)
  const [commitLoading, setCommitLoading] = useState(false)

  // ── Fetch data ──

  const fetchReviewData = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai/statement/${importId}`)
      if (!res.ok) {
        toast.error('Failed to load review data')
        return
      }
      const data = await res.json()
      setImportMeta(data.import)
      setRows(data.rows)
      setStats(data.stats)
    } catch {
      toast.error('Failed to load review data')
    } finally {
      setLoading(false)
    }
  }, [importId])

  useEffect(() => { fetchReviewData() }, [fetchReviewData])

  // ── Filtered rows ──

  const filteredRows = useMemo(() => {
    if (filter === 'all') return rows
    if (filter === 'duplicate') return rows.filter(r => r.duplicateStatus !== 'none')
    return rows.filter(r => r.reviewStatus === filter)
  }, [rows, filter])

  // ── Selection helpers ──

  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every(r => selectedIds.has(r.id))
  const someFilteredSelected = filteredRows.some(r => selectedIds.has(r.id))

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        filteredRows.forEach(r => next.delete(r.id))
        return next
      })
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        filteredRows.forEach(r => next.add(r.id))
        return next
      })
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Bulk actions ──

  async function handleBulkAction(reviewStatus: 'approved' | 'rejected') {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      toast.error('No rows selected')
      return
    }

    setActionLoading(true)
    try {
      const res = await fetch(`/api/ai/statement/${importId}/rows`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIds: ids, reviewStatus }),
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Failed to update rows')
        return
      }

      toast.success(`${ids.length} row(s) ${reviewStatus}`)
      setSelectedIds(new Set())
      await fetchReviewData()
    } catch {
      toast.error('Failed to update rows')
    } finally {
      setActionLoading(false)
    }
  }

  // ── Single row approve/reject ──

  async function handleRowAction(rowId: string, reviewStatus: 'approved' | 'rejected') {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/ai/statement/${importId}/rows`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIds: [rowId], reviewStatus }),
      })

      if (!res.ok) {
        toast.error('Failed to update row')
        return
      }

      toast.success(`Row ${reviewStatus}`)
      await fetchReviewData()
    } catch {
      toast.error('Failed to update row')
    } finally {
      setActionLoading(false)
    }
  }

  // ── Inline editing ──

  function startEdit(row: StagingRow) {
    setEditingRowId(row.id)
    setEditDraft({
      txnDate: row.txnDate,
      merchantRaw: row.merchantRaw,
      description: row.description,
      amount: row.amount,
      txnType: row.txnType,
      currency: row.currency,
      reference: row.reference,
    })
  }

  function cancelEdit() {
    setEditingRowId(null)
    setEditDraft({})
  }

  async function saveEdit(rowId: string) {
    setActionLoading(true)
    try {
      const fields: Record<string, unknown> = {}
      const row = rows.find(r => r.id === rowId)
      if (!row) return

      if (editDraft.txnDate !== undefined && editDraft.txnDate !== row.txnDate) fields.txn_date = editDraft.txnDate
      if (editDraft.merchantRaw !== undefined && editDraft.merchantRaw !== row.merchantRaw) fields.merchant_raw = editDraft.merchantRaw
      if (editDraft.description !== undefined && editDraft.description !== row.description) fields.description = editDraft.description || null
      if (editDraft.amount !== undefined && editDraft.amount !== row.amount) fields.amount = editDraft.amount
      if (editDraft.txnType !== undefined && editDraft.txnType !== row.txnType) fields.txn_type = editDraft.txnType
      if (editDraft.currency !== undefined && editDraft.currency !== row.currency) fields.currency = editDraft.currency
      if (editDraft.reference !== undefined && editDraft.reference !== row.reference) fields.reference = editDraft.reference || null

      if (Object.keys(fields).length === 0) {
        cancelEdit()
        return
      }

      const res = await fetch(`/api/ai/statement/${importId}/rows`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: [{ id: rowId, fields }] }),
      })

      if (!res.ok) {
        toast.error('Failed to save edit')
        return
      }

      toast.success('Row updated')
      cancelEdit()
      await fetchReviewData()
    } catch {
      toast.error('Failed to save edit')
    } finally {
      setActionLoading(false)
    }
  }

  // ── Commit ──

  async function handleCommit() {
    if (!stats || stats.approved === 0) {
      toast.error('No approved rows to commit')
      return
    }

    const confirmed = window.confirm(
      `Are you sure you want to commit ${stats.approved} approved transaction(s) to the database?\n\nThis action cannot be undone.`
    )
    if (!confirmed) return

    setCommitLoading(true)
    try {
      const res = await fetch('/api/ai/statement/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importId }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Commit failed')
        return
      }

      toast.success(
        `Committed ${data.committedCount} transaction(s). ` +
        (data.skippedDuplicateCount > 0 ? `${data.skippedDuplicateCount} skipped (duplicate). ` : '') +
        (data.rejectedCount > 0 ? `${data.rejectedCount} rejected.` : '')
      )

      await fetchReviewData()
    } catch {
      toast.error('Commit failed')
    } finally {
      setCommitLoading(false)
    }
  }

  // ── Loading state ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!importMeta) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Import not found.</p>
        <Button variant="ghost" className="mt-4" onClick={() => router.push('/statements')}>
          <ArrowLeft className="size-4 mr-2" />
          Back to Statements
        </Button>
      </div>
    )
  }

  const isReadOnly = importMeta.status === 'committed' || importMeta.status === 'committing'
  const currency = importMeta.currency || 'SGD'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/statements')}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Review Import</h1>
            <p className="text-muted-foreground text-sm">
              {importMeta.fileName}
              {importMeta.institutionCode && ` · ${importMeta.institutionCode}`}
              {importMeta.statementDate && ` · ${formatDate(importMeta.statementDate)}`}
            </p>
          </div>
        </div>
        {!isReadOnly && (
          <Button
            onClick={handleCommit}
            disabled={commitLoading || !stats || stats.approved === 0}
            className="gap-2"
          >
            {commitLoading ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Commit {stats?.approved ?? 0} Approved
          </Button>
        )}
      </div>

      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Pending" value={stats.pending} className="text-yellow-600" />
          <StatCard label="Approved" value={stats.approved} className="text-green-600" />
          <StatCard label="Rejected" value={stats.rejected} className="text-red-600" />
          <StatCard label="Committed" value={stats.committed} className="text-emerald-600" />
          <StatCard label="Duplicates" value={stats.duplicates} className="text-orange-600" />
          <StatCard label="Debits" value={formatCurrency(stats.debitTotal, currency)} isText />
          <StatCard label="Credits" value={formatCurrency(stats.creditTotal, currency)} isText className="text-green-600" />
        </div>
      )}

      {/* Toolbar */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Select value={filter} onValueChange={v => { setFilter(v as FilterStatus); setSelectedIds(new Set()) }}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Rows</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="committed">Committed</SelectItem>
                  <SelectItem value="duplicate">Duplicates</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                {filteredRows.length} row{filteredRows.length !== 1 ? 's' : ''}
                {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
              </span>
            </div>

            {!isReadOnly && selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-xs h-8"
                  onClick={() => handleBulkAction('approved')}
                  disabled={actionLoading}
                >
                  <CheckCircle2 className="size-3" />
                  Approve Selected
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-xs h-8 text-red-600 hover:text-red-700"
                  onClick={() => handleBulkAction('rejected')}
                  disabled={actionLoading}
                >
                  <XCircle className="size-3" />
                  Reject Selected
                </Button>
              </div>
            )}

            {!isReadOnly && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1 text-xs h-8">
                    Bulk Actions
                    <ChevronDown className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => {
                    const pendingIds = rows.filter(r => r.reviewStatus === 'pending').map(r => r.id)
                    setSelectedIds(new Set(pendingIds))
                  }}>
                    Select All Pending
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    const nonDupIds = rows.filter(r => r.duplicateStatus === 'none' && r.reviewStatus === 'pending').map(r => r.id)
                    setSelectedIds(new Set(nonDupIds))
                  }}>
                    Select Non-Duplicate Pending
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedIds(new Set())}>
                    Clear Selection
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transaction Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Parsed Transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="sticky top-0 bg-background z-10">
                {!isReadOnly && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                      {...(someFilteredSelected && !allFilteredSelected ? { 'data-state': 'indeterminate' } : {})}
                    />
                  </TableHead>
                )}
                <TableHead className="w-8">#</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Merchant / Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Flags</TableHead>
                {!isReadOnly && <TableHead className="w-24">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map(row => {
                const isEditing = editingRowId === row.id
                const statusCfg = reviewStatusConfig[row.reviewStatus] ?? reviewStatusConfig.pending
                const dupCfg = duplicateStatusConfig[row.duplicateStatus]

                return (
                  <TableRow
                    key={row.id}
                    className={cn(
                      row.reviewStatus === 'rejected' && 'opacity-50',
                      row.reviewStatus === 'approved' && 'bg-green-50/50 dark:bg-green-950/10',
                      row.duplicateStatus !== 'none' && row.reviewStatus === 'pending' && 'bg-orange-50/50 dark:bg-orange-950/10',
                    )}
                    data-state={selectedIds.has(row.id) ? 'selected' : undefined}
                  >
                    {!isReadOnly && (
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(row.id)}
                          onCheckedChange={() => toggleSelect(row.id)}
                          aria-label={`Select row ${row.rowIndex + 1}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="text-muted-foreground text-xs">{row.rowIndex + 1}</TableCell>

                    {/* Date */}
                    <TableCell className="whitespace-nowrap">
                      {isEditing ? (
                        <Input
                          type="date"
                          value={editDraft.txnDate ?? ''}
                          onChange={e => setEditDraft(d => ({ ...d, txnDate: e.target.value }))}
                          className="h-7 w-32 text-xs"
                        />
                      ) : (
                        <span className="text-sm">{row.txnDate}</span>
                      )}
                    </TableCell>

                    {/* Merchant */}
                    <TableCell className="max-w-[300px]">
                      {isEditing ? (
                        <div className="space-y-1">
                          <Input
                            value={editDraft.merchantRaw ?? ''}
                            onChange={e => setEditDraft(d => ({ ...d, merchantRaw: e.target.value }))}
                            className="h-7 text-xs"
                            placeholder="Merchant"
                          />
                          <Input
                            value={editDraft.description ?? ''}
                            onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))}
                            className="h-7 text-xs"
                            placeholder="Description (optional)"
                          />
                        </div>
                      ) : (
                        <div>
                          <span className="text-sm font-medium truncate block">{row.merchantRaw}</span>
                          {row.description && row.description !== row.merchantRaw && (
                            <span className="text-xs text-muted-foreground truncate block">{row.description}</span>
                          )}
                        </div>
                      )}
                    </TableCell>

                    {/* Type */}
                    <TableCell>
                      {isEditing ? (
                        <Select value={editDraft.txnType} onValueChange={v => setEditDraft(d => ({ ...d, txnType: v }))}>
                          <SelectTrigger className="h-7 w-20 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="debit">Debit</SelectItem>
                            <SelectItem value="credit">Credit</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={row.txnType === 'credit' ? 'default' : 'secondary'} className="text-xs">
                          {row.txnType}
                        </Badge>
                      )}
                    </TableCell>

                    {/* Amount */}
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={editDraft.amount ?? ''}
                          onChange={e => setEditDraft(d => ({ ...d, amount: parseFloat(e.target.value) || 0 }))}
                          className="h-7 w-28 text-xs text-right"
                        />
                      ) : (
                        <span className={cn(
                          'font-medium tabular-nums text-sm',
                          row.txnType === 'credit' ? 'text-green-600' : 'text-foreground'
                        )}>
                          {row.txnType === 'credit' ? '+' : '-'}
                          {formatCurrency(Math.abs(row.amount), row.currency)}
                        </span>
                      )}
                    </TableCell>

                    {/* Review Status */}
                    <TableCell>
                      <Badge className={cn('text-xs border-0', statusCfg.className)}>
                        {statusCfg.label}
                      </Badge>
                      {row.isEdited && (
                        <Badge variant="outline" className="text-xs ml-1 gap-0.5">
                          <Pencil className="size-2.5" />
                          edited
                        </Badge>
                      )}
                    </TableCell>

                    {/* Duplicate Flags */}
                    <TableCell>
                      {row.duplicateStatus !== 'none' && (
                        <Badge className={cn('text-xs border-0 gap-1', dupCfg.className)}>
                          <Copy className="size-2.5" />
                          {dupCfg.label}
                        </Badge>
                      )}
                    </TableCell>

                    {/* Row Actions */}
                    {!isReadOnly && (
                      <TableCell>
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="size-7 p-0 text-green-600"
                              onClick={() => saveEdit(row.id)}
                              disabled={actionLoading}
                            >
                              <Check className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="size-7 p-0"
                              onClick={cancelEdit}
                            >
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            {row.reviewStatus !== 'committed' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="size-7 p-0"
                                  onClick={() => startEdit(row)}
                                  title="Edit"
                                >
                                  <Pencil className="size-3" />
                                </Button>
                                {row.reviewStatus !== 'approved' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="size-7 p-0 text-green-600"
                                    onClick={() => handleRowAction(row.id, 'approved')}
                                    disabled={actionLoading}
                                    title="Approve"
                                  >
                                    <CheckCircle2 className="size-3.5" />
                                  </Button>
                                )}
                                {row.reviewStatus !== 'rejected' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="size-7 p-0 text-red-600"
                                    onClick={() => handleRowAction(row.id, 'rejected')}
                                    disabled={actionLoading}
                                    title="Reject"
                                  >
                                    <XCircle className="size-3.5" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
              {filteredRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isReadOnly ? 8 : 9} className="py-8 text-center text-muted-foreground">
                    No rows match the current filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Statement Summary */}
      {importMeta.summary && Object.keys(importMeta.summary).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Statement Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 text-sm">
              {Object.entries(importMeta.summary).map(([key, value]) => (
                value != null && (
                  <div key={key}>
                    <dt className="text-muted-foreground text-xs capitalize">{key.replace(/_/g, ' ')}</dt>
                    <dd className="font-medium">{typeof value === 'number' ? formatCurrency(value, currency) : String(value)}</dd>
                  </div>
                )
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Stat Card ──

function StatCard({ label, value, className, isText }: { label: string; value: number | string; className?: string; isText?: boolean }) {
  return (
    <Card>
      <CardContent className="py-3 px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-lg font-bold tabular-nums', className)}>
          {isText ? value : value}
        </p>
      </CardContent>
    </Card>
  )
}
