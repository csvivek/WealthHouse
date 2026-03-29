'use client'

import Link from 'next/link'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, PauseCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { StatementUploadProcessResult } from '@/lib/server/statement-uploads'

export type StatementIngestionJobStatus = 'queued' | 'running' | 'needs_action' | 'succeeded' | 'failed'

export interface StatementIngestionJob {
  id: string
  statementUploadId: string
  fileName: string
  status: StatementIngestionJobStatus
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  result: StatementUploadProcessResult | null
  error: string | null
}

interface StatementIngestionJobsContextValue {
  jobs: StatementIngestionJob[]
  activeJobs: StatementIngestionJob[]
  hasActiveJobs: boolean
  trackJob: (job: StatementIngestionJob) => void
  dismissJob: (jobId: string) => void
  getJobForUpload: (statementUploadId: string) => StatementIngestionJob | undefined
}

const STORAGE_KEY = 'wealthhouse.statement-ingestion-jobs'
const POLL_INTERVAL_MS = 2500
const RECENT_COMPLETION_MS = 1000 * 60 * 10

const StatementIngestionJobsContext = createContext<StatementIngestionJobsContextValue | null>(null)

function mergeJobs(current: StatementIngestionJob[], next: StatementIngestionJob[]) {
  const map = new Map(current.map((job) => [job.id, job]))
  for (const job of next) {
    map.set(job.id, { ...map.get(job.id), ...job })
  }

  return Array.from(map.values()).sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

function pruneJobs(jobs: StatementIngestionJob[]) {
  const cutoff = Date.now() - RECENT_COMPLETION_MS
  return jobs.filter((job) => {
    if (job.status === 'queued' || job.status === 'running') return true
    if (!job.finishedAt) return true
    return new Date(job.finishedAt).getTime() >= cutoff
  })
}

function JobStatusBadge({ status }: { status: StatementIngestionJobStatus }) {
  const config: Record<StatementIngestionJobStatus, { label: string; className: string }> = {
    queued: { label: 'Queued', className: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300' },
    running: { label: 'Running', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
    needs_action: { label: 'Needs Action', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
    succeeded: { label: 'Done', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
    failed: { label: 'Failed', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  }

  return <Badge className={cn('border-0 text-[11px]', config[status].className)}>{config[status].label}</Badge>
}

function StatementIngestionJobTray({ jobs, dismissJob }: { jobs: StatementIngestionJob[]; dismissJob: (jobId: string) => void }) {
  if (jobs.length === 0) return null

  const visibleJobs = jobs.slice(0, 4)

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] space-y-3">
      <Card className="pointer-events-auto border-slate-200/80 bg-background/95 shadow-xl backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Statement Import Jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {visibleJobs.map((job) => {
            const Icon = job.status === 'failed'
              ? AlertCircle
              : job.status === 'succeeded'
                ? CheckCircle2
                : job.status === 'needs_action'
                  ? PauseCircle
                  : Loader2
            const openHref = job.result?.status === 'completed' && job.result.reviewUrl
              ? job.result.reviewUrl
              : '/statements'

            return (
              <div key={job.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Icon className={cn(
                        'size-4 shrink-0',
                        (job.status === 'queued' || job.status === 'running') && 'animate-spin',
                        job.status === 'failed'
                          ? 'text-red-500'
                          : job.status === 'succeeded'
                            ? 'text-emerald-500'
                            : job.status === 'needs_action'
                              ? 'text-amber-500'
                              : 'text-indigo-500',
                      )} />
                      <p className="truncate text-sm font-medium">{job.fileName}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {job.status === 'succeeded' && job.result?.status === 'completed'
                        ? job.result.importCount === 1
                          ? `Import ready with ${job.result.transactionsCount} transaction(s).`
                          : `${job.result.importCount} account imports are ready for review.`
                        : job.status === 'needs_action'
                          ? 'This file needs account resolution before it can continue.'
                          : job.status === 'failed'
                            ? (job.error ?? 'Import failed')
                            : 'Processing in background. You can leave this page.'}
                    </p>
                    <div className="flex items-center gap-2">
                      <JobStatusBadge status={job.status} />
                      <Link className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" href={openHref}>
                        {job.status === 'needs_action' ? 'Resolve account' : 'Open statements'}
                        <ExternalLink className="size-3" />
                      </Link>
                    </div>
                  </div>
                  {(job.status === 'succeeded' || job.status === 'failed' || job.status === 'needs_action') && (
                    <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => dismissJob(job.id)}>
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}

export function StatementIngestionJobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<StatementIngestionJob[]>([])
  const [storageHydrated, setStorageHydrated] = useState(false)
  const previousStatusesRef = useRef<Record<string, StatementIngestionJobStatus>>({})

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw) as StatementIngestionJob[]
      const restoredJobs = Array.isArray(parsed) ? pruneJobs(parsed) : []
      previousStatusesRef.current = Object.fromEntries(
        restoredJobs.map((job) => [job.id, job.status]),
      )
      setJobs(restoredJobs)
    } catch {
      window.localStorage.removeItem(STORAGE_KEY)
    } finally {
      setStorageHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!storageHydrated) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pruneJobs(jobs)))
  }, [jobs, storageHydrated])

  useEffect(() => {
    if (jobs.length === 0) return

    let cancelled = false

    async function poll() {
      try {
        const ids = jobs.map((job) => `jobId=${encodeURIComponent(job.id)}`).join('&')
        const res = await fetch(`/api/ai/statement/jobs?${ids}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled || !Array.isArray(data.jobs)) return
        setJobs((current) => pruneJobs(mergeJobs(current, data.jobs as StatementIngestionJob[])))
      } catch {
        // Ignore transient polling errors.
      }
    }

    void poll()
    const interval = window.setInterval(() => {
      void poll()
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [jobs])

  useEffect(() => {
    for (const job of jobs) {
      const previousStatus = previousStatusesRef.current[job.id]

      if (job.status === 'succeeded' && previousStatus !== 'succeeded') {
        const message = job.result?.status === 'completed' && job.result.importCount > 1
          ? `${job.fileName}: ${job.result.importCount} account imports are ready.`
          : `${job.fileName}: import ready.`
        toast.success(message, { id: `statement-ingestion-job-${job.id}` })
      }

      if (job.status === 'needs_action' && previousStatus !== 'needs_action') {
        toast.error(`${job.fileName}: account resolution is required before import can continue.`, {
          id: `statement-ingestion-job-${job.id}`,
        })
      }

      if (job.status === 'failed' && previousStatus !== 'failed') {
        toast.error(`${job.fileName}: ${job.error ?? 'Import failed'}`, {
          id: `statement-ingestion-job-${job.id}`,
        })
      }

      previousStatusesRef.current[job.id] = job.status
    }
  }, [jobs])

  const trackJob = useCallback((job: StatementIngestionJob) => {
    setJobs((current) => pruneJobs(mergeJobs(current, [job])))
    toast.message(`${job.fileName}: import started in the background.`, {
      id: `statement-ingestion-job-${job.id}`,
    })
  }, [])

  const dismissJob = useCallback((jobId: string) => {
    setJobs((current) => current.filter((job) => job.id !== jobId))
    delete previousStatusesRef.current[jobId]
  }, [])

  const activeJobs = useMemo(
    () => jobs.filter((job) => job.status === 'queued' || job.status === 'running'),
    [jobs],
  )

  const getJobForUpload = useCallback(
    (statementUploadId: string) => jobs.find((job) => job.statementUploadId === statementUploadId),
    [jobs],
  )

  const value = useMemo<StatementIngestionJobsContextValue>(() => ({
    jobs,
    activeJobs,
    hasActiveJobs: activeJobs.length > 0,
    trackJob,
    dismissJob,
    getJobForUpload,
  }), [jobs, activeJobs, trackJob, dismissJob, getJobForUpload])

  return (
    <StatementIngestionJobsContext.Provider value={value}>
      {children}
      <StatementIngestionJobTray jobs={jobs} dismissJob={dismissJob} />
    </StatementIngestionJobsContext.Provider>
  )
}

export function useStatementIngestionJobs() {
  const context = useContext(StatementIngestionJobsContext)
  if (!context) {
    throw new Error('useStatementIngestionJobs must be used within StatementIngestionJobsProvider')
  }

  return context
}
