// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/ai/statement/[importId]/route'
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
}) {
  const fileImport = {
    id: 'import-1',
    uploaded_by: 'user-1',
    status: 'in_review',
    file_name: 'statement.pdf',
    institution_code: 'amex',
    statement_date: '2026-02-28',
    statement_period_start: '2026-02-01',
    statement_period_end: '2026-02-28',
    summary_json: null,
    card_info_json: null,
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
  })

  it('returns review data when links, committed import metadata, and uploader enrichment are unavailable', async () => {
    mockedCreateServerSupabaseClient.mockResolvedValueOnce(createSupabaseMock({
      statementImportsErrorMessage: 'column statement_imports.file_import_id does not exist',
      linksErrorMessage: 'relation "public.staging_transaction_links" does not exist',
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

    const warnMessages = vi.mocked(console.warn).mock.calls.flat().map((value) => String(value))
    expect(warnMessages.some((message) => message.includes('Statement review links unavailable'))).toBe(false)
    expect(warnMessages.some((message) => message.includes('Statement review committed import metadata unavailable'))).toBe(true)
    expect(warnMessages.some((message) => message.includes('Statement review uploader metadata unavailable'))).toBe(true)
  })
})
