// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/ai/statement/resolve-account/route'
import { ensureProfile } from '@/lib/supabase/ensure-profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getStatementParseSession } from '@/lib/server/statement-parse-sessions'
import { queueStatementParseSessionResumption } from '@/lib/server/statement-ingestion'
import { startStatementIngestionJob } from '@/lib/server/statement-ingestion-jobs'

vi.mock('@/lib/supabase/ensure-profile', () => ({
  ensureProfile: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/server/statement-parse-sessions', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/statement-parse-sessions')>('@/lib/server/statement-parse-sessions')
  return {
    ...actual,
    getStatementParseSession: vi.fn(),
  }
})

vi.mock('@/lib/server/statement-ingestion', () => ({
  queueStatementParseSessionResumption: vi.fn(),
}))

vi.mock('@/lib/server/statement-ingestion-jobs', () => ({
  startStatementIngestionJob: vi.fn(),
}))

const mockedEnsureProfile = vi.mocked(ensureProfile)
const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient)
const mockedGetStatementParseSession = vi.mocked(getStatementParseSession)
const mockedQueueStatementParseSessionResumption = vi.mocked(queueStatementParseSessionResumption)
const mockedStartStatementIngestionJob = vi.mocked(startStatementIngestionJob)

describe('POST /api/ai/statement/resolve-account', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    mockedCreateServerSupabaseClient.mockReturnValue({
      auth: {
        getUser: async () => ({ data: { user: { id: 'user-1' } } }),
      },
      from: (table: string) => {
        if (table === 'user_profiles') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { household_id: 'hh-1' } }),
              }),
            }),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      },
    } as never)

    mockedEnsureProfile.mockResolvedValue(undefined)
    mockedGetStatementParseSession.mockResolvedValue({
      id: 'session-1',
      statement_upload_id: 'upload-1',
      status: 'needs_account_resolution',
      file_name: 'statement.pdf',
    } as never)
    mockedQueueStatementParseSessionResumption.mockResolvedValue(undefined)
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
  })

  it('queues background resume for the paused statement upload', async () => {
    const request = new NextRequest('http://localhost/api/ai/statement/resolve-account', {
      method: 'POST',
      body: JSON.stringify({
        parseSessionId: 'session-1',
        resolutions: [{ descriptorKey: 'dbs-1', existingAccountId: 'acct-1' }],
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(202)
    expect(mockedQueueStatementParseSessionResumption).toHaveBeenCalledWith({
      statementUploadId: 'upload-1',
      parseSessionId: 'session-1',
      resolutionPayload: [{ descriptorKey: 'dbs-1', existingAccountId: 'acct-1' }],
    })
    expect(mockedStartStatementIngestionJob).toHaveBeenCalledWith({
      statementUploadId: 'upload-1',
      fileName: 'statement.pdf',
      userId: 'user-1',
      householdId: 'hh-1',
    })
    expect(payload).toEqual({
      statementUploadId: 'upload-1',
      parseSessionId: 'session-1',
      status: 'queued',
      job: expect.objectContaining({
        id: 'job-1',
        status: 'queued',
      }),
    })
  })
})
