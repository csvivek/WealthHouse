import { describe, expect, it } from 'vitest'
import { resolveActionableReceiptCategory } from '@/lib/server/receipt-category-overrides'

type ReceiptCategoryRow = {
  id: string
  household_id: string | null
  source_category_id: string | null
  name: string
  category_family: string | null
  description: string | null
  is_active: boolean
  sort_order: number
  icon_key: string
  color_token: string
  color_hex: string | null
  created_at: string
  updated_at: string
}

type ReceiptStagingRow = {
  household_id: string
  receipt_category_id: string | null
}

class ReceiptCategoriesBuilder {
  private mode: 'select' | 'insert' = 'select'
  private eqFilters: Record<string, string | null> = {}
  private householdOrFilter: string | null = null
  private orderColumn: string | null = null
  private ascendingOrder = true
  private limitCount: number | null = null
  private insertPayload: Record<string, unknown> | null = null

  constructor(private readonly state: MockState) {}

  select() {
    return this
  }

  insert(payload: Record<string, unknown>) {
    this.mode = 'insert'
    this.insertPayload = payload
    return this
  }

  eq(column: string, value: string | null) {
    this.eqFilters[column] = value
    return this
  }

  or(value: string) {
    const marker = 'household_id.eq.'
    const index = value.indexOf(marker)
    if (index >= 0) {
      this.householdOrFilter = value.slice(index + marker.length)
    }
    return this
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderColumn = column
    this.ascendingOrder = options?.ascending !== false
    return this
  }

  limit(value: number) {
    this.limitCount = value
    return this
  }

  async maybeSingle() {
    const rows = this.resolveRows()
    return { data: rows[0] ?? null, error: null }
  }

  async single() {
    if (this.mode === 'insert') {
      const nextId = `local-${this.state.insertCounter + 1}`
      this.state.insertCounter += 1
      const payload = this.insertPayload ?? {}
      const now = typeof payload.updated_at === 'string' ? payload.updated_at : '2026-03-10T00:00:00.000Z'
      const row: ReceiptCategoryRow = {
        id: typeof payload.id === 'string' ? payload.id : nextId,
        household_id: typeof payload.household_id === 'string' ? payload.household_id : null,
        source_category_id: typeof payload.source_category_id === 'string' ? payload.source_category_id : null,
        name: String(payload.name ?? ''),
        category_family: typeof payload.category_family === 'string' ? payload.category_family : null,
        description: typeof payload.description === 'string' ? payload.description : null,
        is_active: payload.is_active === false ? false : true,
        sort_order: Number(payload.sort_order ?? 100),
        icon_key: typeof payload.icon_key === 'string' ? payload.icon_key : 'tag',
        color_token: typeof payload.color_token === 'string' ? payload.color_token : 'slate',
        color_hex: typeof payload.color_hex === 'string' ? payload.color_hex : null,
        created_at: now,
        updated_at: now,
      }
      this.state.receiptCategories.push(row)
      return { data: row, error: null }
    }

    const rows = this.resolveRows()
    if (rows.length === 0) {
      return { data: null, error: { message: 'not found' } }
    }
    return { data: rows[0], error: null }
  }

  private resolveRows() {
    let rows = [...this.state.receiptCategories]

    rows = rows.filter((row) => {
      return Object.entries(this.eqFilters).every(([column, value]) => {
        return row[column as keyof ReceiptCategoryRow] === value
      })
    })

    if (this.householdOrFilter) {
      rows = rows.filter((row) => row.household_id === null || row.household_id === this.householdOrFilter)
    }

    if (this.orderColumn) {
      const column = this.orderColumn as keyof ReceiptCategoryRow
      rows.sort((left, right) => {
        const leftValue = left[column]
        const rightValue = right[column]
        if (leftValue === rightValue) return 0
        return this.ascendingOrder
          ? String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true })
          : String(rightValue).localeCompare(String(leftValue), undefined, { numeric: true })
      })
    }

    if (typeof this.limitCount === 'number') {
      rows = rows.slice(0, this.limitCount)
    }
    return rows
  }
}

class StagingUpdateBuilder {
  private updateValues: Record<string, unknown> = {}
  private filters: Record<string, string> = {}

  constructor(private readonly rows: ReceiptStagingRow[]) {}

  update(values: Record<string, unknown>) {
    this.updateValues = values
    return this
  }

  eq(column: string, value: string) {
    this.filters[column] = value
    return this
  }

  then<TResult1 = { data: null; error: null }>(
    onfulfilled?: ((value: { data: null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ) {
    for (const row of this.rows) {
      const matches = Object.entries(this.filters).every(([column, value]) => row[column as keyof ReceiptStagingRow] === value)
      if (!matches) continue
      const nextCategory = this.updateValues.receipt_category_id
      row.receipt_category_id = typeof nextCategory === 'string' ? nextCategory : row.receipt_category_id
    }

    const payload = { data: null, error: null as null }
    if (!onfulfilled) return Promise.resolve(payload as TResult1)
    return Promise.resolve(onfulfilled(payload))
  }
}

type MockState = {
  insertCounter: number
  receiptCategories: ReceiptCategoryRow[]
  receiptTransactions: ReceiptStagingRow[]
  receiptItems: ReceiptStagingRow[]
}

function buildCategory(partial: Partial<ReceiptCategoryRow> & { id: string; name: string }): ReceiptCategoryRow {
  return {
    id: partial.id,
    household_id: partial.household_id ?? null,
    source_category_id: partial.source_category_id ?? null,
    name: partial.name,
    category_family: partial.category_family ?? 'custom',
    description: partial.description ?? null,
    is_active: partial.is_active ?? true,
    sort_order: partial.sort_order ?? 100,
    icon_key: partial.icon_key ?? 'tag',
    color_token: partial.color_token ?? 'slate',
    color_hex: partial.color_hex ?? null,
    created_at: partial.created_at ?? '2026-01-01T00:00:00.000Z',
    updated_at: partial.updated_at ?? '2026-01-01T00:00:00.000Z',
  }
}

function createDb(state: MockState) {
  return {
    from(table: string) {
      if (table === 'receipt_categories') {
        return new ReceiptCategoriesBuilder(state)
      }
      if (table === 'receipt_staging_transactions') {
        return new StagingUpdateBuilder(state.receiptTransactions)
      }
      if (table === 'receipt_staging_items') {
        return new StagingUpdateBuilder(state.receiptItems)
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

describe('resolveActionableReceiptCategory', () => {
  it('returns household category directly without localization', async () => {
    const state: MockState = {
      insertCounter: 0,
      receiptCategories: [
        buildCategory({ id: 'local-1', household_id: 'hh-1', name: 'Dining' }),
      ],
      receiptTransactions: [],
      receiptItems: [],
    }

    const result = await resolveActionableReceiptCategory({
      db: createDb(state) as never,
      householdId: 'hh-1',
      categoryId: 'local-1',
    })

    expect(result?.category.id).toBe('local-1')
    expect(result?.localized).toBe(false)
    expect(result?.sourceCategory).toBeNull()
  })

  it('creates local override for a global category and remaps only matching household rows', async () => {
    const state: MockState = {
      insertCounter: 0,
      receiptCategories: [
        buildCategory({ id: 'global-1', household_id: null, name: 'Groceries', sort_order: 40 }),
      ],
      receiptTransactions: [
        { household_id: 'hh-1', receipt_category_id: 'global-1' },
        { household_id: 'hh-2', receipt_category_id: 'global-1' },
      ],
      receiptItems: [
        { household_id: 'hh-1', receipt_category_id: 'global-1' },
        { household_id: 'hh-2', receipt_category_id: 'global-1' },
      ],
    }

    const result = await resolveActionableReceiptCategory({
      db: createDb(state) as never,
      householdId: 'hh-1',
      categoryId: 'global-1',
    })

    expect(result?.localized).toBe(true)
    expect(result?.sourceCategory?.id).toBe('global-1')
    expect(result?.category.household_id).toBe('hh-1')
    expect(result?.category.source_category_id).toBe('global-1')

    const hh1TxnRows = state.receiptTransactions.filter((row) => row.household_id === 'hh-1')
    const hh2TxnRows = state.receiptTransactions.filter((row) => row.household_id === 'hh-2')
    expect(hh1TxnRows.every((row) => row.receipt_category_id === result?.category.id)).toBe(true)
    expect(hh2TxnRows.every((row) => row.receipt_category_id === 'global-1')).toBe(true)

    const hh1ItemRows = state.receiptItems.filter((row) => row.household_id === 'hh-1')
    const hh2ItemRows = state.receiptItems.filter((row) => row.household_id === 'hh-2')
    expect(hh1ItemRows.every((row) => row.receipt_category_id === result?.category.id)).toBe(true)
    expect(hh2ItemRows.every((row) => row.receipt_category_id === 'global-1')).toBe(true)
  })

  it('reuses existing local override for global category without creating a second row', async () => {
    const state: MockState = {
      insertCounter: 0,
      receiptCategories: [
        buildCategory({ id: 'global-1', household_id: null, name: 'Groceries' }),
        buildCategory({ id: 'local-1', household_id: 'hh-1', source_category_id: 'global-1', name: 'Groceries' }),
      ],
      receiptTransactions: [],
      receiptItems: [],
    }

    const result = await resolveActionableReceiptCategory({
      db: createDb(state) as never,
      householdId: 'hh-1',
      categoryId: 'global-1',
    })

    expect(result?.localized).toBe(false)
    expect(result?.category.id).toBe('local-1')
    expect(state.receiptCategories).toHaveLength(2)
  })
})
