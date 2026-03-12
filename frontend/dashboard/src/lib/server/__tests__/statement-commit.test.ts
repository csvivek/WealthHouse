// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { logAudit } from '@/lib/integrity/audit'
import { resolveMerchantReference } from '@/lib/server/merchant-service'
import { processStatementCommit } from '@/lib/server/statement-commit'
import { createServiceSupabaseClient } from '@/lib/supabase/service'

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/server/merchant-service', () => ({
  resolveMerchantReference: vi.fn(),
}))

vi.mock('@/lib/integrity/audit', () => ({
  logAudit: vi.fn(),
}))

const mockedCreateServiceSupabaseClient = vi.mocked(createServiceSupabaseClient)
const mockedResolveMerchantReference = vi.mocked(resolveMerchantReference)
const mockedLogAudit = vi.mocked(logAudit)

type Row = Record<string, unknown>

class SelectBuilder<T extends Row> {
  private rows: T[]
  private includeCount: boolean
  private error: { message: string; code?: string | null } | null

  constructor(rows: T[], includeCount = false, error: { message: string; code?: string | null } | null = null) {
    this.rows = [...rows]
    this.includeCount = includeCount
    this.error = error
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
    if (this.error) {
      return Promise.resolve({
        data: null,
        error: this.error,
      })
    }

    return Promise.resolve({
      data: this.rows[0] ?? null,
      error: this.rows[0] ? null : { message: 'Row not found' },
    })
  }

  maybeSingle() {
    if (this.error) {
      return Promise.resolve({
        data: null,
        error: this.error,
      })
    }

    return Promise.resolve({
      data: this.rows[0] ?? null,
      error: null,
    })
  }

  then<TResult1 = { data: T[]; count: number | null; error: { message: string; code?: string | null } | null }>(
    onfulfilled?: ((value: { data: T[]; count: number | null; error: { message: string; code?: string | null } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => PromiseLike<never>) | null,
  ) {
    const payload = {
      data: this.error ? [] : this.rows,
      count: this.error ? 0 : this.includeCount ? this.rows.length : null,
      error: this.error,
    }
    return Promise.resolve(payload as { data: T[]; count: number | null; error: { message: string; code?: string | null } | null }).then(onfulfilled, onrejected)
  }
}

class InsertBuilder<T extends Row> {
  private rows: T[]

  constructor(rows: T[]) {
    this.rows = rows
  }

  select() {
    return new SelectBuilder(this.rows)
  }

  then<TResult1 = { data: T[]; error: null }>(
    onfulfilled?: ((value: { data: T[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => PromiseLike<never>) | null,
  ) {
    const payload = { data: this.rows, error: null as null }
    return Promise.resolve(payload as { data: T[]; error: null }).then(onfulfilled, onrejected)
  }
}

function createMutableDb(params?: {
  fileImport?: Partial<Row>
  approvedRows?: Row[]
  existingStatementImports?: Row[]
  stagingLinks?: Row[]
  stagingLinksSelectError?: { message: string; code?: string | null }
  transactionLinksUpsertError?: { message: string; code?: string | null }
}) {
  const fileImports = [{
    id: 'import-1',
    household_id: 'hh-1',
    status: 'in_review',
    rejected_rows: 0,
    institution_id: 'inst-1',
    institution_code: 'dbs_cc',
    file_name: 'statement.pdf',
    parse_confidence: 0.92,
    statement_date: '2026-02-18',
    statement_period_start: '2026-01-19',
    statement_period_end: '2026-02-18',
    summary_json: {
      credit_limit: 3000,
      minimum_payment: 50,
      payment_due_date: '2026-02-20',
      grand_total: 69.04,
    },
    card_info_json: {
      card_last4: '1234',
    },
    committed_statement_import_id: null,
    committed_at: null,
    committed_rows: 0,
    updated_at: '2026-03-12T00:00:00.000Z',
    ...params?.fileImport,
  }]

  const importStaging = params?.approvedRows ?? [{
    id: 'row-1',
    file_import_id: 'import-1',
    household_id: 'hh-1',
    account_id: 'acct-1',
    row_index: 1,
    review_status: 'approved',
    duplicate_status: 'none',
    duplicate_transaction_id: null,
    txn_hash: 'txn-hash-1',
    source_txn_hash: 'src-hash-1',
    txn_date: '2026-02-10',
    posting_date: '2026-02-11',
    merchant_raw: 'ACME Store',
    description: 'Monthly spend',
    reference: 'REF-1',
    amount: 69.04,
    txn_type: 'debit',
    currency: 'SGD',
    original_amount: null,
    original_currency: null,
    confidence: 0.98,
    original_data: {
      matchedAccountName: 'My Card',
      tagIds: [],
    },
    is_edited: false,
    review_note: null,
    last_reviewed_by: null,
    last_reviewed_at: null,
    committed_transaction_id: null,
    created_at: '2026-03-12T00:00:00.000Z',
    updated_at: '2026-03-12T00:00:00.000Z',
  }]

  const tables: Record<string, Row[]> = {
    file_imports: fileImports,
    statement_imports: [...(params?.existingStatementImports ?? [])],
    import_staging: [...importStaging],
    statement_transactions: [],
    statement_transaction_tags: [],
    statement_summaries: [],
    staging_transaction_links: [...(params?.stagingLinks ?? [])],
    transaction_links: [],
    approval_log: [],
  }

  function insertRows(table: string, payload: Row | Row[]) {
    const rows = Array.isArray(payload) ? payload : [payload]
    const inserted = rows.map((row, index) => ({
      ...row,
      id: (row.id as string | undefined) ?? `${table}-${tables[table].length + index + 1}`,
    }))
    tables[table].push(...inserted)
    return inserted
  }

  function updateRows(table: string, patch: Row, predicate: (row: Row) => boolean) {
    for (const row of tables[table]) {
      if (predicate(row)) {
        Object.assign(row, patch)
      }
    }
    return { error: null }
  }

  function deleteRows(table: string, predicate: (row: Row) => boolean) {
    tables[table] = tables[table].filter((row) => !predicate(row))
    return { error: null }
  }

  const db = {
    from(table: string) {
      if (!(table in tables)) {
        throw new Error(`Unexpected table ${table}`)
      }

      return {
        select: (_columns?: string, options?: { count?: 'exact' }) => new SelectBuilder(
          tables[table],
          options?.count === 'exact',
          table === 'staging_transaction_links' ? params?.stagingLinksSelectError ?? null : null,
        ),
        insert: (payload: Row | Row[]) => new InsertBuilder(insertRows(table, payload)),
        upsert: async (payload: Row | Row[]) => {
          if (table === 'transaction_links' && params?.transactionLinksUpsertError) {
            return { error: params.transactionLinksUpsertError }
          }
          insertRows(table, payload)
          return { error: null }
        },
        update: (patch: Row) => ({
          eq: async (column: string, value: unknown) => updateRows(table, patch, (row) => row[column] === value),
          in: async (column: string, values: unknown[]) => {
            const allowed = new Set(values)
            return updateRows(table, patch, (row) => allowed.has(row[column]))
          },
        }),
        delete: () => ({
          in: async (column: string, values: unknown[]) => {
            const allowed = new Set(values)
            return deleteRows(table, (row) => allowed.has(row[column]))
          },
        }),
      }
    },
  }

  return { db, tables }
}

describe('processStatementCommit summary handling', () => {
  beforeEach(() => {
    mockedCreateServiceSupabaseClient.mockReset()
    mockedResolveMerchantReference.mockReset()
    mockedLogAudit.mockReset()
    mockedResolveMerchantReference.mockResolvedValue(null)
    mockedLogAudit.mockResolvedValue(undefined)
  })

  it('falls back to statement_period_end when statement_date is missing', async () => {
    const context = createMutableDb({
      fileImport: {
        statement_date: null,
        statement_period_end: '2026-02-18',
        summary_json: {
          payment_due_date: '2026-02-20',
          minimum_payment: 50,
          grand_total: 69.04,
        },
      },
    })
    mockedCreateServiceSupabaseClient.mockReturnValue(context.db as never)

    const result = await processStatementCommit({ importId: 'import-1', householdId: 'hh-1', userId: 'user-1' })

    expect(result.warnings).toEqual([])
    expect(context.tables.statement_summaries).toHaveLength(1)
    expect(context.tables.statement_summaries[0]).toMatchObject({
      statement_date: '2026-02-18',
      payment_due_date: '2026-02-20',
    })
  })

  it('skips the summary when no reliable statement date is available and still commits transactions', async () => {
    const context = createMutableDb({
      fileImport: {
        statement_date: null,
        statement_period_start: null,
        statement_period_end: null,
      },
    })
    mockedCreateServiceSupabaseClient.mockReturnValue(context.db as never)

    const result = await processStatementCommit({ importId: 'import-1', householdId: 'hh-1', userId: 'user-1' })

    expect(result.status).toBe('committed')
    expect(result.committedCount).toBe(1)
    expect(result.warnings).toEqual([
      'Statement committed, but statement summary was skipped because no valid statement date was available.',
    ])
    expect(context.tables.statement_summaries).toHaveLength(0)
  })

  it('nulls payment due date when it is earlier than the statement date and returns a warning', async () => {
    const context = createMutableDb({
      fileImport: {
        statement_date: '2026-03-12',
        statement_period_end: null,
        summary_json: {
          payment_due_date: '2026-02-20',
          minimum_payment: 50,
          grand_total: 69.04,
        },
      },
    })
    mockedCreateServiceSupabaseClient.mockReturnValue(context.db as never)

    const result = await processStatementCommit({ importId: 'import-1', householdId: 'hh-1', userId: 'user-1' })

    expect(result.warnings).toEqual([
      'Statement committed, but payment due date was skipped because it was earlier than or equal to the statement date.',
    ])
    expect(context.tables.statement_summaries[0]).toMatchObject({
      statement_date: '2026-03-12',
      payment_due_date: null,
    })
  })

  it('ignores invalid payment due dates and returns a warning', async () => {
    const context = createMutableDb({
      fileImport: {
        summary_json: {
          payment_due_date: 'invalid date',
          minimum_payment: 50,
          grand_total: 69.04,
        },
      },
    })
    mockedCreateServiceSupabaseClient.mockReturnValue(context.db as never)

    const result = await processStatementCommit({ importId: 'import-1', householdId: 'hh-1', userId: 'user-1' })

    expect(result.warnings).toEqual([
      'Statement committed, but payment due date was skipped because it was invalid.',
    ])
    expect(context.tables.statement_summaries[0]).toMatchObject({
      statement_date: '2026-02-18',
      payment_due_date: null,
    })
  })

  it('keeps valid statement summary fields unchanged', async () => {
    const context = createMutableDb()
    mockedCreateServiceSupabaseClient.mockReturnValue(context.db as never)

    const result = await processStatementCommit({ importId: 'import-1', householdId: 'hh-1', userId: 'user-1' })

    expect(result.warnings).toEqual([])
    expect(context.tables.statement_summaries[0]).toMatchObject({
      credit_limit: 3000,
      minimum_payment: 50,
      grand_total: 69.04,
      statement_date: '2026-02-18',
      payment_due_date: '2026-02-20',
    })
  })

  it('commits successfully when staging transaction links schema is unavailable', async () => {
    const context = createMutableDb({
      stagingLinksSelectError: {
        code: 'PGRST205',
        message: "Could not find the table 'public.staging_transaction_links' in the schema cache",
      },
    })
    mockedCreateServiceSupabaseClient.mockReturnValue(context.db as never)

    const result = await processStatementCommit({ importId: 'import-1', householdId: 'hh-1', userId: 'user-1' })

    expect(result.status).toBe('committed')
    expect(result.committedCount).toBe(1)
    expect(result.warnings).toContain(
      'Statement committed, but transaction links were skipped because staging link support is not deployed in this Supabase environment.',
    )
    expect(context.tables.transaction_links).toHaveLength(0)
    expect(context.tables.file_imports[0]).toMatchObject({
      status: 'committed',
      committed_rows: 1,
    })
  })

  it('surfaces the underlying approved staging link query error', async () => {
    const context = createMutableDb({
      stagingLinksSelectError: {
        code: '42501',
        message: 'permission denied for table staging_transaction_links',
      },
    })
    mockedCreateServiceSupabaseClient.mockReturnValue(context.db as never)

    await expect(
      processStatementCommit({ importId: 'import-1', householdId: 'hh-1', userId: 'user-1' }),
    ).rejects.toThrow('Failed to load approved staging links: permission denied for table staging_transaction_links [42501]')
  })

  it('commits successfully when staging transaction link columns are unavailable', async () => {
    const context = createMutableDb({
      stagingLinksSelectError: {
        message: "Could not find the 'status' column of 'staging_transaction_links' in the schema cache",
      },
    })
    mockedCreateServiceSupabaseClient.mockReturnValue(context.db as never)

    const result = await processStatementCommit({ importId: 'import-1', householdId: 'hh-1', userId: 'user-1' })

    expect(result.status).toBe('committed')
    expect(result.committedCount).toBe(1)
    expect(result.warnings).toContain(
      'Statement committed, but transaction links were skipped because staging link support is not deployed in this Supabase environment.',
    )
    expect(context.tables.transaction_links).toHaveLength(0)
  })

  it('commits successfully when transaction link persistence schema is unavailable', async () => {
    const context = createMutableDb({
      approvedRows: [
        {
          id: 'row-1',
          file_import_id: 'import-1',
          household_id: 'hh-1',
          account_id: 'acct-1',
          row_index: 1,
          review_status: 'approved',
          duplicate_status: 'none',
          duplicate_transaction_id: null,
          txn_hash: 'txn-hash-1',
          source_txn_hash: 'src-hash-1',
          txn_date: '2026-02-10',
          posting_date: '2026-02-11',
          merchant_raw: 'ACME Store',
          description: 'Monthly spend',
          reference: 'REF-1',
          amount: 69.04,
          txn_type: 'debit',
          currency: 'SGD',
          original_amount: null,
          original_currency: null,
          confidence: 0.98,
          original_data: {
            matchedAccountName: 'My Card',
            tagIds: [],
          },
          is_edited: false,
          review_note: null,
          last_reviewed_by: null,
          last_reviewed_at: null,
          committed_transaction_id: null,
          created_at: '2026-03-12T00:00:00.000Z',
          updated_at: '2026-03-12T00:00:00.000Z',
        },
        {
          id: 'row-2',
          file_import_id: 'import-1',
          household_id: 'hh-1',
          account_id: 'acct-1',
          row_index: 2,
          review_status: 'approved',
          duplicate_status: 'none',
          duplicate_transaction_id: null,
          txn_hash: 'txn-hash-2',
          source_txn_hash: 'src-hash-2',
          txn_date: '2026-02-10',
          posting_date: '2026-02-11',
          merchant_raw: 'ACME Payment',
          description: 'Payment received',
          reference: 'REF-2',
          amount: -69.04,
          txn_type: 'credit',
          currency: 'SGD',
          original_amount: null,
          original_currency: null,
          confidence: 0.98,
          original_data: {
            matchedAccountName: 'My Card',
            tagIds: [],
          },
          is_edited: false,
          review_note: null,
          last_reviewed_by: null,
          last_reviewed_at: null,
          committed_transaction_id: null,
          created_at: '2026-03-12T00:00:00.000Z',
          updated_at: '2026-03-12T00:00:00.000Z',
        },
      ],
      stagingLinks: [
        {
          id: 'link-1',
          file_import_id: 'import-1',
          household_id: 'hh-1',
          from_staging_id: 'row-1',
          to_staging_id: 'row-2',
          to_transaction_id: null,
          link_type: 'credit_card_payment',
          link_score: 0.99,
          link_reason: { rule: 'test' },
          status: 'approved',
          matched_by: 'system',
          matched_by_user_id: null,
          reviewed_by: null,
          reviewed_at: null,
          created_at: '2026-03-12T00:00:00.000Z',
          updated_at: '2026-03-12T00:00:00.000Z',
        },
      ],
      transactionLinksUpsertError: {
        message: 'column transaction_links.matched_by does not exist',
      },
    })
    mockedCreateServiceSupabaseClient.mockReturnValue(context.db as never)

    const result = await processStatementCommit({ importId: 'import-1', householdId: 'hh-1', userId: 'user-1' })

    expect(result.status).toBe('committed')
    expect(result.committedCount).toBe(2)
    expect(result.warnings).toContain(
      'Statement committed, but transaction links were skipped because staging link support is not deployed in this Supabase environment.',
    )
    expect(context.tables.transaction_links).toHaveLength(0)
    expect(context.tables.file_imports[0]).toMatchObject({
      status: 'committed',
      committed_rows: 2,
    })
  })
})
