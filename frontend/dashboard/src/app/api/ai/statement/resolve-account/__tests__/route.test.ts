// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/ai/statement/resolve-account/route'
import { ensureProfile } from '@/lib/supabase/ensure-profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  loadAccountCandidates,
  routeParsedTransactions,
  stageRoutedTransactions,
} from '@/lib/server/statement-import'
import {
  getStatementParseSession,
  markStatementParseSessionResolved,
} from '@/lib/server/statement-parse-sessions'
import { cleanupExpiredStatementSessionStorage } from '@/lib/server/statement-storage'

vi.mock('@/lib/supabase/ensure-profile', () => ({
  ensureProfile: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/server/statement-import', async () => {
  return {
    loadAccountCandidates: vi.fn(),
    resolveAccountCandidate: vi.fn(() => ({ account: null })),
    resolvedAccountFromCandidate: vi.fn(),
    routeParsedTransactions: vi.fn(),
    stageRoutedTransactions: vi.fn(),
  }
})

vi.mock('@/lib/server/statement-parse-sessions', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/statement-parse-sessions')>('@/lib/server/statement-parse-sessions')
  return {
    ...actual,
    getStatementParseSession: vi.fn(),
    markStatementParseSessionResolved: vi.fn(),
  }
})

vi.mock('@/lib/server/statement-storage', () => ({
  cleanupExpiredStatementSessionStorage: vi.fn(),
}))

const mockedEnsureProfile = vi.mocked(ensureProfile)
const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient)
const mockedLoadAccountCandidates = vi.mocked(loadAccountCandidates)
const mockedRouteParsedTransactions = vi.mocked(routeParsedTransactions)
const mockedStageRoutedTransactions = vi.mocked(stageRoutedTransactions)
const mockedCleanupExpiredStatementSessionStorage = vi.mocked(cleanupExpiredStatementSessionStorage)
const mockedGetStatementParseSession = vi.mocked(getStatementParseSession)
const mockedMarkStatementParseSessionResolved = vi.mocked(markStatementParseSessionResolved)

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
    mockedCleanupExpiredStatementSessionStorage.mockResolvedValue([] as never)
    mockedGetStatementParseSession.mockResolvedValue({
      id: 'session-1',
      status: 'needs_account_resolution',
      file_name: 'statement.pdf',
      file_sha256: 'sha',
      mime_type: 'application/pdf',
      file_size_bytes: 10,
      storage_bucket: 'statements',
      storage_path: 'households/hh-1/statements/file-1/statement.pdf',
      parsed_payload: {
        institution_code: 'citibank',
        institution_name: 'Citibank Singapore Ltd',
        account: { account_type: 'loan', product_name: 'Ready Credit' },
      },
      unresolved_descriptors: [],
    } as never)
    mockedLoadAccountCandidates.mockResolvedValue([] as never)
    mockedRouteParsedTransactions.mockResolvedValue({
      routedTransactions: [{
        account: {
          id: 'acct-1',
          institutionId: 'inst-1',
          label: 'Citibank Singapore Ltd — Ready Credit',
          matchedBy: 'auto',
          cardId: null,
          cardName: null,
          cardLast4: null,
        },
      }],
      unmatchedAccountDescriptors: [],
      suggestedExistingAccounts: [],
    } as never)
    mockedStageRoutedTransactions.mockResolvedValue({
      importId: 'import-1',
      reviewUrl: '/statements/review/import-1',
      transactionsCount: 1,
    } as never)
    mockedMarkStatementParseSessionResolved.mockResolvedValue(undefined)
  })

  it('continues the import with the stored source-file metadata attached', async () => {
    const request = new NextRequest('http://localhost/api/ai/statement/resolve-account', {
      method: 'POST',
      body: JSON.stringify({
        parseSessionId: 'session-1',
        resolutions: [],
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const stageParams = mockedStageRoutedTransactions.mock.calls[0]?.[0]

    expect(response.status).toBe(200)
    expect(stageParams?.storageBucket).toBe('statements')
    expect(stageParams?.storagePath).toBe('households/hh-1/statements/file-1/statement.pdf')
    expect(mockedMarkStatementParseSessionResolved).toHaveBeenCalledWith({
      supabase: expect.anything(),
      parseSessionId: 'session-1',
    })
  })
})
