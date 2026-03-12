import { processStatementCommit, StatementCommitProcessError, type StatementCommitResult } from '@/lib/server/statement-commit'

export type StatementCommitJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface StatementCommitJobRecord {
  id: string
  importId: string
  fileName: string
  userId: string
  householdId: string
  status: StatementCommitJobStatus
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  result: StatementCommitResult | null
  error: string | null
}

interface StatementCommitJobStore {
  jobs: Map<string, StatementCommitJobRecord>
  activeByImportId: Map<string, string>
}

const JOB_RETENTION_MS = 1000 * 60 * 30

function getStore(): StatementCommitJobStore {
  const globalState = globalThis as typeof globalThis & {
    __wealthhouseStatementCommitJobs?: StatementCommitJobStore
  }

  if (!globalState.__wealthhouseStatementCommitJobs) {
    globalState.__wealthhouseStatementCommitJobs = {
      jobs: new Map<string, StatementCommitJobRecord>(),
      activeByImportId: new Map<string, string>(),
    }
  }

  return globalState.__wealthhouseStatementCommitJobs
}

function pruneOldJobs(store: StatementCommitJobStore) {
  const cutoff = Date.now() - JOB_RETENTION_MS
  for (const [jobId, job] of store.jobs.entries()) {
    if ((job.status === 'succeeded' || job.status === 'failed') && job.finishedAt) {
      if (new Date(job.finishedAt).getTime() < cutoff) {
        store.jobs.delete(jobId)
      }
    }
  }
}

function cloneJob(job: StatementCommitJobRecord) {
  return {
    ...job,
    result: job.result
      ? {
          ...job.result,
          statementImportIds: [...job.result.statementImportIds],
          warnings: [...(job.result.warnings ?? [])],
        }
      : null,
  }
}

async function runStatementCommitJob(jobId: string) {
  const store = getStore()
  const job = store.jobs.get(jobId)
  if (!job) return

  job.status = 'running'
  job.startedAt = new Date().toISOString()

  try {
    const result = await processStatementCommit({
      importId: job.importId,
      householdId: job.householdId,
      userId: job.userId,
    })

    job.status = 'succeeded'
    job.result = result
    job.finishedAt = new Date().toISOString()
    job.error = null
  } catch (error) {
    job.status = 'failed'
    job.finishedAt = new Date().toISOString()
    job.error = error instanceof StatementCommitProcessError || error instanceof Error
      ? error.message
      : 'Failed to commit statement import'
  } finally {
    const activeJobId = store.activeByImportId.get(job.importId)
    if (activeJobId === job.id) {
      store.activeByImportId.delete(job.importId)
    }
  }
}

export function startStatementCommitJob(params: {
  importId: string
  fileName: string
  userId: string
  householdId: string
}) {
  const store = getStore()
  pruneOldJobs(store)

  const existingJobId = store.activeByImportId.get(params.importId)
  if (existingJobId) {
    const existingJob = store.jobs.get(existingJobId)
    if (existingJob && (existingJob.status === 'queued' || existingJob.status === 'running')) {
      return cloneJob(existingJob)
    }
  }

  const job: StatementCommitJobRecord = {
    id: crypto.randomUUID(),
    importId: params.importId,
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
  store.activeByImportId.set(job.importId, job.id)
  setTimeout(() => {
    void runStatementCommitJob(job.id)
  }, 0)

  return cloneJob(job)
}

export function listStatementCommitJobsForUser(userId: string, jobIds?: string[]) {
  const store = getStore()
  pruneOldJobs(store)

  const wantedIds = jobIds ? new Set(jobIds) : null
  return Array.from(store.jobs.values())
    .filter((job) => job.userId === userId)
    .filter((job) => !wantedIds || wantedIds.has(job.id))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(cloneJob)
}
