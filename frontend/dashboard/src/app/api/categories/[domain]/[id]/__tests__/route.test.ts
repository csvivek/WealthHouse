// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE, PATCH } from '@/app/api/categories/[domain]/[id]/route'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { getAccessibleReceiptCategory, resolveActionableReceiptCategory } from '@/lib/server/receipt-category-overrides'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/server/receipt-category-overrides', () => ({
  getAccessibleReceiptCategory: vi.fn(),
  resolveActionableReceiptCategory: vi.fn(),
}))

const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient)
const mockedCreateServiceSupabaseClient = vi.mocked(createServiceSupabaseClient)
const mockedGetAccessibleReceiptCategory = vi.mocked(getAccessibleReceiptCategory)
const mockedResolveActionableReceiptCategory = vi.mocked(resolveActionableReceiptCategory)

function createAuthSupabaseMock(userId: string | null, householdId: string | null = 'hh-1') {
  return {
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null } }),
    },
    from: (table: string) => {
      if (table === 'user_profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: householdId ? { household_id: householdId } : null }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    },
  }
}

function createPatchServiceDbMock() {
  return {
    from: (table: string) => {
      if (table !== 'receipt_categories') {
        throw new Error(`Unexpected table ${table}`)
      }
      return {
        update: (values: Record<string, unknown>) => ({
          eq: (column: string, id: string) => ({
            eq: (householdColumn: string, householdId: string) => ({
              select: () => ({
                single: async () => ({
                  data: {
                    id,
                    [column]: id,
                    [householdColumn]: householdId,
                    ...values,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }
    },
  }
}

function createDeleteServiceDbMock(params: { headerCount: number; itemCount: number }) {
  return {
    from: (table: string) => {
      if (table === 'receipt_staging_transactions') {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({ count: params.headerCount, error: null }),
            }),
          }),
        }
      }
      if (table === 'receipt_staging_items') {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({ count: params.itemCount, error: null }),
            }),
          }),
        }
      }
      if (table === 'receipt_categories') {
        return {
          delete: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    },
  }
}

describe('PATCH /api/categories/[domain]/[id] receipt', () => {
  beforeEach(() => {
    mockedCreateServerSupabaseClient.mockReset()
    mockedCreateServiceSupabaseClient.mockReset()
    mockedGetAccessibleReceiptCategory.mockReset()
    mockedResolveActionableReceiptCategory.mockReset()
    mockedCreateServerSupabaseClient.mockResolvedValue(createAuthSupabaseMock('user-1') as never)
  })

  it('updates resolved local override for a global receipt category edit', async () => {
    mockedCreateServiceSupabaseClient.mockReturnValue(createPatchServiceDbMock() as never)
    mockedResolveActionableReceiptCategory.mockResolvedValue({
      category: {
        id: 'local-1',
        household_id: 'hh-1',
        source_category_id: 'global-1',
        name: 'Groceries',
        category_family: 'essentials',
        description: null,
        is_active: true,
        sort_order: 10,
        icon_key: 'groceries',
        color_token: 'chart-2',
        color_hex: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
      sourceCategory: {
        id: 'global-1',
      },
      localized: true,
    } as never)

    const request = new NextRequest('http://localhost/api/categories/receipt/global-1', {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Fresh Groceries',
        type: 'essentials',
        icon_key: 'shopping',
        color_token: 'chart-3',
        color_hex: null,
      }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await PATCH(request, { params: Promise.resolve({ domain: 'receipt', id: 'global-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.category.id).toBe('local-1')
    expect(payload.category.name).toBe('Fresh Groceries')
  })
})

describe('DELETE /api/categories/[domain]/[id] receipt', () => {
  beforeEach(() => {
    mockedCreateServerSupabaseClient.mockReset()
    mockedCreateServiceSupabaseClient.mockReset()
    mockedGetAccessibleReceiptCategory.mockReset()
    mockedResolveActionableReceiptCategory.mockReset()
    mockedCreateServerSupabaseClient.mockResolvedValue(createAuthSupabaseMock('user-1') as never)
  })

  it('blocks deletion for in-use local receipt category', async () => {
    mockedCreateServiceSupabaseClient.mockReturnValue(
      createDeleteServiceDbMock({ headerCount: 1, itemCount: 0 }) as never,
    )
    mockedGetAccessibleReceiptCategory.mockResolvedValue({
      id: 'local-1',
      household_id: 'hh-1',
    } as never)

    const request = new NextRequest('http://localhost/api/categories/receipt/local-1', { method: 'DELETE' })
    const response = await DELETE(request, { params: Promise.resolve({ domain: 'receipt', id: 'local-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/reassign receipts/i)
  })

  it('deletes unused local receipt category', async () => {
    mockedCreateServiceSupabaseClient.mockReturnValue(
      createDeleteServiceDbMock({ headerCount: 0, itemCount: 0 }) as never,
    )
    mockedGetAccessibleReceiptCategory.mockResolvedValue({
      id: 'local-1',
      household_id: 'hh-1',
    } as never)

    const request = new NextRequest('http://localhost/api/categories/receipt/local-1', { method: 'DELETE' })
    const response = await DELETE(request, { params: Promise.resolve({ domain: 'receipt', id: 'local-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
  })

  it('blocks deletion for global receipt category', async () => {
    mockedCreateServiceSupabaseClient.mockReturnValue(
      createDeleteServiceDbMock({ headerCount: 0, itemCount: 0 }) as never,
    )
    mockedGetAccessibleReceiptCategory.mockResolvedValue({
      id: 'global-1',
      household_id: null,
    } as never)

    const request = new NextRequest('http://localhost/api/categories/receipt/global-1', { method: 'DELETE' })
    const response = await DELETE(request, { params: Promise.resolve({ domain: 'receipt', id: 'global-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/cannot be deleted/i)
  })
})
