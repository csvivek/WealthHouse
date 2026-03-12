import { describe, expect, it } from 'vitest'
import { listCategoryGroups } from '@/lib/server/category-groups'

type Row = Record<string, unknown>

class QueryBuilder {
  private rows: Row[]

  constructor(rows: Row[]) {
    this.rows = [...rows]
  }

  select() {
    return this
  }

  eq(column: string, value: unknown) {
    this.rows = this.rows.filter((row) => row[column] === value)
    return this
  }

  order(column: string, options?: { ascending?: boolean }) {
    const ascending = options?.ascending !== false
    this.rows.sort((left, right) => {
      const leftValue = left[column]
      const rightValue = right[column]
      if (leftValue === rightValue) return 0
      if (leftValue === null || leftValue === undefined) return ascending ? -1 : 1
      if (rightValue === null || rightValue === undefined) return ascending ? 1 : -1
      return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true }) * (ascending ? 1 : -1)
    })
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

describe('listCategoryGroups', () => {
  it('returns only persisted payment groups instead of reseeding deleted defaults', async () => {
    const db = createDb({
      payment_category_groups: [
        {
          id: 1,
          household_id: 'hh-1',
          name: 'Housing',
          payment_subtype: 'expense',
          sort_order: 10,
          is_archived: false,
          is_system_seeded: true,
          template_key: 'payment:expense:housing',
          description: null,
        },
        {
          id: 2,
          household_id: 'hh-1',
          name: 'Custom Buffer',
          payment_subtype: 'expense',
          sort_order: 20,
          is_archived: false,
          is_system_seeded: false,
          template_key: null,
          description: null,
        },
      ],
      payment_category_group_memberships: [],
    })

    const groups = await listCategoryGroups(db as never, {
      domain: 'payment',
      householdId: 'hh-1',
    })

    expect(groups.map((group) => group.name).sort()).toEqual(['Custom Buffer', 'Housing'])
    expect(groups).toHaveLength(2)
  })

  it('returns only persisted receipt groups instead of recreating deleted empty groups', async () => {
    const db = createDb({
      receipt_category_groups: [
        {
          id: 10,
          household_id: 'hh-1',
          name: 'Shopping',
          sort_order: 10,
          is_archived: false,
          is_system_seeded: true,
          template_key: 'receipt:shopping',
          description: null,
        },
      ],
      receipt_category_group_memberships: [],
    })

    const groups = await listCategoryGroups(db as never, {
      domain: 'receipt',
      householdId: 'hh-1',
    })

    expect(groups.map((group) => group.name)).toEqual(['Shopping'])
    expect(groups).toHaveLength(1)
  })
})
