import { describe, expect, it } from 'vitest'
import { dedupeTagIds, listTags, normalizeTagName } from '@/lib/server/tag-service'

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

  ilike(column: string, pattern: string) {
    const normalized = pattern.replace(/%/g, '').toLowerCase()
    this.rows = this.rows.filter((row) => String(row[column] ?? '').toLowerCase().includes(normalized))
    return this
  }

  in(column: string, values: unknown[]) {
    const set = new Set(values)
    this.rows = this.rows.filter((row) => set.has(row[column]))
    return this
  }

  order(column: string, options?: { ascending?: boolean }) {
    const ascending = options?.ascending !== false
    this.rows.sort((left, right) => String(left[column] ?? '').localeCompare(String(right[column] ?? '')) * (ascending ? 1 : -1))
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

describe('tag-service helpers', () => {
  it('normalizes names and dedupes ids', () => {
    expect(normalizeTagName('  Emergency   Fund  ')).toBe('emergency fund')
    expect(dedupeTagIds(['a', 'b', 'a', '', 'b'])).toEqual(['a', 'b'])
  })

  it('lists household tags with statement and receipt usage counts', async () => {
    const db = createDb({
      tags: [
        { id: 'tag-1', household_id: 'hh-1', name: 'Travel', normalized_name: 'travel', color_token: 'chart-4', color_hex: null, icon_key: 'travel', description: null, source: 'default', source_member_id: null, is_active: true, merged_into_tag_id: null, created_by: null, updated_by: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
        { id: 'tag-2', household_id: 'hh-1', name: 'Medical', normalized_name: 'medical', color_token: 'chart-5', color_hex: null, icon_key: 'medical', description: null, source: 'custom', source_member_id: null, is_active: true, merged_into_tag_id: null, created_by: null, updated_by: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
      ],
      statement_transaction_tags: [
        { household_id: 'hh-1', tag_id: 'tag-1' },
        { household_id: 'hh-1', tag_id: 'tag-1' },
      ],
      receipt_tags: [
        { household_id: 'hh-1', tag_id: 'tag-2' },
      ],
    })

    const rows = await listTags(db as never, {
      householdId: 'hh-1',
      search: '',
      source: 'all',
      status: 'active',
      sortBy: 'usage_count',
      sortDir: 'desc',
    })

    expect(rows).toHaveLength(2)
    expect(rows[0].id).toBe('tag-1')
    expect(rows[0].statement_mapped_count).toBe(2)
    expect(rows[0].receipt_mapped_count).toBe(0)
    expect(rows[0].total_mapped_count).toBe(2)
    expect(rows[1].id).toBe('tag-2')
    expect(rows[1].total_mapped_count).toBe(1)
  })
})
