// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveOrCreatePaymentCategory } from '@/lib/server/category-service'
import {
  resolveCategorySelectionForPreview,
  resolveCategorySelectionForSave,
} from '@/lib/server/statement-propagation'

vi.mock('@/lib/server/category-service', () => ({
  resolveOrCreatePaymentCategory: vi.fn(),
}))

const mockedResolveOrCreatePaymentCategory = vi.mocked(resolveOrCreatePaymentCategory)

function createCategoryLookupSupabase(row: unknown) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: row, error: null }),
        }),
      }),
    }),
  }
}

function createPreviewSupabase(row: unknown) {
  return {
    from: () => ({
      select: () => ({
        ilike: () => ({
          eq: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: row, error: null }),
            }),
          }),
        }),
      }),
    }),
  }
}

describe('resolveCategorySelectionForSave', () => {
  beforeEach(() => {
    mockedResolveOrCreatePaymentCategory.mockReset()
  })

  it('returns undefined when no category change is requested', async () => {
    mockedResolveOrCreatePaymentCategory.mockResolvedValueOnce(undefined)

    const result = await resolveCategorySelectionForSave(
      createCategoryLookupSupabase(null) as never,
      undefined,
      null,
      null,
      'debit',
    )

    expect(result).toBeUndefined()
  })

  it('returns null when category is explicitly cleared', async () => {
    mockedResolveOrCreatePaymentCategory.mockResolvedValueOnce(null)

    const result = await resolveCategorySelectionForSave(
      createCategoryLookupSupabase(null) as never,
      null,
      null,
      null,
      'debit',
    )

    expect(result).toBeNull()
  })

  it('throws for incompatible transaction/category direction', async () => {
    mockedResolveOrCreatePaymentCategory.mockResolvedValueOnce({
      id: 12,
      name: 'Rent',
      type: 'expense',
      group_name: 'Housing',
      created_at: '2026-01-01T00:00:00.000Z',
    } as never)

    await expect(
      resolveCategorySelectionForSave(
        createCategoryLookupSupabase(null) as never,
        12,
        null,
        null,
        'credit',
      ),
    ).rejects.toThrow('Credit transactions can only use income or transfer categories.')
  })

  it('returns looked-up category row when category is resolved', async () => {
    mockedResolveOrCreatePaymentCategory.mockResolvedValueOnce({
      id: 8,
      name: 'Groceries',
      type: 'expense',
      group_name: 'Living',
      created_at: '2026-01-01T00:00:00.000Z',
    } as never)

    const result = await resolveCategorySelectionForSave(
      createCategoryLookupSupabase({
        id: 8,
        name: 'Groceries',
        type: 'expense',
        group_name: 'Living',
        group_id: 10,
        subgroup_id: 100,
        created_at: '2026-01-01T00:00:00.000Z',
      }) as never,
      8,
      null,
      null,
      'debit',
    )

    expect(result).toMatchObject({ id: 8, group_id: 10, subgroup_id: 100 })
  })
})

describe('resolveCategorySelectionForPreview', () => {
  it('returns synthetic category for a new name when no existing category matches', async () => {
    const result = await resolveCategorySelectionForPreview(
      createPreviewSupabase(null) as never,
      undefined,
      'Coffee Shops',
      'Food',
      'debit',
    )

    expect(result).toEqual({
      id: null,
      name: 'Coffee Shops',
      type: 'expense',
      group_name: 'Food',
      group_id: null,
      subgroup_id: null,
    })
  })

  it('returns matching existing category when preview name already exists', async () => {
    const result = await resolveCategorySelectionForPreview(
      createPreviewSupabase({
        id: 3,
        name: 'Salary',
        type: 'income',
        group_name: 'Income',
        group_id: 30,
        subgroup_id: 300,
        created_at: '2026-01-01T00:00:00.000Z',
      }) as never,
      undefined,
      'Salary',
      null,
      'credit',
    )

    expect(result).toMatchObject({ id: 3, name: 'Salary', type: 'income' })
  })
})
