import { processReceiptIngestion, type ReceiptIngestionResult } from '@/lib/server/receipt-ingestion'

export type ReceiptIngestionJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface ReceiptIngestionJobRecord {
  id: string
  uploadId: string
  userId: string
  householdId: string
  status: ReceiptIngestionJobStatus
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  result: ReceiptIngestionResult | null
  error: string | null
}

interface ReceiptIngestionJobStore {
  jobs: Map<string, ReceiptIngestionJobRecord>
  activeByUploadId: Map<string, string>
}

const JOB_RETENTION_MS = 1000 * 60 * 30

function getStore(): ReceiptIngestionJobStore {
  const globalState = globalThis as typeof globalThis & {
    __wealthhouseReceiptIngestionJobs?: ReceiptIngestionJobStore
  }

  if (!globalState.__wealthhouseReceiptIngestionJobs) {
    globalState.__wealthhouseReceiptIngestionJobs = {
      jobs: new Map<string, ReceiptIngestionJobRecord>(),
      activeByUploadId: new Map<string, string>(),
    }
  }

  return globalState.__wealthhouseReceiptIngestionJobs
}

function pruneOldJobs(store: ReceiptIngestionJobStore) {
  const cutoff = Date.now() - JOB_RETENTION_MS
  for (const [jobId, job] of store.jobs.entries()) {
    if ((job.status === 'succeeded' || job.status === 'failed') && job.finishedAt) {
      if (new Date(job.finishedAt).getTime() < cutoff) {
        store.jobs.delete(jobId)
      }
    }
  }
}

function cloneJob(job: ReceiptIngestionJobRecord) {
  return { ...job, result: job.result ? { ...job.result } : null }
}

async function runReceiptIngestionJob(jobId: string) {
  const store = getStore()
  const job = store.jobs.get(jobId)
  if (!job) return

  job.status = 'running'
  job.startedAt = new Date().toISOString()

  try {
    const result = await processReceiptIngestion({
      uploadId: job.uploadId,
    })

    job.status = 'succeeded'
    job.result = result
    job.finishedAt = new Date().toISOString()
    job.error = null
  } catch (error) {
    job.status = 'failed'
    job.finishedAt = new Date().toISOString()
    job.error = error instanceof Error ? error.message : 'Failed to process receipt ingestion job'
  } finally {
    const activeJobId = store.activeByUploadId.get(job.uploadId)
    if (activeJobId === job.id) {
      store.activeByUploadId.delete(job.uploadId)
    }
  }
}

export function startReceiptIngestionJob(params: {
  uploadId: string
  userId: string
  householdId: string
}) {
  const store = getStore()
  pruneOldJobs(store)

  const existingJobId = store.activeByUploadId.get(params.uploadId)
  if (existingJobId) {
    const existingJob = store.jobs.get(existingJobId)
    if (existingJob && (existingJob.status === 'queued' || existingJob.status === 'running')) {
      return cloneJob(existingJob)
    }
  }

  const job: ReceiptIngestionJobRecord = {
    id: crypto.randomUUID(),
    uploadId: params.uploadId,
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
  store.activeByUploadId.set(job.uploadId, job.id)

  setTimeout(() => {
    void runReceiptIngestionJob(job.id)
  }, 0)

  return cloneJob(job)
}

export function listReceiptIngestionJobsForUser(userId: string, jobIds?: string[]) {
  const store = getStore()
  pruneOldJobs(store)

  const wantedIds = jobIds ? new Set(jobIds) : null

  return Array.from(store.jobs.values())
    .filter((job) => job.userId === userId)
    .filter((job) => !wantedIds || wantedIds.has(job.id))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(cloneJob)
}
