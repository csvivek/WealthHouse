// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseStatement } from '@/lib/ai/statement-parser'
import {
  loadAccountCandidates,
  routeParsedTransactions,
  stageSplitRoutedTransactions,
} from '@/lib/server/statement-import'
import {
  createStatementParseSession,
  getStatementParseSession,
  markStatementParseSessionResolved,
  updateStatementParseSessionUnresolved,
} from '@/lib/server/statement-parse-sessions'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { processStatementUpload } from '@/lib/server/statement-ingestion'

vi.mock('@/lib/ai/statement-parser', () => ({
  parseStatement: vi.fn(),
}))

vi.mock('@/lib/knowledge/merchant-intelligence', () => ({
  resolveMerchantCategory: vi.fn(),
}))

vi.mock('@/lib/tags/suggestions', () => ({
  suggestTags: vi.fn(),
}))

vi.mock('@/lib/server/statement-import', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/statement-import')>('@/lib/server/statement-import')
  return {
    ...actual,
    loadAccountCandidates: vi.fn(),
    routeParsedTransactions: vi.fn(),
    stageSplitRoutedTransactions: vi.fn(),
  }
})

vi.mock('@/lib/server/statement-parse-sessions', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/statement-parse-sessions')>('@/lib/server/statement-parse-sessions')
  return {
    ...actual,
    createStatementParseSession: vi.fn(),
    getStatementParseSession: vi.fn(),
    markStatementParseSessionResolved: vi.fn(),
    updateStatementParseSessionUnresolved: vi.fn(),
  }
})

vi.mock('@/lib/server/accounts', () => ({
  createAccountWithRelatedRecords: vi.fn(),
  findOrCreateInstitution: vi.fn(),
  normalizeAccountType: vi.fn((value: string | null) => value ?? 'savings'),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: vi.fn(),
}))

const mockedParseStatement = vi.mocked(parseStatement)
const mockedLoadAccountCandidates = vi.mocked(loadAccountCandidates)
const mockedRouteParsedTransactions = vi.mocked(routeParsedTransactions)
const mockedStageSplitRoutedTransactions = vi.mocked(stageSplitRoutedTransactions)
const mockedCreateStatementParseSession = vi.mocked(createStatementParseSession)
const mockedGetStatementParseSession = vi.mocked(getStatementParseSession)
const mockedMarkStatementParseSessionResolved = vi.mocked(markStatementParseSessionResolved)
const mockedUpdateStatementParseSessionUnresolved = vi.mocked(updateStatementParseSessionUnresolved)
const mockedCreateServiceSupabaseClient = vi.mocked(createServiceSupabaseClient)

function createAccountCandidate() {
  return {
    id: 'acct-1',
    institution_id: 'inst-1',
    product_name: 'My Account',
    nickname: 'DBS Savings 1',
    identifier_hint: '2211',
    account_type: 'savings',
    institutions: { name: 'DBS Bank Ltd' },
    cards: null,
  }
}

function createServiceSupabaseMock(overrides?: {
  upload?: Partial<Record<string, unknown>>
}) {
  const upload = {
    id: 'upload-1',
    household_id: 'hh-1',
    uploaded_by: 'user-1',
    selected_account_id: 'acct-hint',
    file_name: 'statement.pdf',
    file_sha256: 'hash-1',
    mime_type: 'application/pdf',
    file_size_bytes: 1024,
    storage_bucket: 'statements',
    storage_path: 'households/hh-1/statements/upload-1/statement.pdf',
    status: 'queued',
    parse_session_id: null,
    ...overrides?.upload,
  }
  const updateCalls: Array<Record<string, unknown>> = []

  return {
    __state: {
      upload,
      updateCalls,
    },
    from(table: string) {
      if (table === 'statement_uploads') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { ...upload }, error: null }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: async () => {
              updateCalls.push(patch)
              Object.assign(upload, patch)
              return { error: null }
            },
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
    storage: {
      from: () => ({
        download: async () => ({
          data: {
            arrayBuffer: async () => new TextEncoder().encode('statement bytes').buffer,
          },
          error: null,
        }),
      }),
    },
  }
}

describe('processStatementUpload', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('pauses a file and records a parse session when account routing stays unresolved', async () => {
    const serviceSupabase = createServiceSupabaseMock()
    mockedCreateServiceSupabaseClient.mockReturnValue(serviceSupabase as never)
    mockedParseStatement.mockResolvedValue({
      institution_name: 'DBS Bank Ltd',
      institution_code: 'dbs_bank',
      currency: 'SGD',
      account: { account_type: 'savings' },
      transactions: [
        { date: '2026-02-16', amount: 10, description: 'Transfer', account: { account_type: 'savings' } },
      ],
    } as never)
    mockedLoadAccountCandidates.mockResolvedValue([createAccountCandidate()] as never)
    mockedRouteParsedTransactions.mockResolvedValue({
      routedTransactions: [],
      unmatchedAccountDescriptors: [
        {
          descriptorKey: 'dbs-1',
          label: 'DBS Savings',
          transactionCount: 1,
          sampleRowIndexes: [0],
          institution_name: 'DBS Bank Ltd',
          institution_code: 'dbs_bank',
          account_type: 'savings',
          product_name: 'Savings Account',
          identifier_hint: null,
          card_name: null,
          card_last4: null,
          currency: 'SGD',
          suggestedExistingAccountId: 'acct-1',
          suggestedExistingAccountLabel: 'DBS Bank Ltd — DBS Savings 1',
          suggestedScore: 61,
        },
      ],
      suggestedExistingAccounts: [
        {
          accountId: 'acct-1',
          label: 'DBS Bank Ltd — DBS Savings 1',
        },
      ],
    } as never)
    mockedCreateStatementParseSession.mockResolvedValue('session-1')

    const result = await processStatementUpload({ statementUploadId: 'upload-1' })

    expect(result).toEqual({
      statementUploadId: 'upload-1',
      status: 'needs_account_resolution',
      parseSessionId: 'session-1',
      imports: [],
      importCount: 0,
      transactionsCount: 0,
      duplicateCount: 0,
      reviewUrl: null,
    })
    expect(mockedCreateStatementParseSession).toHaveBeenCalledWith(expect.objectContaining({
      statementUploadId: 'upload-1',
      householdId: 'hh-1',
      userId: 'user-1',
      selectedAccountId: 'acct-hint',
    }))
    expect(mockedStageSplitRoutedTransactions).not.toHaveBeenCalled()
    expect(serviceSupabase.__state.updateCalls[0]).toEqual(expect.objectContaining({
      status: 'parsing',
      error_code: null,
      error_message: null,
      parse_error: null,
    }))
    expect(serviceSupabase.__state.updateCalls[1]).toEqual(expect.objectContaining({
      status: 'needs_account_resolution',
      parse_session_id: 'session-1',
      result_payload: expect.objectContaining({
        status: 'needs_account_resolution',
        parseSessionId: 'session-1',
      }),
    }))
  })

  it('completes split imports when a paused upload resumes with account resolutions', async () => {
    const serviceSupabase = createServiceSupabaseMock({
      upload: {
        parse_session_id: 'session-1',
      },
    })
    mockedCreateServiceSupabaseClient.mockReturnValue(serviceSupabase as never)
    mockedGetStatementParseSession.mockResolvedValue({
      id: 'session-1',
      parsed_payload: {
        institution_name: 'DBS Bank Ltd',
        institution_code: 'dbs_bank',
        currency: 'SGD',
        account: { account_type: 'savings' },
        transactions: [
          { date: '2026-02-16', amount: 10, description: 'Transfer', account: { account_type: 'savings' } },
        ],
      },
      unresolved_descriptors: [
        {
          descriptorKey: 'dbs-1',
          label: 'DBS Savings',
          institution_name: 'DBS Bank Ltd',
          institution_code: 'dbs_bank',
          account_type: 'savings',
          product_name: 'Savings Account',
          identifier_hint: null,
          card_name: null,
          card_last4: null,
          currency: 'SGD',
        },
      ],
      resolution_payload: [
        {
          descriptorKey: 'dbs-1',
          existingAccountId: 'acct-1',
        },
      ],
    } as never)
    mockedLoadAccountCandidates.mockResolvedValue([createAccountCandidate()] as never)
    mockedRouteParsedTransactions.mockResolvedValue({
      routedTransactions: [
        {
          rowIndex: 0,
          txnDate: '2026-02-16',
          postingDate: null,
          merchantRaw: 'Transfer',
          description: 'Transfer',
          amount: 10,
          txnType: 'debit',
          currency: 'SGD',
          originalAmount: null,
          originalCurrency: null,
          reference: null,
          txnHash: 'hash-row-1',
          account: {
            id: 'acct-1',
            institutionId: 'inst-1',
            label: 'DBS Bank Ltd — DBS Savings 1',
            matchedBy: 'manual',
            cardId: null,
            cardName: null,
            cardLast4: null,
          },
          accountDescriptor: { account_type: 'savings' },
          rawTransaction: { date: '2026-02-16', amount: 10 },
          categoryId: null,
          categoryName: null,
          categoryHint: null,
          categoryConfidence: null,
          categoryDecisionSource: null,
          merchantCanonicalName: null,
          merchantBusinessType: null,
          similarMerchantKey: null,
          merchantAliases: [],
          searchSummary: null,
          tagIds: [],
          tagSuggestions: [],
        },
      ],
      unmatchedAccountDescriptors: [],
      suggestedExistingAccounts: [],
    } as never)
    mockedStageSplitRoutedTransactions.mockResolvedValue({
      importCount: 2,
      transactionsCount: 4,
      duplicateCount: 1,
      imports: [
        {
          importId: 'import-1',
          importLabel: 'DBS Savings 1',
          accountLabel: 'DBS Bank Ltd — DBS Savings 1',
          reviewUrl: '/statements/review/import-1',
          status: 'in_review',
        },
        {
          importId: 'import-2',
          importLabel: 'DBS Savings 2',
          accountLabel: 'DBS Bank Ltd — DBS Savings 2',
          reviewUrl: '/statements/review/import-2',
          status: 'in_review',
        },
      ],
      reviewUrl: null,
    } as never)

    const result = await processStatementUpload({ statementUploadId: 'upload-1' })

    expect(mockedParseStatement).not.toHaveBeenCalled()
    const routeArgs = mockedRouteParsedTransactions.mock.calls[0]?.[0]
    expect(routeArgs?.manualAccount).toBeNull()
    expect(routeArgs?.accountOverridesByDescriptorKey).toBeInstanceOf(Map)
    expect(routeArgs?.accountOverridesByDescriptorKey?.get('dbs-1')).toEqual(expect.objectContaining({
      id: 'acct-1',
      label: 'DBS Bank Ltd — DBS Savings 1',
      matchedBy: 'manual',
    }))
    expect(mockedStageSplitRoutedTransactions).toHaveBeenCalledWith(expect.objectContaining({
      statementUploadId: 'upload-1',
      storageBucket: 'statements',
      storagePath: 'households/hh-1/statements/upload-1/statement.pdf',
    }))
    expect(mockedMarkStatementParseSessionResolved).toHaveBeenCalledWith({
      supabase: serviceSupabase,
      parseSessionId: 'session-1',
    })
    expect(mockedUpdateStatementParseSessionUnresolved).not.toHaveBeenCalled()
    expect(result).toEqual({
      statementUploadId: 'upload-1',
      status: 'completed',
      importCount: 2,
      transactionsCount: 4,
      duplicateCount: 1,
      imports: [
        {
          importId: 'import-1',
          importLabel: 'DBS Savings 1',
          accountLabel: 'DBS Bank Ltd — DBS Savings 1',
          reviewUrl: '/statements/review/import-1',
          status: 'in_review',
        },
        {
          importId: 'import-2',
          importLabel: 'DBS Savings 2',
          accountLabel: 'DBS Bank Ltd — DBS Savings 2',
          reviewUrl: '/statements/review/import-2',
          status: 'in_review',
        },
      ],
      reviewUrl: null,
    })
    expect(serviceSupabase.__state.updateCalls.at(-1)).toEqual(expect.objectContaining({
      status: 'completed',
      parse_session_id: 'session-1',
      result_payload: expect.objectContaining({
        status: 'completed',
        importCount: 2,
      }),
    }))
  })
})
