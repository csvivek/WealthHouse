import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { refreshLinkSuggestionsForImport } from '@/lib/statement-linking'
import { processStatementReroute } from '@/lib/server/statement-reroute'

vi.mock('@/lib/knowledge/merchant-intelligence', () => ({
  resolveMerchantCategory: vi.fn(),
}))

vi.mock('@/lib/tags/suggestions', () => ({
  suggestTags: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/statement-linking', () => ({
  refreshLinkSuggestionsForImport: vi.fn(),
}))

const mockedCreateServiceSupabaseClient = vi.mocked(createServiceSupabaseClient)
const mockedRefreshLinkSuggestionsForImport = vi.mocked(refreshLinkSuggestionsForImport)

type Row = Record<string, unknown>

class SelectBuilder<T extends Row> {
  private rows: T[]

  constructor(rows: T[]) {
    this.rows = [...rows]
  }

  eq(column: string, value: unknown) {
    this.rows = this.rows.filter((row) => row[column] === value)
    return this
  }

  in(column: string, values: unknown[]) {
    const allowed = new Set(values)
    this.rows = this.rows.filter((row) => allowed.has(row[column]))
    return this
  }

  order(column: string, options?: { ascending?: boolean }) {
    const ascending = options?.ascending !== false
    this.rows.sort((left, right) => {
      const leftValue = String(left[column] ?? '')
      const rightValue = String(right[column] ?? '')
      return leftValue.localeCompare(rightValue) * (ascending ? 1 : -1)
    })
    return this
  }

  single() {
    return Promise.resolve({
      data: this.rows[0] ?? null,
      error: this.rows[0] ? null : { message: 'Row not found' },
    })
  }

  then<TResult1 = { data: T[]; error: null }>(
    onfulfilled?: ((value: { data: T[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => PromiseLike<never>) | null,
  ) {
    const payload = { data: this.rows, error: null as null }
    return Promise.resolve(payload).then(onfulfilled, onrejected)
  }
}

function createDb() {
  const tables: Record<string, Row[]> = {
    file_imports: [{
      id: 'import-1',
      household_id: 'hh-1',
      status: 'in_review',
      raw_parse_result: {
        institution_name: 'Citibank',
        institution_code: 'unknown',
        account: {
          account_type: 'credit_card',
          product_name: 'CITIBANK READY CREDIT',
          card_name: 'CITIBANK READY CREDIT',
        },
      },
      card_info_json: {
        statementAccount: {
          account_type: 'credit_card',
        },
      },
      institution_id: 'inst-old',
      institution_code: 'unknown',
      account_id: 'acct-old',
      duplicate_rows: 0,
    }],
    import_staging: [{
      id: 'row-1',
      file_import_id: 'import-1',
      account_id: 'acct-old',
      row_index: 0,
      txn_date: '2026-02-11',
      posting_date: null,
      amount: 1825.21,
      currency: 'SGD',
      merchant_raw: 'PAYLITE',
      reference: null,
      original_data: {
        matchedAccountId: 'acct-old',
        matchedAccountName: 'Citibank Singapore Ltd — Citi Rewards Card',
      },
    }],
    accounts: [{
      id: 'acct-new',
      household_id: 'hh-1',
      institution_id: 'inst-citi',
      product_name: 'CITIBANK READY CREDIT',
      nickname: 'Ready Credit',
      identifier_hint: '1-905379-255',
      account_type: 'loan',
      is_active: true,
      institutions: { name: 'Citibank Singapore Ltd' },
      cards: [],
    }],
    statement_transactions: [],
    approval_log: [],
  }

  return {
    tables,
    from(table: string) {
      if (!(table in tables)) {
        throw new Error(`Unexpected table ${table}`)
      }

      return {
        select: () => new SelectBuilder(tables[table]),
        update: (patch: Row) => ({
          eq: async (column: string, value: unknown) => {
            for (const row of tables[table]) {
              if (row[column] === value) {
                Object.assign(row, patch)
              }
            }
            return { error: null }
          },
        }),
        insert: async (payload: Row | Row[]) => {
          const rows = Array.isArray(payload) ? payload : [payload]
          tables[table].push(...rows)
          return { error: null }
        },
      }
    },
  }
}

describe('processStatementReroute', () => {
  beforeEach(() => {
    mockedCreateServiceSupabaseClient.mockReset()
    mockedRefreshLinkSuggestionsForImport.mockReset()
    mockedRefreshLinkSuggestionsForImport.mockResolvedValue(undefined)
  })

  it('reroutes staged rows and updates stored parse metadata for replacement recommit', async () => {
    const db = createDb()
    mockedCreateServiceSupabaseClient.mockReturnValue(db as never)

    const result = await processStatementReroute({
      importId: 'import-1',
      householdId: 'hh-1',
      userId: 'user-1',
      input: {
        targetAccountId: 'acct-new',
      },
    })

    expect(result).toEqual(expect.objectContaining({
      importId: 'import-1',
      accountId: 'acct-new',
      accountType: 'loan',
    }))

    expect(db.tables.import_staging[0]).toEqual(expect.objectContaining({
      account_id: 'acct-new',
      duplicate_status: 'none',
      original_data: expect.objectContaining({
        matchedAccountId: 'acct-new',
        matchedAccountName: 'Citibank Singapore Ltd — Ready Credit',
      }),
    }))

    expect(db.tables.file_imports[0]).toEqual(expect.objectContaining({
      account_id: 'acct-new',
      institution_id: 'inst-citi',
      institution_code: 'citibank',
      raw_parse_result: expect.objectContaining({
        institution_name: 'Citibank Singapore Ltd',
        institution_code: 'citibank',
        import_label: 'Citibank Singapore Ltd — Ready Credit',
        account: expect.objectContaining({
          account_type: 'loan',
        }),
      }),
      card_info_json: expect.objectContaining({
        statementAccount: expect.objectContaining({
          account_type: 'loan',
        }),
      }),
    }))

    expect(mockedRefreshLinkSuggestionsForImport).toHaveBeenCalledWith(expect.objectContaining({
      fileImportId: 'import-1',
      householdId: 'hh-1',
      actorUserId: 'user-1',
    }))
  })
})
