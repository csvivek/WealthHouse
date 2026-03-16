// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/statements/overview/route'
import { createServerSupabaseClient } from '@/lib/supabase/server'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient)

describe('GET /api/statements/overview', () => {
  beforeEach(() => {
    const statusValues: string[][] = []
    const reviewStatusFilters: Array<[string, string]> = []

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

        if (table === 'file_imports') {
          return {
            select: () => ({
              eq: () => ({
                in: (_column: string, values: string[]) => {
                  statusValues.push(values)
                  return {
                    order: () => ({
                      limit: async () => ({
                        data: [{
                          id: 'import-1',
                          file_name: 'statement.pdf',
                          status: 'committed',
                          institution_code: 'citibank',
                          statement_date: '2026-02-28',
                          statement_period_start: '2026-02-01',
                          statement_period_end: '2026-02-28',
                          currency: 'SGD',
                          raw_parse_result: {
                            institution_name: 'Citibank Singapore Ltd',
                            import_label: 'Ready Credit',
                            account: { account_type: 'loan', product_name: 'Ready Credit' },
                          },
                          summary_json: { closing_balance: 1825.21 },
                          card_info_json: null,
                          total_rows: 6,
                          duplicate_rows: 0,
                          storage_bucket: 'statements',
                          storage_path: 'households/hh-1/statements/file-1/statement.pdf',
                          created_at: '2026-03-01T00:00:00.000Z',
                        }],
                        error: null,
                      }),
                    }),
                  }
                },
              }),
            }),
          }
        }

        if (table === 'import_staging') {
          return {
            select: () => ({
              in: () => ({
                neq: async (column: string, value: string) => {
                  reviewStatusFilters.push([column, value])
                  return {
                    data: Array.from({ length: 6 }).map((_, index) => ({
                      id: `row-${index + 1}`,
                      file_import_id: 'import-1',
                      row_index: index + 1,
                      review_status: 'committed',
                      txn_date: `2026-02-${String(20 - index).padStart(2, '0')}`,
                      merchant_raw: `Merchant ${index + 1}`,
                      description: `Merchant ${index + 1}`,
                      amount: 10 + index,
                      txn_type: 'debit',
                      currency: 'SGD',
                      original_data: {},
                    })),
                    error: null,
                  }
                },
              }),
            }),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      },
      __assertions: { statusValues, reviewStatusFilters },
    } as never)
  })

  it('loads committed and in-review imports and caps previews', async () => {
    const response = await GET()
    const payload = await response.json()
    const supabase = mockedCreateServerSupabaseClient.mock.results[0]?.value as unknown as {
      __assertions: {
        statusValues: string[][]
        reviewStatusFilters: Array<[string, string]>
      }
    }

    expect(response.status).toBe(200)
    expect(supabase.__assertions.statusValues).toEqual([['committed', 'in_review']])
    expect(supabase.__assertions.reviewStatusFilters).toEqual([['review_status', 'rejected']])
    expect(payload.cards).toHaveLength(1)
    expect(payload.cards[0].transactions).toHaveLength(5)
    expect(payload.cards[0]).toMatchObject({
      bankLabel: 'Citi',
      canonicalType: 'Credit Line',
      downloadAvailable: true,
    })
  })

  it('falls back when statement storage columns are not deployed yet', async () => {
    let fileImportsSelectCount = 0

    mockedCreateServerSupabaseClient.mockReturnValueOnce({
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

        if (table === 'file_imports') {
          return {
            select: () => ({
              eq: () => ({
                in: () => ({
                  order: () => ({
                    limit: async () => {
                      fileImportsSelectCount += 1
                      if (fileImportsSelectCount === 1) {
                        return {
                          data: null,
                          error: { message: 'column file_imports.storage_bucket does not exist' },
                        }
                      }

                      return {
                        data: [{
                          id: 'import-legacy-1',
                          file_name: 'legacy-statement.pdf',
                          status: 'committed',
                          institution_code: 'dbs',
                          statement_date: '2026-02-28',
                          statement_period_start: '2026-02-01',
                          statement_period_end: '2026-02-28',
                          currency: 'SGD',
                          raw_parse_result: {
                            institution_name: 'DBS Bank Ltd',
                            account: { account_type: 'credit_card', product_name: 'Altitude Card' },
                          },
                          summary_json: { grand_total: 120.5 },
                          card_info_json: null,
                          total_rows: 2,
                          duplicate_rows: 0,
                          created_at: '2026-03-01T00:00:00.000Z',
                        }],
                        error: null,
                      }
                    },
                  }),
                }),
              }),
            }),
          }
        }

        if (table === 'import_staging') {
          return {
            select: () => ({
              in: () => ({
                neq: async () => ({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      },
    } as never)

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(fileImportsSelectCount).toBe(2)
    expect(payload.cards).toHaveLength(1)
    expect(payload.cards[0]).toMatchObject({
      bankLabel: 'DBS',
      downloadAvailable: false,
      downloadUrl: null,
      downloadUnavailableReason: 'Original file unavailable for legacy imports.',
    })
  })
})
