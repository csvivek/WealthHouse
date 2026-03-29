// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { refreshLinkSuggestionsForImport } from '@/lib/statement-linking'

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

  gte(column: string, value: unknown) {
    this.rows = this.rows.filter((row) => String(row[column] ?? '') >= String(value))
    return this
  }

  then<TResult1 = { data: T[]; error: null }>(
    onfulfilled?: ((value: { data: T[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => PromiseLike<never>) | null,
  ) {
    return Promise.resolve({ data: this.rows, error: null as null }).then(onfulfilled, onrejected)
  }
}

class DeleteBuilder<T extends Row> {
  private predicates: Array<(row: T) => boolean> = []

  constructor(
    private tables: Record<string, T[]>,
    private table: string,
  ) {}

  eq(column: string, value: unknown) {
    this.predicates.push((row) => row[column] === value)
    return this
  }

  then<TResult1 = { data: null; error: null }>(
    onfulfilled?: ((value: { data: null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => PromiseLike<never>) | null,
  ) {
    this.tables[this.table] = this.tables[this.table].filter((row) => !this.predicates.every((predicate) => predicate(row)))
    return Promise.resolve({ data: null, error: null as null }).then(onfulfilled, onrejected)
  }
}

function createDb(params?: { stagingLinks?: Row[] }) {
  const txnDate = new Date().toISOString().slice(0, 10)
  const tables: Record<string, Row[]> = {
    accounts: [
      {
        id: 'acct-savings',
        household_id: 'hh-1',
        account_type: 'savings',
      },
      {
        id: 'acct-card',
        household_id: 'hh-1',
        account_type: 'credit_card',
      },
    ],
    import_staging: [
      {
        id: 'row-1',
        file_import_id: 'import-1',
        account_id: 'acct-savings',
        txn_date: txnDate,
        amount: 1825.21,
        txn_type: 'debit',
        merchant_raw: 'CARD PAYMENT TO CITI READY CREDIT',
        description: 'Monthly card payment',
        reference: null,
      },
    ],
    statement_transactions: [
      {
        id: 'txn-1',
        account_id: 'acct-card',
        txn_date: txnDate,
        amount: -1825.21,
        txn_type: 'credit',
        merchant_raw: 'CITI PAYMENT RECEIVED',
        description: 'Card payment',
      },
    ],
    staging_transaction_links: [...(params?.stagingLinks ?? [])],
  }

  return {
    tables,
    from(table: string) {
      if (!(table in tables)) {
        throw new Error(`Unexpected table ${table}`)
      }

      return {
        select: () => new SelectBuilder(tables[table]),
        delete: () => new DeleteBuilder(tables, table),
        insert: async (payload: Row | Row[]) => {
          const rows = Array.isArray(payload) ? payload : [payload]
          tables[table].push(
            ...rows.map((row, index) => ({
              id: (row.id as string | undefined) ?? `${table}-${tables[table].length + index + 1}`,
              ...row,
            })),
          )
          return { data: null, error: null }
        },
      }
    },
  }
}

describe('refreshLinkSuggestionsForImport', () => {
  it('rebuilds an existing reviewed system link without duplicating it', async () => {
    const db = createDb({
      stagingLinks: [
        {
          id: 'link-existing',
          file_import_id: 'import-1',
          household_id: 'hh-1',
          from_staging_id: 'row-1',
          to_staging_id: null,
          to_transaction_id: 'txn-1',
          link_type: 'credit_card_payment',
          link_score: 0.98,
          link_reason: { source: 'existing' },
          status: 'confirmed',
          matched_by: 'system',
          matched_by_user_id: 'user-1',
          reviewed_by: 'reviewer-1',
          reviewed_at: '2026-03-16T00:00:00.000Z',
        },
      ],
    })

    await refreshLinkSuggestionsForImport({
      supabase: db as never,
      fileImportId: 'import-1',
      householdId: 'hh-1',
      actorUserId: 'user-2',
    })

    expect(db.tables.staging_transaction_links).toHaveLength(1)
    expect(db.tables.staging_transaction_links[0]).toMatchObject({
      file_import_id: 'import-1',
      from_staging_id: 'row-1',
      to_transaction_id: 'txn-1',
      link_type: 'credit_card_payment',
      matched_by: 'system',
      status: 'confirmed',
      reviewed_by: 'reviewer-1',
      reviewed_at: '2026-03-16T00:00:00.000Z',
    })
  })

  it('skips a regenerated system suggestion when the same link already exists manually', async () => {
    const db = createDb({
      stagingLinks: [
        {
          id: 'link-manual',
          file_import_id: 'import-1',
          household_id: 'hh-1',
          from_staging_id: 'row-1',
          to_staging_id: null,
          to_transaction_id: 'txn-1',
          link_type: 'credit_card_payment',
          link_score: 1,
          link_reason: { manual: true },
          status: 'confirmed',
          matched_by: 'user',
          matched_by_user_id: 'user-1',
          reviewed_by: 'user-1',
          reviewed_at: '2026-03-16T00:00:00.000Z',
        },
      ],
    })

    await refreshLinkSuggestionsForImport({
      supabase: db as never,
      fileImportId: 'import-1',
      householdId: 'hh-1',
      actorUserId: 'user-2',
    })

    expect(db.tables.staging_transaction_links).toHaveLength(1)
    expect(db.tables.staging_transaction_links[0]).toMatchObject({
      id: 'link-manual',
      matched_by: 'user',
      to_transaction_id: 'txn-1',
      link_type: 'credit_card_payment',
    })
  })
})
