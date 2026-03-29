// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/ai/statement/route'
import {
  assertStatementStorageConfig,
  ensureStatementsBucket,
  getStatementsBucket,
  mapStatementStorageErrorMessage,
} from '@/lib/statements/config'
import { ensureProfile } from '@/lib/supabase/ensure-profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { computeFileHash } from '@/lib/server/statement-import'
import { startStatementIngestionJob } from '@/lib/server/statement-ingestion-jobs'
import {
  listStatementUploadImports,
  listStatementUploadImportsByFileHash,
  listStatementUploadImportsFromResultPayload,
  loadStatementUploadByHash,
  readStatementUploadImportCount,
} from '@/lib/server/statement-uploads'
import { deleteOriginalStatement, uploadOriginalStatement } from '@/lib/server/statement-storage'

vi.mock('@/lib/statements/config', () => ({
  assertStatementStorageConfig: vi.fn(),
  ensureStatementsBucket: vi.fn(),
  getStatementsBucket: vi.fn(),
  mapStatementStorageErrorMessage: vi.fn(),
}))

vi.mock('@/lib/supabase/ensure-profile', () => ({
  ensureProfile: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/server/statement-import', () => ({
  computeFileHash: vi.fn(),
}))

vi.mock('@/lib/server/statement-ingestion-jobs', () => ({
  startStatementIngestionJob: vi.fn(),
}))

vi.mock('@/lib/server/statement-uploads', () => ({
  listStatementUploadImports: vi.fn(),
  listStatementUploadImportsByFileHash: vi.fn(),
  listStatementUploadImportsFromResultPayload: vi.fn(),
  loadStatementUploadByHash: vi.fn(),
  readStatementUploadImportCount: vi.fn(),
}))

vi.mock('@/lib/server/statement-storage', () => ({
  deleteOriginalStatement: vi.fn(),
  uploadOriginalStatement: vi.fn(),
}))

const mockedAssertStatementStorageConfig = vi.mocked(assertStatementStorageConfig)
const mockedEnsureStatementsBucket = vi.mocked(ensureStatementsBucket)
const mockedGetStatementsBucket = vi.mocked(getStatementsBucket)
const mockedMapStatementStorageErrorMessage = vi.mocked(mapStatementStorageErrorMessage)
const mockedEnsureProfile = vi.mocked(ensureProfile)
const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient)
const mockedCreateServiceSupabaseClient = vi.mocked(createServiceSupabaseClient)
const mockedComputeFileHash = vi.mocked(computeFileHash)
const mockedStartStatementIngestionJob = vi.mocked(startStatementIngestionJob)
const mockedListStatementUploadImports = vi.mocked(listStatementUploadImports)
const mockedListStatementUploadImportsByFileHash = vi.mocked(listStatementUploadImportsByFileHash)
const mockedListStatementUploadImportsFromResultPayload = vi.mocked(listStatementUploadImportsFromResultPayload)
const mockedLoadStatementUploadByHash = vi.mocked(loadStatementUploadByHash)
const mockedReadStatementUploadImportCount = vi.mocked(readStatementUploadImportCount)
const mockedDeleteOriginalStatement = vi.mocked(deleteOriginalStatement)
const mockedUploadOriginalStatement = vi.mocked(uploadOriginalStatement)

function createRequest(selectedAccountId?: string) {
  const formData = new FormData()
  formData.set('statement', new File(['statement bytes'], 'statement.pdf', { type: 'application/pdf' }))
  if (selectedAccountId) {
    formData.set('account_id', selectedAccountId)
  }

  return new NextRequest('http://localhost/api/ai/statement', {
    method: 'POST',
    body: formData,
  })
}

function createServerSupabaseMock(options?: {
  selectedAccountFound?: boolean
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
    from(table: string) {
      if (table === 'user_profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { household_id: 'hh-1' }, error: null }),
            }),
          }),
        }
      }

      if (table === 'accounts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: options?.selectedAccountFound === false ? null : { id: 'acct-1' },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

function createServiceSupabaseMock() {
  const insert = vi.fn(async () => ({ error: null }))
  const updateEq = vi.fn(async () => ({ error: null }))
  const update = vi.fn(() => ({ eq: updateEq }))
  const deleteEq = vi.fn(async () => ({ error: null }))
  const deleteFn = vi.fn(() => ({ eq: deleteEq }))

  return {
    __spies: { insert, update, updateEq, deleteFn, deleteEq },
    from(table: string) {
      if (table === 'statement_uploads') {
        return {
          insert,
          update,
        }
      }

      if (table === 'statement_parse_sessions') {
        return {
          delete: deleteFn,
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

describe('POST /api/ai/statement', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    mockedCreateServerSupabaseClient.mockResolvedValue(createServerSupabaseMock() as never)
    mockedCreateServiceSupabaseClient.mockReturnValue(createServiceSupabaseMock() as never)
    mockedAssertStatementStorageConfig.mockImplementation(() => undefined)
    mockedEnsureStatementsBucket.mockResolvedValue({ ok: true, created: false })
    mockedGetStatementsBucket.mockReturnValue('statements')
    mockedMapStatementStorageErrorMessage.mockImplementation((message) => ({
      code: 'statement_storage_failed',
      userMessage: `mapped: ${message}`,
      status: 500,
    }))
    mockedEnsureProfile.mockResolvedValue(undefined)
    mockedComputeFileHash.mockReturnValue('hash-1')
    mockedLoadStatementUploadByHash.mockResolvedValue(null)
    mockedListStatementUploadImports.mockResolvedValue([])
    mockedListStatementUploadImportsByFileHash.mockResolvedValue([])
    mockedListStatementUploadImportsFromResultPayload.mockReturnValue([])
    mockedReadStatementUploadImportCount.mockReturnValue(null)
    mockedDeleteOriginalStatement.mockResolvedValue(undefined)
    mockedUploadOriginalStatement.mockResolvedValue({
      storageBucket: 'statements',
      storagePath: 'households/hh-1/statements/upload-1/statement.pdf',
    })
    mockedStartStatementIngestionJob.mockReturnValue({
      id: 'job-1',
      statementUploadId: 'upload-1',
      fileName: 'statement.pdf',
      status: 'queued',
      createdAt: '2026-03-16T00:00:00.000Z',
      startedAt: null,
      finishedAt: null,
      result: null,
      error: null,
    } as never)
    vi.spyOn(global.Math, 'random').mockReturnValue(0.123456789)
  })

  it('queues background ingestion after storing the original statement', async () => {
    const response = await POST(createRequest('acct-1'))
    const payload = await response.json()
    const serviceSupabase = mockedCreateServiceSupabaseClient.mock.results[0]?.value as ReturnType<typeof createServiceSupabaseMock>

    expect(response.status).toBe(202)
    expect(mockedUploadOriginalStatement).toHaveBeenCalledTimes(1)
    expect(serviceSupabase.__spies.insert).toHaveBeenCalledWith(expect.objectContaining({
      household_id: 'hh-1',
      uploaded_by: 'user-1',
      selected_account_id: 'acct-1',
      file_name: 'statement.pdf',
      file_sha256: 'hash-1',
      status: 'queued',
    }))
    expect(mockedStartStatementIngestionJob).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'statement.pdf',
      householdId: 'hh-1',
      userId: 'user-1',
    }))
    expect(payload).toEqual(expect.objectContaining({
      duplicate: false,
      status: 'queued',
      job: expect.objectContaining({
        id: 'job-1',
        status: 'queued',
      }),
    }))
  })

  it('returns a duplicate response from statement_uploads without uploading again', async () => {
    mockedLoadStatementUploadByHash.mockResolvedValue({
      id: 'upload-existing',
      file_name: 'statement.pdf',
      status: 'completed',
    })
    mockedListStatementUploadImports.mockResolvedValue([
      {
        importId: 'import-1',
        importLabel: 'DBS — Savings',
        accountLabel: 'DBS — Savings 1',
        reviewUrl: '/statements/review/import-1',
        status: 'in_review',
      },
      {
        importId: 'import-2',
        importLabel: 'DBS — Savings',
        accountLabel: 'DBS — Savings 2',
        reviewUrl: '/statements/review/import-2',
        status: 'in_review',
      },
    ])

    const response = await POST(createRequest())
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(mockedUploadOriginalStatement).not.toHaveBeenCalled()
    expect(mockedStartStatementIngestionJob).not.toHaveBeenCalled()
    expect(payload).toEqual({
      error: 'This file has already been processed.',
      duplicate: true,
      statementUploadId: 'upload-existing',
      existingFileName: 'statement.pdf',
      existingStatus: 'completed',
      existingImportCount: 2,
      existingImports: [
        {
          importId: 'import-1',
          importLabel: 'DBS — Savings',
          accountLabel: 'DBS — Savings 1',
          reviewUrl: '/statements/review/import-1',
          status: 'in_review',
        },
        {
          importId: 'import-2',
          importLabel: 'DBS — Savings',
          accountLabel: 'DBS — Savings 2',
          reviewUrl: '/statements/review/import-2',
          status: 'in_review',
        },
      ],
      parseSessionId: null,
      resumable: false,
      resumeUrl: null,
    })
  })

  it('falls back to file-hash imports when linked imports are missing', async () => {
    mockedLoadStatementUploadByHash.mockResolvedValue({
      id: 'upload-existing',
      file_name: 'statement.pdf',
      file_sha256: 'hash-1',
      status: 'completed',
    })
    mockedListStatementUploadImports.mockResolvedValue([])
    mockedListStatementUploadImportsByFileHash.mockResolvedValue([
      {
        importId: 'import-1',
        importLabel: 'DBS — Savings',
        accountLabel: 'DBS — Savings',
        reviewUrl: '/statements/review/import-1',
        status: 'committed',
      },
    ])

    const response = await POST(createRequest())
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(mockedListStatementUploadImports).toHaveBeenCalledWith(expect.objectContaining({
      statementUploadId: 'upload-existing',
    }))
    expect(mockedListStatementUploadImportsByFileHash).toHaveBeenCalledWith(expect.objectContaining({
      fileSha256: 'hash-1',
      householdId: 'hh-1',
    }))
    expect(payload).toEqual({
      error: 'This file has already been processed.',
      duplicate: true,
      statementUploadId: 'upload-existing',
      existingFileName: 'statement.pdf',
      existingStatus: 'completed',
      existingImportCount: 1,
      existingImports: [
        {
          importId: 'import-1',
          importLabel: 'DBS — Savings',
          accountLabel: 'DBS — Savings',
          reviewUrl: '/statements/review/import-1',
          status: 'committed',
        },
      ],
      parseSessionId: null,
      resumable: false,
      resumeUrl: null,
    })
  })

  it('restarts a stale completed upload when no live imports remain', async () => {
    mockedLoadStatementUploadByHash.mockResolvedValue({
      id: 'upload-existing',
      file_name: 'statement.pdf',
      file_sha256: 'hash-1',
      status: 'completed',
      storage_bucket: 'statements',
      storage_path: 'households/hh-1/statements/upload-existing/statement.pdf',
      result_payload: {
        importCount: 2,
        imports: [
          { reviewUrl: '/statements/review/deleted-1' },
          { reviewUrl: '/statements/review/deleted-2' },
        ],
      },
    })
    mockedListStatementUploadImports.mockResolvedValue([])
    mockedListStatementUploadImportsByFileHash.mockResolvedValue([])
    mockedUploadOriginalStatement.mockResolvedValue({
      storageBucket: 'statements',
      storagePath: 'households/hh-1/statements/upload-existing/statement.pdf',
    })

    const response = await POST(createRequest())
    const payload = await response.json()
    const serviceSupabase = mockedCreateServiceSupabaseClient.mock.results[0]?.value as ReturnType<typeof createServiceSupabaseMock>

    expect(response.status).toBe(202)
    expect(mockedDeleteOriginalStatement).toHaveBeenCalledWith(expect.objectContaining({
      storageBucket: 'statements',
      storagePath: 'households/hh-1/statements/upload-existing/statement.pdf',
    }))
    expect(serviceSupabase.__spies.deleteFn).toHaveBeenCalled()
    expect(serviceSupabase.__spies.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'queued',
      duplicate_of_statement_upload_id: null,
      parse_session_id: null,
      result_payload: null,
    }))
    expect(mockedStartStatementIngestionJob).toHaveBeenCalledWith(expect.objectContaining({
      statementUploadId: 'upload-existing',
      fileName: 'statement.pdf',
    }))
    expect(payload).toEqual(expect.objectContaining({
      duplicate: false,
      statementUploadId: 'upload-existing',
      status: 'queued',
      restartedStaleUpload: true,
    }))
  })

  it('returns a resumable duplicate response when account resolution is still pending', async () => {
    mockedLoadStatementUploadByHash.mockResolvedValue({
      id: 'upload-existing',
      file_name: 'statement.pdf',
      status: 'needs_account_resolution',
      parse_session_id: 'session-1',
    })
    mockedListStatementUploadImports.mockResolvedValue([])

    const response = await POST(createRequest())
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(mockedUploadOriginalStatement).not.toHaveBeenCalled()
    expect(mockedStartStatementIngestionJob).not.toHaveBeenCalled()
    expect(payload).toEqual({
      error: 'This file is already waiting for account matching.',
      duplicate: true,
      statementUploadId: 'upload-existing',
      existingFileName: 'statement.pdf',
      existingStatus: 'needs_account_resolution',
      existingImportCount: 0,
      existingImports: [],
      parseSessionId: 'session-1',
      resumable: true,
      resumeUrl: '/statements?parseSessionId=session-1',
    })
  })

  it('retries a failed upload when no imports were created yet', async () => {
    mockedLoadStatementUploadByHash.mockResolvedValue({
      id: 'upload-existing',
      file_name: 'statement.pdf',
      status: 'failed',
      storage_bucket: 'statements',
      storage_path: 'households/hh-1/statements/upload-existing/statement.pdf',
      parse_session_id: 'session-old',
    })
    mockedListStatementUploadImports.mockResolvedValue([])
    mockedUploadOriginalStatement.mockResolvedValue({
      storageBucket: 'statements',
      storagePath: 'households/hh-1/statements/upload-existing/statement.pdf',
    })

    const response = await POST(createRequest())
    const payload = await response.json()
    const serviceSupabase = mockedCreateServiceSupabaseClient.mock.results[0]?.value as ReturnType<typeof createServiceSupabaseMock>

    expect(response.status).toBe(202)
    expect(mockedDeleteOriginalStatement).toHaveBeenCalledWith(expect.objectContaining({
      storageBucket: 'statements',
      storagePath: 'households/hh-1/statements/upload-existing/statement.pdf',
    }))
    expect(serviceSupabase.__spies.deleteFn).toHaveBeenCalled()
    expect(serviceSupabase.__spies.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'queued',
      parse_session_id: null,
      error_code: null,
      error_message: null,
      parse_error: null,
      completed_at: null,
    }))
    expect(mockedUploadOriginalStatement).toHaveBeenCalledWith(expect.objectContaining({
      fileImportId: 'upload-existing',
      fileName: 'statement.pdf',
    }))
    expect(mockedStartStatementIngestionJob).toHaveBeenCalledWith(expect.objectContaining({
      statementUploadId: 'upload-existing',
      fileName: 'statement.pdf',
    }))
    expect(payload).toEqual(expect.objectContaining({
      duplicate: false,
      statementUploadId: 'upload-existing',
      status: 'queued',
      retriedFailedUpload: true,
    }))
  })

  it('returns a mapped storage error when the statement upload fails', async () => {
    mockedUploadOriginalStatement.mockRejectedValueOnce(new Error('storage write failed'))

    const response = await POST(createRequest())
    const payload = await response.json()
    const serviceSupabase = mockedCreateServiceSupabaseClient.mock.results[0]?.value as ReturnType<typeof createServiceSupabaseMock>

    expect(response.status).toBe(500)
    expect(payload).toEqual({
      error: 'mapped: storage write failed',
      details: 'storage write failed',
    })
    expect(serviceSupabase.__spies.update).toHaveBeenCalled()
    expect(mockedStartStatementIngestionJob).not.toHaveBeenCalled()
  })
})
