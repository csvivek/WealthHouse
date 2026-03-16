// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/ai/statement/route'
import { parseStatement } from '@/lib/ai/statement-parser'
import {
  assertStatementStorageConfig,
  ensureStatementsBucket,
  getStatementsBucket,
  mapStatementStorageErrorMessage,
} from '@/lib/statements/config'
import { ensureProfile } from '@/lib/supabase/ensure-profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import {
  buildParsedAccountLabel,
  computeFileHash,
  loadAccountCandidates,
  resolveAccountCandidate,
  resolvedAccountFromCandidate,
  routeParsedTransactions,
  stageRoutedTransactions,
} from '@/lib/server/statement-import'
import {
  createStatementParseSession,
  isStatementParseSessionSchemaError,
} from '@/lib/server/statement-parse-sessions'
import {
  cleanupExpiredStatementSessionStorage,
  deleteOriginalStatement,
  uploadOriginalStatement,
} from '@/lib/server/statement-storage'

vi.mock('@/lib/ai/statement-parser', () => ({
  parseStatement: vi.fn(),
}))

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
  buildParsedAccountLabel: vi.fn(),
  computeFileHash: vi.fn(),
  loadAccountCandidates: vi.fn(),
  resolveAccountCandidate: vi.fn(),
  resolvedAccountFromCandidate: vi.fn(),
  routeParsedTransactions: vi.fn(),
  stageRoutedTransactions: vi.fn(),
}))

vi.mock('@/lib/server/statement-parse-sessions', () => ({
  createStatementParseSession: vi.fn(),
  isStatementParseSessionSchemaError: vi.fn(),
}))

vi.mock('@/lib/server/statement-storage', () => ({
  cleanupExpiredStatementSessionStorage: vi.fn(),
  deleteOriginalStatement: vi.fn(),
  uploadOriginalStatement: vi.fn(),
}))

const mockedParseStatement = vi.mocked(parseStatement)
const mockedAssertStatementStorageConfig = vi.mocked(assertStatementStorageConfig)
const mockedEnsureStatementsBucket = vi.mocked(ensureStatementsBucket)
const mockedGetStatementsBucket = vi.mocked(getStatementsBucket)
const mockedMapStatementStorageErrorMessage = vi.mocked(mapStatementStorageErrorMessage)
const mockedEnsureProfile = vi.mocked(ensureProfile)
const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient)
const mockedCreateServiceSupabaseClient = vi.mocked(createServiceSupabaseClient)
const mockedBuildParsedAccountLabel = vi.mocked(buildParsedAccountLabel)
const mockedComputeFileHash = vi.mocked(computeFileHash)
const mockedLoadAccountCandidates = vi.mocked(loadAccountCandidates)
const mockedResolveAccountCandidate = vi.mocked(resolveAccountCandidate)
const mockedResolvedAccountFromCandidate = vi.mocked(resolvedAccountFromCandidate)
const mockedRouteParsedTransactions = vi.mocked(routeParsedTransactions)
const mockedStageRoutedTransactions = vi.mocked(stageRoutedTransactions)
const mockedCleanupExpiredStatementSessionStorage = vi.mocked(cleanupExpiredStatementSessionStorage)
const mockedCreateStatementParseSession = vi.mocked(createStatementParseSession)
const mockedIsStatementParseSessionSchemaError = vi.mocked(isStatementParseSessionSchemaError)
const mockedDeleteOriginalStatement = vi.mocked(deleteOriginalStatement)
const mockedUploadOriginalStatement = vi.mocked(uploadOriginalStatement)

function createRequest() {
  const formData = new FormData()
  formData.set('statement', new File(['statement bytes'], 'statement.pdf', { type: 'application/pdf' }))

  return new NextRequest('http://localhost/api/ai/statement', {
    method: 'POST',
    body: formData,
  })
}

function createServerSupabaseMock(options?: {
  existingImport?: {
    id: string
    status: string
    file_name: string
  } | null
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

      if (table === 'file_imports') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                not: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: options?.existingImport ?? null, error: null }),
                  }),
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

describe('POST /api/ai/statement', () => {
  beforeEach(() => {
    mockedCreateServerSupabaseClient.mockReset()
    mockedCreateServiceSupabaseClient.mockReset()
    mockedParseStatement.mockReset()
    mockedAssertStatementStorageConfig.mockReset()
    mockedEnsureStatementsBucket.mockReset()
    mockedGetStatementsBucket.mockReset()
    mockedMapStatementStorageErrorMessage.mockReset()
    mockedEnsureProfile.mockReset()
    mockedBuildParsedAccountLabel.mockReset()
    mockedComputeFileHash.mockReset()
    mockedLoadAccountCandidates.mockReset()
    mockedResolveAccountCandidate.mockReset()
    mockedResolvedAccountFromCandidate.mockReset()
    mockedRouteParsedTransactions.mockReset()
    mockedStageRoutedTransactions.mockReset()
    mockedCleanupExpiredStatementSessionStorage.mockReset()
    mockedCreateStatementParseSession.mockReset()
    mockedIsStatementParseSessionSchemaError.mockReset()
    mockedDeleteOriginalStatement.mockReset()
    mockedUploadOriginalStatement.mockReset()

    mockedCreateServerSupabaseClient.mockResolvedValue(createServerSupabaseMock() as never)
    mockedCreateServiceSupabaseClient.mockReturnValue({ storage: {} } as never)
    mockedParseStatement.mockResolvedValue({
      account: { product_name: 'DBS Altitude Card' },
      institution_name: 'DBS Bank Ltd',
      institution_code: 'dbs',
      currency: 'SGD',
    } as never)
    mockedAssertStatementStorageConfig.mockImplementation(() => undefined)
    mockedEnsureStatementsBucket.mockResolvedValue({ ok: true, created: false })
    mockedGetStatementsBucket.mockReturnValue('statements')
    mockedMapStatementStorageErrorMessage.mockImplementation((message) => ({
      code: 'statement_storage_failed',
      userMessage: `mapped: ${message}`,
      status: 500,
    }))
    mockedEnsureProfile.mockResolvedValue(undefined)
    mockedBuildParsedAccountLabel.mockReturnValue('DBS Bank Ltd — DBS Altitude Card')
    mockedComputeFileHash.mockReturnValue('hash-1')
    mockedLoadAccountCandidates.mockResolvedValue([{ id: 'acct-1' }] as never)
    mockedResolveAccountCandidate.mockReturnValue({
      account: {
        id: 'acct-1',
        institutionId: 'inst-1',
        label: 'DBS Bank Ltd — DBS Altitude Card',
        matchedBy: 'auto',
        cardId: null,
        cardName: null,
        cardLast4: null,
      },
    } as never)
    mockedResolvedAccountFromCandidate.mockImplementation((candidate) => candidate as never)
    mockedRouteParsedTransactions.mockResolvedValue({
      routedTransactions: [
        {
          account: {
            id: 'acct-1',
            institutionId: 'inst-1',
            label: 'DBS Bank Ltd — DBS Altitude Card',
            matchedBy: 'auto',
            cardId: null,
            cardName: null,
            cardLast4: null,
          },
        },
      ],
      unmatchedAccountDescriptors: [],
      suggestedExistingAccounts: [],
    } as never)
    mockedStageRoutedTransactions.mockImplementation(async (params) => ({
      importId: params.fileImportId,
      status: 'in_review',
    }) as never)
    mockedCleanupExpiredStatementSessionStorage.mockResolvedValue([] as never)
    mockedCreateStatementParseSession.mockResolvedValue('parse-session-1')
    mockedIsStatementParseSessionSchemaError.mockReturnValue(false)
    mockedDeleteOriginalStatement.mockResolvedValue(undefined)
    mockedUploadOriginalStatement.mockImplementation(async (params) => ({
      storageBucket: 'statements',
      storagePath: `households/${params.householdId}/statements/${params.fileImportId}/statement.pdf`,
    }))
  })

  it('uploads the original statement and persists storage metadata on successful import', async () => {
    const response = await POST(createRequest())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(mockedUploadOriginalStatement).toHaveBeenCalledTimes(1)
    expect(mockedUploadOriginalStatement).toHaveBeenCalledWith(expect.objectContaining({
      householdId: 'hh-1',
      fileName: 'statement.pdf',
      fileImportId: expect.any(String),
    }))

    const uploadParams = mockedUploadOriginalStatement.mock.calls[0]?.[0]
    const stageParams = mockedStageRoutedTransactions.mock.calls[0]?.[0]

    expect(stageParams).toEqual(expect.objectContaining({
      householdId: 'hh-1',
      userId: 'user-1',
      fileImportId: uploadParams?.fileImportId,
      storageBucket: 'statements',
      storagePath: `households/hh-1/statements/${uploadParams?.fileImportId}/statement.pdf`,
    }))
    expect(payload).toEqual({
      importId: uploadParams?.fileImportId,
      status: 'in_review',
    })
  })

  it('returns a storage error when uploading the source statement fails', async () => {
    mockedUploadOriginalStatement.mockRejectedValueOnce(new Error('storage write failed'))

    const response = await POST(createRequest())
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({
      error: 'mapped: storage write failed',
      details: 'storage write failed',
    })
    expect(mockedStageRoutedTransactions).not.toHaveBeenCalled()
  })

  it('returns the existing import for duplicate uploads without writing another storage object', async () => {
    mockedCreateServerSupabaseClient.mockResolvedValueOnce(createServerSupabaseMock({
      existingImport: {
        id: 'existing-import-1',
        status: 'committed',
        file_name: 'existing-statement.pdf',
      },
    }) as never)

    const response = await POST(createRequest())
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload).toEqual({
      error: 'This file has already been processed.',
      existingImportId: 'existing-import-1',
      existingFileName: 'existing-statement.pdf',
      existingStatus: 'committed',
    })
    expect(mockedParseStatement).not.toHaveBeenCalled()
    expect(mockedUploadOriginalStatement).not.toHaveBeenCalled()
    expect(mockedStageRoutedTransactions).not.toHaveBeenCalled()
  })

  it('stores the original statement for resume-supported unmatched imports', async () => {
    mockedRouteParsedTransactions.mockResolvedValueOnce({
      routedTransactions: [],
      unmatchedAccountDescriptors: [
        { descriptorKey: 'descriptor-1', label: 'DBS Bank Ltd — DBS Altitude Card', transactionCount: 2 },
      ],
      suggestedExistingAccounts: [],
    } as never)

    const response = await POST(createRequest())
    const payload = await response.json()

    expect(response.status).toBe(422)
    expect(payload).toEqual(expect.objectContaining({
      code: 'transaction_account_match_required',
      parseSessionId: 'parse-session-1',
      recoveryMode: 'resume_supported',
    }))

    const uploadParams = mockedUploadOriginalStatement.mock.calls[0]?.[0]
    expect(mockedCreateStatementParseSession).toHaveBeenCalledWith(expect.objectContaining({
      householdId: 'hh-1',
      userId: 'user-1',
      storageBucket: 'statements',
      storagePath: `households/hh-1/statements/${uploadParams?.fileImportId}/statement.pdf`,
    }))
    expect(mockedStageRoutedTransactions).not.toHaveBeenCalled()
  })
})
