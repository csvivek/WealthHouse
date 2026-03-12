// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/categories/[domain]/[id]/merge/route'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { resolveActionableReceiptCategory } from '@/lib/server/receipt-category-overrides'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/server/receipt-category-overrides', () => ({
  resolveActionableReceiptCategory: vi.fn(),
}))

const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient)
const mockedCreateServiceSupabaseClient = vi.mocked(createServiceSupabaseClient)
const mockedResolveActionableReceiptCategory = vi.mocked(resolveActionableReceiptCategory)

function createRequest(targetId: string, domain: 'payment' | 'receipt' = 'payment', sourceId = '1') {
  return new NextRequest(`http://localhost/api/categories/${domain}/${sourceId}/merge`, {
    method: 'POST',
    body: JSON.stringify({ targetId }),
    headers: { 'content-type': 'application/json' },
  })
}

function createAuthSupabaseMock() {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
    from: (table: string) => {
      if (table === 'user_profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { household_id: 'hh-1' } }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

function createCategoriesServiceMock(params: {
  source: { id: number; name: string; type: string | null; domain_type: string }
  target: { id: number; name: string; type: string | null; domain_type: string }
}) {
  return {
    from: (table: string) => {
      if (table === 'categories') {
        return {
          select: () => ({
            eq: (_column: string, value: number) => ({
              single: async () => {
                if (value === params.source.id) return { data: params.source, error: null }
                if (value === params.target.id) return { data: params.target, error: null }
                return { data: null, error: { message: 'not found' } }
              },
            }),
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

function createReceiptMergeServiceMock(calls: string[]) {
  return {
    from: (table: string) => {
      if (table === 'receipt_staging_transactions' || table === 'receipt_staging_items') {
        return {
          update: (values: Record<string, unknown>) => ({
            eq: (column: string, value: string) => ({
              eq: async (column2: string, value2: string) => {
                calls.push(`${table}:${column}=${value}:${column2}=${value2}:${JSON.stringify(values)}`)
                return { error: null }
              },
            }),
          }),
        }
      }

      if (table === 'receipt_categories') {
        return {
          delete: () => ({
            eq: (column: string, value: string) => ({
              eq: async (column2: string, value2: string) => {
                calls.push(`${table}:${column}=${value}:${column2}=${value2}`)
                return { error: null }
              },
            }),
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

describe('POST /api/categories/[domain]/[id]/merge', () => {
  beforeEach(() => {
    mockedCreateServerSupabaseClient.mockReset()
    mockedCreateServiceSupabaseClient.mockReset()
    mockedResolveActionableReceiptCategory.mockReset()
    mockedCreateServerSupabaseClient.mockResolvedValue(createAuthSupabaseMock() as never)
  })

  it('rejects missing target id', async () => {
    const request = createRequest('')
    const response = await POST(request, { params: Promise.resolve({ domain: 'payment', id: '1' }) })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/targetId is required/i)
  })

  it('rejects self merge target', async () => {
    const request = createRequest('1')
    const response = await POST(request, { params: Promise.resolve({ domain: 'payment', id: '1' }) })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/itself/i)
  })

  it('rejects cross-domain merge target', async () => {
    mockedCreateServiceSupabaseClient.mockReturnValue(
      createCategoriesServiceMock({
        source: { id: 1, name: 'Groceries', type: 'expense', domain_type: 'payment' },
        target: { id: 2, name: 'Receipt Dining', type: 'expense', domain_type: 'receipt' },
      }) as never,
    )

    const request = createRequest('2')
    const response = await POST(request, { params: Promise.resolve({ domain: 'payment', id: '1' }) })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/same domain/i)
  })

  it('rejects cross-type payment merge target', async () => {
    mockedCreateServiceSupabaseClient.mockReturnValue(
      createCategoriesServiceMock({
        source: { id: 1, name: 'Groceries', type: 'expense', domain_type: 'payment' },
        target: { id: 2, name: 'Salary', type: 'income', domain_type: 'payment' },
      }) as never,
    )

    const request = createRequest('2')
    const response = await POST(request, { params: Promise.resolve({ domain: 'payment', id: '1' }) })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/same type/i)
  })

  it('merges receipt categories using household-scoped remap updates', async () => {
    const calls: string[] = []
    mockedCreateServiceSupabaseClient.mockReturnValue(createReceiptMergeServiceMock(calls) as never)
    mockedResolveActionableReceiptCategory
      .mockResolvedValueOnce({
        category: { id: 'local-source', household_id: 'hh-1' },
      } as never)
      .mockResolvedValueOnce({
        category: { id: 'local-target', household_id: 'hh-1' },
      } as never)

    const request = createRequest('global-target', 'receipt', 'global-source')
    const response = await POST(request, { params: Promise.resolve({ domain: 'receipt', id: 'global-source' }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(calls).toContain('receipt_staging_transactions:household_id=hh-1:receipt_category_id=local-source:{"receipt_category_id":"local-target"}')
    expect(calls).toContain('receipt_staging_items:household_id=hh-1:receipt_category_id=local-source:{"receipt_category_id":"local-target"}')
    expect(calls).toContain('receipt_categories:id=local-source:household_id=hh-1')
  })

  it('rejects receipt merge when source resolves to same target id', async () => {
    mockedCreateServiceSupabaseClient.mockReturnValue(createReceiptMergeServiceMock([]) as never)
    mockedResolveActionableReceiptCategory
      .mockResolvedValueOnce({
        category: { id: 'local-same', household_id: 'hh-1' },
      } as never)
      .mockResolvedValueOnce({
        category: { id: 'local-same', household_id: 'hh-1' },
      } as never)

    const request = createRequest('target', 'receipt', 'source')
    const response = await POST(request, { params: Promise.resolve({ domain: 'receipt', id: 'source' }) })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/itself/i)
  })
})
