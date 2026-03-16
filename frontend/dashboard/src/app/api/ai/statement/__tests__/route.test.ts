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
import { listStatementUploadImports, loadStatementUploadByHash } from '@/lib/server/statement-uploads'
import { uploadOriginalStatement } from '@/lib/server/statement-storage'

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
  loadStatementUploadByHash: vi.fn(),
}))

vi.mock('@/lib/server/statement-storage', () => ({
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
const mockedLoadStatementUploadByHash = vi.mocked(loadStatementUploadByHash)
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

  return {
    __spies: { insert, update, updateEq },
    from(table: string) {
      if (table === 'statement_uploads') {
        return {
          insert,
          update,
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
    })
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
