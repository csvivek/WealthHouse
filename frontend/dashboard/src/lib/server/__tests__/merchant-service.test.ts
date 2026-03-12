import { describe, expect, it } from 'vitest'
import { resolveMerchantReference, upsertMerchantAlias } from '@/lib/server/merchant-service'

type Row = Record<string, unknown>

class SelectQuery {
  private rows: Row[]

  constructor(rows: Row[]) {
    this.rows = [...rows]
  }

  eq(column: string, value: unknown) {
    this.rows = this.rows.filter((row) => row[column] === value)
    return this
  }

  neq(column: string, value: unknown) {
    this.rows = this.rows.filter((row) => row[column] !== value)
    return this
  }

  in(column: string, values: unknown[]) {
    const allowed = new Set(values)
    this.rows = this.rows.filter((row) => allowed.has(row[column]))
    return this
  }

  async maybeSingle() {
    return { data: this.rows[0] ?? null, error: null }
  }

  async single() {
    return { data: this.rows[0] ?? null, error: null }
  }

  then<TResult1 = { data: Row[]; error: null }>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ) {
    const payload = { data: this.rows, error: null as null }
    if (!onfulfilled) return Promise.resolve(payload as TResult1)
    return Promise.resolve(onfulfilled(payload))
  }
}

class InsertQuery {
  private insertedRows: Row[]

  constructor(insertedRows: Row[]) {
    this.insertedRows = insertedRows
  }

  select() {
    return this
  }

  async single() {
    return { data: this.insertedRows[0] ?? null, error: null }
  }
}

function createDb(initialData?: Partial<Record<string, Row[]>>) {
  function withMerchantDefaults(row: Row): Row {
    return {
      icon_key: 'store',
      color_token: 'slate',
      color_hex: null,
      notes: null,
      default_category_id: null,
      merged_into_merchant_id: null,
      is_active: true,
      created_by: null,
      updated_by: null,
      created_at: '2026-03-11T00:00:00.000Z',
      updated_at: '2026-03-11T00:00:00.000Z',
      ...row,
    }
  }

  function withAliasDefaults(row: Row): Row {
    return {
      raw_name: null,
      normalized_raw_name: null,
      source_type: 'manual',
      confidence: null,
      created_at: '2026-03-11T00:00:00.000Z',
      updated_at: '2026-03-11T00:00:00.000Z',
      ...row,
    }
  }

  const tables: Record<string, Row[]> = {
    merchants: (initialData?.merchants ?? []).map((row) => withMerchantDefaults(row)),
    merchant_aliases: (initialData?.merchant_aliases ?? []).map((row) => withAliasDefaults(row)),
  }
  const counters = new Map<string, number>()

  function nextId(table: string) {
    const current = (counters.get(table) ?? 0) + 1
    counters.set(table, current)
    return `${table}-${current}`
  }

  return {
    tables,
    from(table: string) {
      return {
        select() {
          return new SelectQuery(tables[table] ?? [])
        },
        insert(values: Row | Row[]) {
          const items = Array.isArray(values) ? values : [values]
          const insertedRows = items.map((item) => {
            const base = table === 'merchant_aliases' ? withAliasDefaults(item) : withMerchantDefaults(item)
            const row = {
              id: typeof base.id === 'string' ? base.id : nextId(table),
              ...base,
            }
            tables[table] = [...(tables[table] ?? []), row]
            return row
          })
          return new InsertQuery(insertedRows)
        },
      }
    },
  }
}

function createLegacyAliasCompatDb() {
  const inserts: Row[] = []

  return {
    inserts,
    from(table: string) {
      if (table !== 'merchant_aliases') {
        throw new Error(`Unexpected table ${table}`)
      }

      return {
        select() {
          return new SelectQuery([])
        },
        insert(values: Row | Row[]) {
          const item = Array.isArray(values) ? values[0] : values
          inserts.push(item)

          const hasLegacyCompatFields =
            typeof item.pattern === 'string' &&
            typeof item.source === 'string' &&
            typeof item.priority === 'number'

          return {
            select() {
              return this
            },
            async single() {
              if (!hasLegacyCompatFields) {
                return {
                  data: null,
                  error: {
                    message: 'null value in column "pattern" of relation "merchant_aliases" violates not-null constraint',
                  },
                }
              }

              return {
                data: {
                  id: 'alias-1',
                  household_id: item.household_id,
                  merchant_id: item.merchant_id,
                  raw_name: item.raw_name,
                  normalized_raw_name: item.normalized_raw_name,
                  source_type: item.source_type,
                  confidence: item.confidence,
                  created_at: '2026-03-11T00:00:00.000Z',
                  updated_at: '2026-03-11T00:00:00.000Z',
                },
                error: null,
              }
            },
          }
        },
      }
    },
  }
}

describe('resolveMerchantReference', () => {
  it('creates a new canonical merchant and alias when none exist', async () => {
    const db = createDb()

    const result = await resolveMerchantReference({
      db: db as never,
      householdId: 'hh-1',
      rawName: 'STARBUCKS - Plaza Sing',
      sourceType: 'statement',
      actorUserId: 'user-1',
    })

    expect(result?.created).toBe(true)
    expect(result?.merchant.name).toBe('Starbucks')
    expect(result?.merchant.normalized_name).toBe('starbucks')
    expect(db.tables.merchants).toHaveLength(1)
    expect(db.tables.merchant_aliases).toHaveLength(1)
    expect(db.tables.merchant_aliases[0].normalized_raw_name).toBe('starbucks')
  })

  it('reuses an existing merchant when an alias already matches', async () => {
    const db = createDb({
      merchants: [
        {
          id: 'merchant-1',
          household_id: 'hh-1',
          name: "McDonald's",
          normalized_name: 'mcdonalds',
        },
      ],
      merchant_aliases: [
        {
          id: 'alias-1',
          household_id: 'hh-1',
          merchant_id: 'merchant-1',
          raw_name: 'MCDONALDS #2341',
          normalized_raw_name: 'mcdonalds',
        },
      ],
    })

    const result = await resolveMerchantReference({
      db: db as never,
      householdId: 'hh-1',
      rawName: 'MCDONALDS #2341',
      sourceType: 'statement',
    })

    expect(result?.created).toBe(false)
    expect(result?.matchedBy).toBe('alias')
    expect(result?.merchant.id).toBe('merchant-1')
    expect(db.tables.merchants).toHaveLength(1)
    expect(db.tables.merchant_aliases).toHaveLength(1)
  })

  it('does not create duplicate aliases for the same normalized raw merchant', async () => {
    const db = createDb({
      merchants: [
        {
          id: 'merchant-1',
          household_id: 'hh-1',
          name: 'Starbucks',
          normalized_name: 'starbucks',
        },
      ],
      merchant_aliases: [
        {
          id: 'alias-1',
          household_id: 'hh-1',
          merchant_id: 'merchant-1',
          raw_name: 'STARBUCKS - Plaza Sing',
          normalized_raw_name: 'starbucks',
        },
      ],
    })

    const result = await resolveMerchantReference({
      db: db as never,
      householdId: 'hh-1',
      rawName: 'STARBUCKS #2234',
      sourceType: 'statement',
    })

    expect(result?.merchant.id).toBe('merchant-1')
    expect(db.tables.merchant_aliases).toHaveLength(1)
  })

  it('preserves a manual canonical merchant name when new aliases arrive later', async () => {
    const db = createDb({
      merchants: [
        {
          id: 'merchant-1',
          household_id: 'hh-1',
          name: "McDonald's",
          normalized_name: 'mcdonalds',
        },
      ],
    })

    const result = await resolveMerchantReference({
      db: db as never,
      householdId: 'hh-1',
      rawName: 'McDonalds Singapore',
      sourceType: 'receipt',
    })

    expect(result?.created).toBe(false)
    expect(result?.matchedBy).toBe('merchant')
    expect(result?.merchant.name).toBe("McDonald's")
    expect(db.tables.merchant_aliases).toHaveLength(1)
    expect(db.tables.merchant_aliases[0].merchant_id).toBe('merchant-1')
  })

  it('retries alias inserts with legacy compatibility fields when pattern is still not-null', async () => {
    const db = createLegacyAliasCompatDb()

    const result = await upsertMerchantAlias({
      db: db as never,
      householdId: 'hh-1',
      merchantId: 'merchant-1',
      rawName: 'STARBUCKS - Plaza Sing',
      sourceType: 'statement',
      confidence: 0.92,
    })

    expect(result.created).toBe(true)
    expect(db.inserts).toHaveLength(2)
    expect(db.inserts[1]).toMatchObject({
      pattern: 'STARBUCKS - Plaza Sing',
      source: 'statement',
      priority: 92,
    })
  })
})
