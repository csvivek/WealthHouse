import { processStatementUpload } from '@/lib/server/statement-ingestion'
import type { StatementUploadProcessResult } from '@/lib/server/statement-uploads'

export type StatementIngestionJobStatus = 'queued' | 'running' | 'needs_action' | 'succeeded' | 'failed'

export interface StatementIngestionJobRecord {
  id: string
  statementUploadId: string
  fileName: string
  userId: string
  householdId: string
  status: StatementIngestionJobStatus
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  result: StatementUploadProcessResult | null
  error: string | null
}

interface StatementIngestionJobStore {
  jobs: Map<string, StatementIngestionJobRecord>
  activeByUploadId: Map<string, string>
}

const JOB_RETENTION_MS = 1000 * 60 * 30

function getStore(): StatementIngestionJobStore {
  const globalState = globalThis as typeof globalThis & {
    __wealthhouseStatementIngestionJobs?: StatementIngestionJobStore
  }

  if (!globalState.__wealthhouseStatementIngestionJobs) {
    globalState.__wealthhouseStatementIngestionJobs = {
      jobs: new Map<string, StatementIngestionJobRecord>(),
      activeByUploadId: new Map<string, string>(),
    }
  }

  return globalState.__wealthhouseStatementIngestionJobs
}

function pruneOldJobs(store: StatementIngestionJobStore) {
  const cutoff = Date.now() - JOB_RETENTION_MS
  for (const [jobId, job] of store.jobs.entries()) {
    if ((job.status === 'succeeded' || job.status === 'failed' || job.status === 'needs_action') && job.finishedAt) {
      if (new Date(job.finishedAt).getTime() < cutoff) {
        store.jobs.delete(jobId)
      }
    }
  }
}

function cloneResult(result: StatementUploadProcessResult | null) {
  if (!result) return null

  if (result.status === 'needs_account_resolution') {
    return { ...result, imports: [] }
  }

  return {
    ...result,
    imports: result.imports.map((item) => ({ ...item })),
  }
}

function cloneJob(job: StatementIngestionJobRecord) {
  return {
    ...job,
    result: cloneResult(job.result),
  }
}

async function runStatementIngestionJob(jobId: string) {
  const store = getStore()
  const job = store.jobs.get(jobId)
  if (!job) return

  job.status = 'running'
  job.startedAt = new Date().toISOString()

  try {
    const result = await processStatementUpload({
      statementUploadId: job.statementUploadId,
    })

    job.result = result
    job.finishedAt = new Date().toISOString()
    job.error = null
    job.status = result.status === 'needs_account_resolution' ? 'needs_action' : 'succeeded'
  } catch (error) {
    job.status = 'failed'
    job.finishedAt = new Date().toISOString()
    job.error = error instanceof Error ? error.message : 'Failed to process statement upload'
  } finally {
    const activeJobId = store.activeByUploadId.get(job.statementUploadId)
    if (activeJobId === job.id) {
      store.activeByUploadId.delete(job.statementUploadId)
    }
  }
}

export function startStatementIngestionJob(params: {
  statementUploadId: string
  fileName: string
  userId: string
  householdId: string
}) {
  const store = getStore()
  pruneOldJobs(store)

  const existingJobId = store.activeByUploadId.get(params.statementUploadId)
  if (existingJobId) {
    const existingJob = store.jobs.get(existingJobId)
    if (existingJob && (existingJob.status === 'queued' || existingJob.status === 'running')) {
      return cloneJob(existingJob)
    }
  }

  const job: StatementIngestionJobRecord = {
    id: crypto.randomUUID(),
    statementUploadId: params.statementUploadId,
    fileName: params.fileName,
    userId: params.userId,
    householdId: params.householdId,
    status: 'queued',
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    result: null,
    error: null,
  }

  store.jobs.set(job.id, job)
  store.activeByUploadId.set(job.statementUploadId, job.id)

  setTimeout(() => {
    void runStatementIngestionJob(job.id)
  }, 0)

  return cloneJob(job)
}

export function listStatementIngestionJobsForUser(userId: string, jobIds?: string[]) {
  const store = getStore()
  pruneOldJobs(store)

  const wantedIds = jobIds ? new Set(jobIds) : null

  return Array.from(store.jobs.values())
    .filter((job) => job.userId === userId)
    .filter((job) => !wantedIds || wantedIds.has(job.id))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(cloneJob)
}
