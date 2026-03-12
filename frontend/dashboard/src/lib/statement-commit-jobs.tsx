'use client'

import Link from 'next/link'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type StatementCommitJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

interface StatementCommitJobResult {
  statementImportIds: string[]
  committedCount: number
  skippedDuplicateCount: number
  rejectedCount: number
  status: 'committed'
  replacementCommit: boolean
  warnings: string[]
}

export interface StatementCommitJob {
  id: string
  importId: string
  fileName: string
  status: StatementCommitJobStatus
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  result: StatementCommitJobResult | null
  error: string | null
}

interface StatementCommitJobsContextValue {
  jobs: StatementCommitJob[]
  activeJobs: StatementCommitJob[]
  hasActiveJobs: boolean
  trackJob: (job: StatementCommitJob) => void
  dismissJob: (jobId: string) => void
  getJobForImport: (importId: string) => StatementCommitJob | undefined
}

const STORAGE_KEY = 'wealthhouse.statement-commit-jobs'
const POLL_INTERVAL_MS = 2500
const RECENT_COMPLETION_MS = 1000 * 60 * 10

const StatementCommitJobsContext = createContext<StatementCommitJobsContextValue | null>(null)

function mergeJobs(current: StatementCommitJob[], next: StatementCommitJob[]) {
  const map = new Map(current.map((job) => [job.id, job]))
  for (const job of next) {
    map.set(job.id, { ...map.get(job.id), ...job })
  }

  return Array.from(map.values()).sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

function pruneJobs(jobs: StatementCommitJob[]) {
  const cutoff = Date.now() - RECENT_COMPLETION_MS
  return jobs.filter((job) => {
    if (job.status === 'queued' || job.status === 'running') return true
    if (!job.finishedAt) return true
    return new Date(job.finishedAt).getTime() >= cutoff
  })
}

function JobStatusBadge({ status }: { status: StatementCommitJobStatus }) {
  const config: Record<StatementCommitJobStatus, { label: string; className: string }> = {
    queued: { label: 'Queued', className: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300' },
    running: { label: 'Running', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
    succeeded: { label: 'Done', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
    failed: { label: 'Failed', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  }

  return <Badge className={cn('border-0 text-[11px]', config[status].className)}>{config[status].label}</Badge>
}

function StatementCommitJobTray({ jobs, dismissJob }: { jobs: StatementCommitJob[]; dismissJob: (jobId: string) => void }) {
  if (jobs.length === 0) return null

  const visibleJobs = jobs.slice(0, 4)

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] space-y-3">
      <Card className="pointer-events-auto border-slate-200/80 bg-background/95 shadow-xl backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Statement Commit Jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {visibleJobs.map((job) => {
            const Icon = job.status === 'failed' ? AlertCircle : job.status === 'succeeded' ? CheckCircle2 : Loader2
            return (
              <div key={job.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Icon className={cn('size-4 shrink-0', (job.status === 'queued' || job.status === 'running') && 'animate-spin', job.status === 'failed' ? 'text-red-500' : job.status === 'succeeded' ? 'text-emerald-500' : 'text-indigo-500')} />
                      <p className="truncate text-sm font-medium">{job.fileName}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {job.status === 'succeeded' && job.result
                        ? `Committed ${job.result.committedCount} transaction(s)`
                        : job.status === 'failed'
                          ? (job.error ?? 'Commit failed')
                          : 'Processing in background. You can leave this page.'}
                    </p>
                    {job.status === 'succeeded' && (job.result?.warnings?.length ?? 0) > 0 && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        {(job.result?.warnings ?? []).map((warning) => (
                          <p key={warning}>{warning}</p>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <JobStatusBadge status={job.status} />
                      <Link className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" href={`/statements/review/${job.importId}`}>
                        Open import
                        <ExternalLink className="size-3" />
                      </Link>
                    </div>
                  </div>
                  {(job.status === 'succeeded' || job.status === 'failed') && (
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

export function StatementCommitJobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<StatementCommitJob[]>(() => {
    if (typeof window === 'undefined') return []

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as StatementCommitJob[]
      return Array.isArray(parsed) ? pruneJobs(parsed) : []
    } catch {
      window.localStorage.removeItem(STORAGE_KEY)
      return []
    }
  })
  const previousStatusesRef = useRef<Record<string, StatementCommitJobStatus>>({})

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pruneJobs(jobs)))
  }, [jobs])

  useEffect(() => {
    if (jobs.length === 0) return

    let cancelled = false

    async function poll() {
      try {
        const ids = jobs.map((job) => job.id).join(',')
        const res = await fetch(`/api/ai/statement/commit/jobs?ids=${encodeURIComponent(ids)}`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled || !Array.isArray(data.jobs)) return
        setJobs((current) => pruneJobs(mergeJobs(current, data.jobs as StatementCommitJob[])))
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
        toast.success(
          `${job.fileName}: committed ${job.result?.committedCount ?? 0} transaction(s).`,
          { id: `statement-job-${job.id}` },
        )
      }

      if (job.status === 'failed' && previousStatus !== 'failed') {
        toast.error(`${job.fileName}: ${job.error ?? 'Commit failed'}`, { id: `statement-job-${job.id}` })
      }

      previousStatusesRef.current[job.id] = job.status
    }
  }, [jobs])

  const trackJob = useCallback((job: StatementCommitJob) => {
    setJobs((current) => pruneJobs(mergeJobs(current, [job])))
    toast.message(`${job.fileName}: commit started in the background.`, { id: `statement-job-${job.id}` })
  }, [])

  const dismissJob = useCallback((jobId: string) => {
    setJobs((current) => current.filter((job) => job.id !== jobId))
    delete previousStatusesRef.current[jobId]
  }, [])

  const activeJobs = useMemo(
    () => jobs.filter((job) => job.status === 'queued' || job.status === 'running'),
    [jobs],
  )

  const getJobForImport = useCallback(
    (importId: string) => jobs.find((job) => job.importId === importId && (job.status === 'queued' || job.status === 'running')),
    [jobs],
  )

  const value = useMemo<StatementCommitJobsContextValue>(() => ({
    jobs,
    activeJobs,
    hasActiveJobs: activeJobs.length > 0,
    trackJob,
    dismissJob,
    getJobForImport,
  }), [jobs, activeJobs, trackJob, dismissJob, getJobForImport])

  return (
    <StatementCommitJobsContext.Provider value={value}>
      {children}
      <StatementCommitJobTray jobs={jobs} dismissJob={dismissJob} />
    </StatementCommitJobsContext.Provider>
  )
}

export function useStatementCommitJobs() {
  const context = useContext(StatementCommitJobsContext)
  if (!context) {
    throw new Error('useStatementCommitJobs must be used within StatementCommitJobsProvider')
  }

  return context
}
