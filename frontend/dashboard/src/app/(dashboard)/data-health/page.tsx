'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Clock,
  FileSearch,
  Loader2,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { getRelativeTime } from '@/lib/format'
import { toast } from 'sonner'

interface ReconciliationCheck {
  name: string
  status: 'pass' | 'warning' | 'fail'
  summary: string
}

interface ReconciliationResult {
  checks: ReconciliationCheck[]
  ran_at: string
}

interface QuarantineItem {
  id: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  reason: string
  table_name: string
  source: string
  created_at: string
}

interface AuditEntry {
  id: string
  action: 'insert' | 'update' | 'delete'
  source: string
  table_name: string
  created_at: string
}

const STATUS_CONFIG = {
  pass: {
    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    label: 'Pass',
  },
  warning: {
    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
    label: 'Warning',
  },
  fail: {
    color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
    label: 'Fail',
  },
} as const

const SEVERITY_CONFIG = {
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
} as const

const ACTION_CONFIG = {
  insert: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  update: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  delete: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
} as const

function getOverallHealth(checks: ReconciliationCheck[]) {
  if (checks.some((c) => c.status === 'fail')) return 'fail'
  if (checks.some((c) => c.status === 'warning')) return 'warning'
  return 'pass'
}

function findCheck(checks: ReconciliationCheck[], keyword: string) {
  return checks.find((c) => c.name.toLowerCase().includes(keyword))
}

export default function DataHealthPage() {
  const [reconciliation, setReconciliation] = useState<ReconciliationResult | null>(null)
  const [quarantineItems, setQuarantineItems] = useState<QuarantineItem[]>([])
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [loadingReconciliation, setLoadingReconciliation] = useState(true)
  const [loadingQuarantine, setLoadingQuarantine] = useState(true)
  const [loadingAudit, setLoadingAudit] = useState(true)
  const [runningReconciliation, setRunningReconciliation] = useState(false)
  const [processingItems, setProcessingItems] = useState<Set<string>>(new Set())
  const [rejectDialogItem, setRejectDialogItem] = useState<QuarantineItem | null>(null)

  const fetchReconciliation = useCallback(async () => {
    setLoadingReconciliation(true)
    try {
      const res = await fetch('/api/integrity/reconcile')
      if (res.ok) {
        const data = await res.json()
        setReconciliation(data)
      }
    } catch {
      // silently handle
    } finally {
      setLoadingReconciliation(false)
    }
  }, [])

  const fetchQuarantine = useCallback(async () => {
    setLoadingQuarantine(true)
    try {
      const res = await fetch('/api/integrity/quarantine?status=pending')
      if (res.ok) {
        const data = await res.json()
        setQuarantineItems(data)
      }
    } catch {
      // silently handle
    } finally {
      setLoadingQuarantine(false)
    }
  }, [])

  const fetchAuditLog = useCallback(async () => {
    setLoadingAudit(true)
    try {
      const res = await fetch('/api/integrity/audit-log?limit=20')
      if (res.ok) {
        const data = await res.json()
        setAuditLog(data)
      }
    } catch {
      // silently handle
    } finally {
      setLoadingAudit(false)
    }
  }, [])

  useEffect(() => {
    fetchReconciliation()
    fetchQuarantine()
    fetchAuditLog()
  }, [fetchReconciliation, fetchQuarantine, fetchAuditLog])

  async function handleRunReconciliation() {
    setRunningReconciliation(true)
    try {
      const res = await fetch('/api/integrity/reconcile', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setReconciliation(data)
        const overall = getOverallHealth(data.checks ?? [])
        toast.success(
          overall === 'pass'
            ? 'All checks passed — data is healthy.'
            : overall === 'warning'
              ? 'Reconciliation complete — some warnings found.'
              : 'Reconciliation complete — issues detected.'
        )
      } else {
        toast.error('Failed to run reconciliation.')
      }
    } catch {
      toast.error('Failed to run reconciliation.')
    } finally {
      setRunningReconciliation(false)
      fetchQuarantine()
      fetchAuditLog()
    }
  }

  async function handleQuarantineAction(id: string, action: 'approve' | 'reject') {
    setProcessingItems((prev) => new Set(prev).add(id))
    try {
      const res = await fetch('/api/integrity/quarantine', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      if (res.ok) {
        setQuarantineItems((prev) => prev.filter((item) => item.id !== id))
        toast.success(action === 'approve' ? 'Item approved.' : 'Item rejected.')
      } else {
        toast.error(`Failed to ${action} item.`)
      }
    } catch {
      toast.error(`Failed to ${action} item.`)
    } finally {
      setProcessingItems((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setRejectDialogItem(null)
    }
  }

  const checks = reconciliation?.checks ?? []
  const overallHealth = getOverallHealth(checks)
  const balanceCheck = findCheck(checks, 'balance')
  const duplicateCheck = findCheck(checks, 'duplicate')
  const anomalyCheck = findCheck(checks, 'anomal')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Data Health</h1>
          <p className="text-muted-foreground">
            Monitor data integrity, review AI-generated entries, and run reconciliation checks.
          </p>
        </div>
        <Button
          onClick={handleRunReconciliation}
          disabled={runningReconciliation}
        >
          {runningReconciliation ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Run Reconciliation
        </Button>
      </div>

      {/* Section 1: Health Score Cards */}
      {loadingReconciliation ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          {/* Overall Health */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Overall Health</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                {overallHealth === 'pass' ? (
                  <ShieldCheck className="h-10 w-10 text-emerald-500" />
                ) : overallHealth === 'warning' ? (
                  <ShieldAlert className="h-10 w-10 text-yellow-500" />
                ) : (
                  <ShieldAlert className="h-10 w-10 text-red-500" />
                )}
                <div>
                  <p
                    className={cn(
                      'text-lg font-semibold',
                      overallHealth === 'pass' && 'text-emerald-600 dark:text-emerald-400',
                      overallHealth === 'warning' && 'text-yellow-600 dark:text-yellow-400',
                      overallHealth === 'fail' && 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {overallHealth === 'pass'
                      ? 'Healthy'
                      : overallHealth === 'warning'
                        ? 'Needs Attention'
                        : 'Issues Found'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {checks.length} checks run
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Balance Check */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Balance Check</CardDescription>
            </CardHeader>
            <CardContent>
              {balanceCheck ? (
                <div className="space-y-2">
                  <Badge className={cn('text-xs', STATUS_CONFIG[balanceCheck.status].color)}>
                    {STATUS_CONFIG[balanceCheck.status].label}
                  </Badge>
                  <p className="text-sm text-muted-foreground">{balanceCheck.summary}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No balance check data</p>
              )}
            </CardContent>
          </Card>

          {/* Duplicate Check */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Duplicate Check</CardDescription>
            </CardHeader>
            <CardContent>
              {duplicateCheck ? (
                <div className="space-y-2">
                  <Badge className={cn('text-xs', STATUS_CONFIG[duplicateCheck.status].color)}>
                    {STATUS_CONFIG[duplicateCheck.status].label}
                  </Badge>
                  <p className="text-sm text-muted-foreground">{duplicateCheck.summary}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No duplicate check data</p>
              )}
            </CardContent>
          </Card>

          {/* Anomaly Scan */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Anomaly Scan</CardDescription>
            </CardHeader>
            <CardContent>
              {anomalyCheck ? (
                <div className="space-y-2">
                  <Badge className={cn('text-xs', STATUS_CONFIG[anomalyCheck.status].color)}>
                    {STATUS_CONFIG[anomalyCheck.status].label}
                  </Badge>
                  <p className="text-sm text-muted-foreground">{anomalyCheck.summary}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No anomaly scan data</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Separator />

      {/* Section 2: Quarantine Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Quarantine Queue
          </CardTitle>
          <CardDescription>
            Review AI-generated entries flagged for manual approval.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingQuarantine ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : quarantineItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <ShieldCheck className="h-10 w-10 text-emerald-500" />
              <div>
                <p className="font-medium">No items in quarantine</p>
                <p className="text-sm text-muted-foreground">
                  All AI-generated data has been reviewed.
                </p>
              </div>
            </div>
          ) : (
            <ScrollArea className="max-h-[480px] overflow-auto">
              <div className="space-y-3">
                {quarantineItems.map((item) => {
                  const isProcessing = processingItems.has(item.id)
                  return (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-4 rounded-lg border p-4"
                    >
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={cn('text-xs capitalize', SEVERITY_CONFIG[item.severity])}>
                            {item.severity}
                          </Badge>
                          <span className="text-sm font-medium">{item.reason}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <FileSearch className="h-3 w-3" />
                            {item.table_name}
                          </span>
                          <span>·</span>
                          <span>{item.source}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {getRelativeTime(item.created_at)}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
                          disabled={isProcessing}
                          onClick={() => handleQuarantineAction(item.id, 'approve')}
                        >
                          {isProcessing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
                          disabled={isProcessing}
                          onClick={() => setRejectDialogItem(item)}
                        >
                          <XCircle className="h-3 w-3" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Reject Confirmation Dialog */}
      <Dialog
        open={rejectDialogItem !== null}
        onOpenChange={(open) => {
          if (!open) setRejectDialogItem(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Rejection</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject this quarantined item? This action will discard
              the AI-generated entry.
            </DialogDescription>
          </DialogHeader>
          {rejectDialogItem && (
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{rejectDialogItem.reason}</p>
              <p className="text-muted-foreground">
                {rejectDialogItem.table_name} · {rejectDialogItem.source}
              </p>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={processingItems.has(rejectDialogItem?.id ?? '')}
              onClick={() => {
                if (rejectDialogItem) {
                  handleQuarantineAction(rejectDialogItem.id, 'reject')
                }
              }}
            >
              {processingItems.has(rejectDialogItem?.id ?? '') ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Separator />

      {/* Section 3: Recent Audit Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5" />
            Recent Audit Log
          </CardTitle>
          <CardDescription>
            Track all data changes across your accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingAudit ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : auditLog.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No audit entries yet.
            </p>
          ) : (
            <ScrollArea className="max-h-[480px] overflow-auto">
              <div className="space-y-1">
                {auditLog.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge className={cn('text-xs capitalize', ACTION_CONFIG[entry.action])}>
                          {entry.action}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {entry.source}
                        </Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        <span className="capitalize">{entry.action}</span> in{' '}
                        <span className="font-medium text-foreground">{entry.table_name}</span>{' '}
                        from <span className="font-medium text-foreground">{entry.source}</span>
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {getRelativeTime(entry.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
