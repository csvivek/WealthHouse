// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

interface StoredMerchantKbRow {
  household_id: string
  normalized_merchant_name: string
  canonical_merchant_name: string
  family_name: string
  aliases: string[]
  business_type: string | null
  approved_category_id: number | null
  approved_category_name: string
  confidence: number
  decision_source: string
  usage_count: number
  first_seen_date: string
  last_reviewed_date: string
  notes: string | null
}

function createMissingTableError() {
  return {
    message: "Could not find the table 'public.statement_merchant_kb' in the schema cache",
  }
}

function createMockSupabase(options?: {
  rows?: StoredMerchantKbRow[]
  missingTable?: boolean
}) {
  const rows = [...(options?.rows ?? [])]
  const insertCalls: StoredMerchantKbRow[][] = []
  const upsertCalls: StoredMerchantKbRow[][] = []

  return {
    rows,
    insertCalls,
    upsertCalls,
    from(table: string) {
      if (table !== 'statement_merchant_kb') {
        throw new Error(`Unexpected table: ${table}`)
      }

      return {
        select() {
          return {
            eq(column: string, value: unknown) {
              if (options?.missingTable) {
                return Promise.resolve({ data: null, error: createMissingTableError() })
              }

              return Promise.resolve({
                data: rows
                  .filter((row) => (row as unknown as Record<string, unknown>)[column] === value)
                  .map((row) => ({ ...row })),
                error: null,
              })
            },
          }
        },
        insert(payload: StoredMerchantKbRow[] | StoredMerchantKbRow) {
          if (options?.missingTable) {
            return Promise.resolve({ error: createMissingTableError() })
          }

          const items = (Array.isArray(payload) ? payload : [payload]).map((item) => ({ ...item }))
          insertCalls.push(items)

          for (const item of items) {
            const exists = rows.some((row) => (
              row.household_id === item.household_id
              && row.normalized_merchant_name === item.normalized_merchant_name
            ))

            if (!exists) {
              rows.push(item)
            }
          }

          return Promise.resolve({ error: null })
        },
        upsert(payload: StoredMerchantKbRow[] | StoredMerchantKbRow) {
          if (options?.missingTable) {
            return Promise.resolve({ error: createMissingTableError() })
          }

          const items = (Array.isArray(payload) ? payload : [payload]).map((item) => ({ ...item }))
          upsertCalls.push(items)

          for (const item of items) {
            const existingIndex = rows.findIndex((row) => (
              row.household_id === item.household_id
              && row.normalized_merchant_name === item.normalized_merchant_name
            ))

            if (existingIndex >= 0) {
              rows[existingIndex] = item
            } else {
              rows.push(item)
            }
          }

          return Promise.resolve({ error: null })
        },
      }
    },
  }
}

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('statement merchant knowledge', () => {
  it('seeds bundled merchant knowledge into Supabase on first lookup', async () => {
    const supabase = createMockSupabase()
    const mod = await import('./merchant-categories')

    const match = await mod.findMerchantKnowledgeMatch(supabase as never, 'household-1', 'bus mrt', null)

    expect(match).toMatchObject({
      matchedBy: 'exact',
      record: {
        normalized_merchant_name: 'bus mrt',
        approved_category_name: 'Public Transport',
      },
    })
    expect(supabase.insertCalls[0]?.length).toBeGreaterThan(0)
    expect(
      supabase.rows.some((row) => row.household_id === 'household-1' && row.normalized_merchant_name === 'bus mrt'),
    ).toBe(true)
  })

  it('writes merchant category overrides into Supabase', async () => {
    const supabase = createMockSupabase()
    const mod = await import('./merchant-categories')

    const record = await mod.rememberMerchantCategory(supabase as never, 'household-1', {
      merchant: 'Transfer OTHR REF YPF3-22112',
      categoryId: 41,
      categoryName: 'Internal Transfer',
      canonicalMerchantName: 'Transfer OTHR REF YPF3-22112',
    })

    expect(record).toMatchObject({
      normalized_merchant_name: 'transfer othr ref ypf3',
      approved_category_id: 41,
      approved_category_name: 'Internal Transfer',
    })
    expect(supabase.upsertCalls.at(-1)?.[0]).toMatchObject({
      household_id: 'household-1',
      approved_category_id: 41,
      approved_category_name: 'Internal Transfer',
    })
  })

  it('backfills missing category ids in Supabase rows', async () => {
    const now = new Date().toISOString()
    const supabase = createMockSupabase({
      rows: [
        {
          household_id: 'household-2',
          normalized_merchant_name: 'local market',
          canonical_merchant_name: 'Local Market',
          family_name: 'local market',
          aliases: [],
          business_type: null,
          approved_category_id: null,
          approved_category_name: 'Groceries',
          confidence: 1,
          decision_source: 'manual_override',
          usage_count: 1,
          first_seen_date: now,
          last_reviewed_date: now,
          notes: null,
        },
      ],
    })
    const mod = await import('./merchant-categories')

    const result = await mod.backfillMerchantKnowledgeCategoryIds(
      supabase as never,
      'household-2',
      [{ id: 1, name: 'Groceries' }],
    )

    expect(result).toMatchObject({ updated: 1, totalMissing: 1 })
    expect(
      supabase.rows.find((row) => row.household_id === 'household-2' && row.normalized_merchant_name === 'local market'),
    ).toMatchObject({
      approved_category_id: 1,
      approved_category_name: 'Groceries',
    })
  })

  it('falls back to bundled merchant knowledge when the Supabase table is unavailable', async () => {
    const supabase = createMockSupabase({ missingTable: true })
    const mod = await import('./merchant-categories')

    const match = await mod.findMerchantKnowledgeMatch(supabase as never, 'household-1', 'bus mrt', null)

    expect(match).toMatchObject({
      matchedBy: 'exact',
      record: {
        normalized_merchant_name: 'bus mrt',
        approved_category_name: 'Public Transport',
      },
    })
  })
})
