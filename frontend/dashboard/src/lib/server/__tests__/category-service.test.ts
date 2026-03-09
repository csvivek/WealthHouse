import { describe, expect, it } from 'vitest'
import { listCategories } from '@/lib/server/category-service'

type Row = Record<string, unknown>

class QueryBuilder {
  private rows: Row[]

  constructor(rows: Row[]) {
    this.rows = [...rows]
  }

  select() {
    return this
  }

  ilike(column: string, pattern: string) {
    const normalized = pattern.replace(/%/g, '').toLowerCase()
    this.rows = this.rows.filter((row) => String(row[column] ?? '').toLowerCase().includes(normalized))
    return this
  }

  eq(column: string, value: unknown) {
    this.rows = this.rows.filter((row) => row[column] === value)
    return this
  }

  in(column: string, values: unknown[]) {
    const set = new Set(values)
    this.rows = this.rows.filter((row) => set.has(row[column]))
    return this
  }

  not(column: string, op: string, value: unknown) {
    if (op === 'is' && value === null) {
      this.rows = this.rows.filter((row) => row[column] !== null && row[column] !== undefined)
    }
    return this
  }

  gte(column: string, value: string) {
    this.rows = this.rows.filter((row) => String(row[column] ?? '') >= value)
    return this
  }

  lte(column: string, value: string) {
    this.rows = this.rows.filter((row) => String(row[column] ?? '') <= value)
    return this
  }

  order(column: string, options?: { ascending?: boolean }) {
    const ascending = options?.ascending !== false
    this.rows.sort((left, right) => {
      const a = left[column]
      const b = right[column]
      if (a === b) return 0
      if (a === null || a === undefined) return ascending ? -1 : 1
      if (b === null || b === undefined) return ascending ? 1 : -1
      return String(a).localeCompare(String(b), undefined, { numeric: true }) * (ascending ? 1 : -1)
    })
    return this
  }

  or() {
    return this
  }

  then<TResult1 = { data: Row[]; error: null }>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ) {
    const payload = { data: this.rows, error: null as null }
    if (!onfulfilled) return Promise.resolve(payload as TResult1)
    return Promise.resolve(onfulfilled(payload))
  }
}

function createDb(data: Record<string, Row[]>) {
  return {
    from(table: string) {
      return new QueryBuilder(data[table] ?? [])
    },
  }
}

function toIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

describe('listCategories', () => {
  it('returns payment mappedCount with 0 for unmapped categories in selected period', async () => {
    const today = new Date()
    const thisMonthDate = toIsoDate(new Date(today.getFullYear(), today.getMonth(), 5))
    const lastMonthDate = toIsoDate(new Date(today.getFullYear(), today.getMonth() - 1, 10))

    const db = createDb({
      categories: [
        { id: 1, name: 'Salary', type: 'income', created_at: '2026-01-01', icon_key: 'salary', color_token: 'chart-1', color_hex: null },
        { id: 2, name: 'Groceries', type: 'expense', created_at: '2026-01-01', icon_key: 'groceries', color_token: 'chart-2', color_hex: null },
      ],
      accounts: [
        { id: 'acc-hh-1', household_id: 'hh-1' },
        { id: 'acc-hh-2', household_id: 'hh-2' },
      ],
      statement_transactions: [
        { category_id: 1, account_id: 'acc-hh-1', txn_date: thisMonthDate },
        { category_id: 1, account_id: 'acc-hh-1', txn_date: lastMonthDate },
        { category_id: 2, account_id: 'acc-hh-2', txn_date: thisMonthDate },
      ],
    })

    const rows = await listCategories(db as never, {
      domain: 'payment',
      householdId: 'hh-1',
      paymentSubtype: 'all',
      period: 'this_month',
      sortBy: 'name',
      sortDir: 'asc',
    })

    const salary = rows.find((row) => String(row.id) === '1')
    const groceries = rows.find((row) => String(row.id) === '2')
    expect(salary?.mappedCount).toBe(1)
    expect(groceries?.mappedCount).toBe(0)
  })

  it('returns receipt mappedCount with 0 for unmapped categories in selected period', async () => {
    const today = new Date()
    const thisMonthDate = toIsoDate(new Date(today.getFullYear(), today.getMonth(), 7))
    const lastMonthDate = toIsoDate(new Date(today.getFullYear(), today.getMonth() - 1, 12))

    const db = createDb({
      receipt_categories: [
        { id: 'rc-1', household_id: 'hh-1', name: 'Dining', category_family: 'food', is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01', icon_key: 'food', color_token: 'chart-2', color_hex: null },
        { id: 'rc-2', household_id: 'hh-1', name: 'Travel', category_family: 'transport', is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01', icon_key: 'transport', color_token: 'chart-4', color_hex: null },
      ],
      receipt_staging_transactions: [
        { receipt_category_id: 'rc-1', household_id: 'hh-1', txn_date: thisMonthDate },
        { receipt_category_id: 'rc-1', household_id: 'hh-1', txn_date: lastMonthDate },
        { receipt_category_id: 'rc-2', household_id: 'hh-2', txn_date: thisMonthDate },
      ],
    })

    const rows = await listCategories(db as never, {
      domain: 'receipt',
      householdId: 'hh-1',
      period: 'this_month',
      sortBy: 'name',
      sortDir: 'asc',
      status: 'all',
    })

    const dining = rows.find((row) => String(row.id) === 'rc-1')
    const travel = rows.find((row) => String(row.id) === 'rc-2')
    expect(dining?.mappedCount).toBe(1)
    expect(travel?.mappedCount).toBe(0)
  })
})
