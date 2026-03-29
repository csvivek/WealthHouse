// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE, GET } from '@/app/api/ai/statement/[importId]/route'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { resolveEffectivePaymentGroups } from '@/lib/server/category-groups'
import { listTags } from '@/lib/server/tag-service'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/server/category-groups', () => ({
  resolveEffectivePaymentGroups: vi.fn(),
}))

vi.mock('@/lib/server/tag-service', () => ({
  listTags: vi.fn(),
}))

const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient)
const mockedCreateServiceSupabaseClient = vi.mocked(createServiceSupabaseClient)
const mockedResolveEffectivePaymentGroups = vi.mocked(resolveEffectivePaymentGroups)
const mockedListTags = vi.mocked(listTags)

function createOrderChain(result: unknown, remainingOrders: number): unknown {
  if (remainingOrders === 0) {
    return Promise.resolve(result)
  }

  return {
    order: () => createOrderChain(result, remainingOrders - 1),
  }
}

function createSupabaseMock(options?: {
  statementImportsErrorMessage?: string
  linksErrorMessage?: string
  includeStoredFile?: boolean
}) {
  const fileImport = {
    id: 'import-1',
    uploaded_by: 'user-1',
    status: 'in_review',
    file_name: 'statement.pdf',
    storage_bucket: options?.includeStoredFile === false ? null : 'statements',
    storage_path: options?.includeStoredFile === false ? null : 'households/hh-1/statements/import-1/statement.pdf',
    institution_code: 'amex',
    raw_parse_result: {
      institution_name: 'Citibank Singapore Ltd',
      account: {
        account_type: 'loan',
        product_name: 'CITIBANK READY CREDIT',
        identifier_hint: '1-905379-255',
        card_name: 'CITIBANK READY CREDIT',
        card_last4: '255',
      },
      matched_accounts: [
        {
          label: 'Citibank Singapore Ltd — Citi Ready Credit',
        },
      ],
    },
    statement_date: '2026-02-28',
    statement_period_start: '2026-02-01',
    statement_period_end: '2026-02-28',
    summary_json: null,
    card_info_json: {
      statementAccount: {
        account_type: 'loan',
      },
      matchedAccounts: [
        {
          label: 'Citibank Singapore Ltd — Citi Ready Credit',
        },
      ],
    },
    currency: 'USD',
    created_at: '2026-03-01T00:00:00.000Z',
  }

  const stagingRows = [
    {
      id: 'row-1',
      row_index: 1,
      review_status: 'pending',
      duplicate_status: 'none',
      duplicate_transaction_id: null,
      committed_transaction_id: null,
      is_edited: false,
      txn_date: '2026-02-10',
      posting_date: null,
      merchant_raw: 'Whole Foods',
      description: 'Groceries',
      amount: 45.12,
      txn_type: 'debit',
      currency: 'USD',
      reference: null,
      original_amount: null,
      original_currency: null,
      original_data: {},
      review_note: null,
    },
  ]

  const categories = [
    {
      id: 1,
      name: 'Groceries',
      type: 'expense',
      group_name: 'Food & Dining',
    },
  ]

  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
    from: (table: string) => {
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
                single: async () => ({ data: fileImport, error: null }),
              }),
            }),
          }),
        }
      }

      if (table === 'import_staging') {
        return {
          select: () => ({
            eq: () => createOrderChain({ data: stagingRows, error: null }, 1),
          }),
        }
      }

      if (table === 'categories') {
        return {
          select: () => createOrderChain({ data: categories, error: null }, 3),
        }
      }

      if (table === 'accounts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: async () => ({
                  data: [
                    {
                      id: 'acct-1',
                      product_name: 'CITIBANK READY CREDIT',
                      nickname: 'Ready Credit',
                      account_type: 'loan',
                      institutions: { name: 'Citibank Singapore Ltd' },
                    },
                  ],
                }),
              }),
            }),
          }),
        }
      }

      if (table === 'statement_imports') {
        return {
          select: () => ({
            eq: async () => ({
              data: [],
              count: 0,
              error: options?.statementImportsErrorMessage
                ? { message: options.statementImportsErrorMessage }
                : null,
            }),
          }),
        }
      }

      if (table === 'staging_transaction_links') {
        return {
          select: () => ({
            eq: async () => ({
              data: [],
              error: options?.linksErrorMessage
                ? { message: options.linksErrorMessage }
                : null,
            }),
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

function createServiceSupabaseMock(options?: {
  uploaderProfileErrorMessage?: string
  uploaderEmailErrorMessage?: string
}) {
  return {
    from: (table: string) => {
      if (table === 'user_profiles') {
        return {
          select: (columns?: string) => {
            if (String(columns ?? '').includes('auth.users(email)')) {
              throw new Error('Unexpected auth.users nested select')
            }

            return ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: options?.uploaderProfileErrorMessage
                    ? null
                    : {
                      id: 'user-1',
                      display_name: 'Alex Example',
                    },
                  error: options?.uploaderProfileErrorMessage
                    ? { message: options.uploaderProfileErrorMessage }
                    : null,
                }),
              }),
            })
          },
        }
      }

      throw new Error(`Unexpected service table ${table}`)
    },
    auth: {
      admin: {
        getUserById: async () => ({
          data: options?.uploaderEmailErrorMessage
            ? { user: null }
            : { user: { email: 'alex@example.com' } },
          error: options?.uploaderEmailErrorMessage
            ? { message: options.uploaderEmailErrorMessage }
            : null,
        }),
      },
    },
  }
}

function createDeleteServerSupabaseMock() {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
    from: (table: string) => {
      if (table === 'user_profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { household_id: 'hh-1' }, error: null }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected delete server table ${table}`)
    },
  }
}

function createDeleteServiceSupabaseMock() {
  const spies = {
    fileImportsUpdate: vi.fn(),
    fileImportsDelete: vi.fn(),
    mappingsDelete: vi.fn(),
    transactionLinksDelete: vi.fn(),
    ledgerEntriesUpdate: vi.fn(),
    investmentTransactionsUpdate: vi.fn(),
    advanceRepaymentsUpdate: vi.fn(),
    importStagingUpdate: vi.fn(),
    statementTransactionsDelete: vi.fn(),
    statementSummariesDelete: vi.fn(),
    statementImportsDelete: vi.fn(),
    statementUploadsUpdate: vi.fn(),
    statementUploadsDelete: vi.fn(),
    storageRemove: vi.fn(),
  }

  const fileImport = {
    id: 'import-1',
    household_id: 'hh-1',
    file_name: 'statement.pdf',
    statement_upload_id: 'upload-1',
    storage_bucket: 'statements',
    storage_path: 'households/hh-1/statements/upload-1/statement.pdf',
  }

  return {
    __spies: spies,
    from: (table: string) => {
      if (table === 'file_imports') {
        return {
          select: (_columns?: string, options?: { count?: string; head?: boolean }) => {
            if (options?.head) {
              return {
                eq: () => ({
                  eq: async () => ({ count: 0, error: null }),
                }),
              }
            }

            return {
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: fileImport, error: null }),
                }),
              }),
            }
          },
          update: (payload?: unknown) => ({
            eq: async () => {
              spies.fileImportsUpdate(payload)
              return { error: null }
            },
          }),
          delete: () => ({
            eq: () => ({
              eq: async () => {
                spies.fileImportsDelete()
                return { error: null }
              },
            }),
          }),
        }
      }

      if (table === 'statement_imports') {
        return {
          select: () => ({
            eq: async () => ({ data: [{ id: 'stmt-1' }], error: null }),
          }),
          delete: () => ({
            in: async (_column: string, ids: string[]) => {
              spies.statementImportsDelete(ids)
              return { error: null }
            },
          }),
        }
      }

      if (table === 'statement_transactions') {
        return {
          select: () => ({
            in: async () => ({ data: [{ id: 'txn-1' }], error: null }),
          }),
          delete: () => ({
            in: async (_column: string, ids: string[]) => {
              spies.statementTransactionsDelete(ids)
              return { error: null }
            },
          }),
        }
      }

      if (table === 'mappings') {
        return {
          delete: () => ({
            in: async (_column: string, ids: string[]) => {
              spies.mappingsDelete(ids)
              return { error: null }
            },
          }),
        }
      }

      if (table === 'transaction_links') {
        return {
          delete: () => ({
            in: async (_column: string, ids: string[]) => {
              spies.transactionLinksDelete(ids)
              return { error: null }
            },
          }),
        }
      }

      if (table === 'ledger_entries') {
        return {
          update: (payload?: unknown) => ({
            in: async (_column: string, ids: string[]) => {
              spies.ledgerEntriesUpdate({ payload, ids })
              return { error: null }
            },
          }),
        }
      }

      if (table === 'investment_transactions') {
        return {
          update: (payload?: unknown) => ({
            in: async (_column: string, ids: string[]) => {
              spies.investmentTransactionsUpdate({ payload, ids })
              return { error: null }
            },
          }),
        }
      }

      if (table === 'advance_repayments') {
        return {
          update: (payload?: unknown) => ({
            in: async (_column: string, ids: string[]) => {
              spies.advanceRepaymentsUpdate({ payload, ids })
              return { error: null }
            },
          }),
        }
      }

      if (table === 'import_staging') {
        return {
          update: (payload?: unknown) => ({
            in: async (_column: string, ids: string[]) => {
              spies.importStagingUpdate({ payload, ids })
              return { error: null }
            },
          }),
        }
      }

      if (table === 'statement_summaries') {
        return {
          delete: () => ({
            in: async (_column: string, ids: string[]) => {
              spies.statementSummariesDelete(ids)
              return { error: null }
            },
          }),
        }
      }

      if (table === 'statement_uploads') {
        return {
          update: (payload?: unknown) => ({
            eq: async () => {
              spies.statementUploadsUpdate(payload)
              return { error: null }
            },
          }),
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'upload-1',
                    storage_bucket: 'statements',
                    storage_path: 'households/hh-1/statements/upload-1/statement.pdf',
                  },
                  error: null,
                }),
              }),
            }),
          }),
          delete: () => ({
            eq: () => ({
              eq: async () => {
                spies.statementUploadsDelete()
                return { error: null }
              },
            }),
          }),
        }
      }

      throw new Error(`Unexpected delete service table ${table}`)
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          spies.storageRemove(paths)
          return { error: null }
        },
      }),
    },
  }
}

describe('GET /api/ai/statement/[importId]', () => {
  beforeEach(() => {
    mockedCreateServerSupabaseClient.mockReset()
    mockedCreateServiceSupabaseClient.mockReset()
    mockedResolveEffectivePaymentGroups.mockReset()
    mockedListTags.mockReset()
    mockedCreateServerSupabaseClient.mockResolvedValue(createSupabaseMock() as never)
    mockedCreateServiceSupabaseClient.mockReturnValue(createServiceSupabaseMock() as never)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  it('returns review data when optional tags and category groups are unavailable', async () => {
    mockedListTags.mockRejectedValueOnce(new Error('relation "public.tags" does not exist'))
    mockedResolveEffectivePaymentGroups.mockRejectedValueOnce(
      new Error('relation "public.payment_category_groups" does not exist'),
    )

    const response = await GET(
      new NextRequest('http://localhost/api/ai/statement/import-1'),
      { params: Promise.resolve({ importId: 'import-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.tags).toEqual([])
    expect(payload.categories).toEqual([
      expect.objectContaining({
        id: 1,
        name: 'Groceries',
        type: 'expense',
        group_name: 'Food & Dining',
        effective_group_id: null,
        effective_group_name: 'Food & Dining',
        effective_group_sort_order: null,
      }),
    ])
    expect(payload.rows).toEqual([
      expect.objectContaining({
        id: 'row-1',
        tagIds: [],
        tagSuggestions: [],
      }),
    ])
    expect(payload.import.uploadedBy).toEqual({
      id: 'user-1',
      displayName: 'Alex Example',
      email: 'alex@example.com',
    })
    expect(payload.import).toEqual(expect.objectContaining({
      institutionName: 'Citibank Singapore Ltd',
      parsedAccountType: 'loan',
      parsedProductName: 'CITIBANK READY CREDIT',
      matchedAccountLabel: 'Citibank Singapore Ltd — Citi Ready Credit',
      sourceFileHref: '/api/ai/statement/import-1/file',
    }))
    expect(payload.accounts).toEqual([
      expect.objectContaining({
        id: 'acct-1',
        label: 'Citibank Singapore Ltd — Ready Credit',
        accountType: 'loan',
      }),
    ])
  })

  it('returns review data when links, committed import metadata, and uploader enrichment are unavailable', async () => {
    mockedCreateServerSupabaseClient.mockResolvedValueOnce(createSupabaseMock({
      statementImportsErrorMessage: 'column statement_imports.file_import_id does not exist',
      linksErrorMessage: 'relation "public.staging_transaction_links" does not exist',
      includeStoredFile: false,
    }) as never)
    mockedCreateServiceSupabaseClient.mockReturnValue(createServiceSupabaseMock({
      uploaderEmailErrorMessage: 'permission denied for auth.admin',
    }) as never)

    const response = await GET(
      new NextRequest('http://localhost/api/ai/statement/import-1'),
      { params: Promise.resolve({ importId: 'import-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.import.hasCommittedVersion).toBe(false)
    expect(payload.rows).toEqual([
      expect.objectContaining({
        id: 'row-1',
        links: [],
      }),
    ])
    expect(payload.import.uploadedBy).toEqual({
      id: 'user-1',
      displayName: 'Alex Example',
      email: null,
    })
    expect(payload.import.sourceFileHref).toBeNull()

    const warnMessages = vi.mocked(console.warn).mock.calls.flat().map((value) => String(value))
    expect(warnMessages.some((message) => message.includes('Statement review links unavailable'))).toBe(false)
    expect(warnMessages.some((message) => message.includes('Statement review committed import metadata unavailable'))).toBe(true)
    expect(warnMessages.some((message) => message.includes('Statement review uploader metadata unavailable'))).toBe(true)
  })
})

describe('DELETE /api/ai/statement/[importId]', () => {
  beforeEach(() => {
    mockedCreateServerSupabaseClient.mockReset()
    mockedCreateServiceSupabaseClient.mockReset()
  })

  it('cleanly deletes the import, committed transactions, and orphaned upload', async () => {
    mockedCreateServerSupabaseClient.mockResolvedValue(createDeleteServerSupabaseMock() as never)
    mockedCreateServiceSupabaseClient.mockReturnValue(createDeleteServiceSupabaseMock() as never)

    const response = await DELETE(
      new NextRequest('http://localhost/api/ai/statement/import-1', { method: 'DELETE' }),
      { params: Promise.resolve({ importId: 'import-1' }) },
    )
    const payload = await response.json()
    const serviceSupabase = mockedCreateServiceSupabaseClient.mock.results[0]?.value as ReturnType<typeof createDeleteServiceSupabaseMock>

    expect(response.status).toBe(200)
    expect(serviceSupabase.__spies.fileImportsDelete).toHaveBeenCalled()
    expect(serviceSupabase.__spies.statementImportsDelete).toHaveBeenCalledWith(['stmt-1'])
    expect(serviceSupabase.__spies.statementTransactionsDelete).toHaveBeenCalledWith(['txn-1'])
    expect(serviceSupabase.__spies.mappingsDelete).toHaveBeenCalledWith(['txn-1'])
    expect(serviceSupabase.__spies.transactionLinksDelete).toHaveBeenCalledTimes(2)
    expect(serviceSupabase.__spies.statementUploadsDelete).toHaveBeenCalled()
    expect(serviceSupabase.__spies.storageRemove).toHaveBeenCalledWith([
      'households/hh-1/statements/upload-1/statement.pdf',
    ])
    expect(payload).toEqual({
      deleted: true,
      importId: 'import-1',
      fileName: 'statement.pdf',
      removedStatementUpload: true,
      removedStoredFile: true,
    })
  })
})
