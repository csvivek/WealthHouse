// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/categories/route'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { listCategories } from '@/lib/server/category-service'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/server/category-service', () => ({
  listCategories: vi.fn(),
}))

const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient)
const mockedCreateServiceSupabaseClient = vi.mocked(createServiceSupabaseClient)
const mockedListCategories = vi.mocked(listCategories)

function createSupabaseMock(userId: string | null, householdId: string | null = 'hh-1') {
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

describe('GET /api/categories', () => {
  beforeEach(() => {
    mockedCreateServerSupabaseClient.mockReset()
    mockedCreateServiceSupabaseClient.mockReset()
    mockedListCategories.mockReset()
    mockedCreateServiceSupabaseClient.mockReturnValue({} as never)
  })

  it('returns 401 when unauthenticated', async () => {
    mockedCreateServerSupabaseClient.mockResolvedValueOnce(createSupabaseMock(null) as never)

    const request = new NextRequest('http://localhost/api/categories?domain=payment')
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Unauthorized' })
  })

  it('returns categories with mappedCount and passes period filter', async () => {
    mockedCreateServerSupabaseClient.mockResolvedValueOnce(createSupabaseMock('user-1') as never)
    mockedListCategories.mockResolvedValueOnce([
      {
        id: 1,
        name: 'Salary',
        type: 'income',
        status: 'active',
        domain: 'payment',
        mappedCount: 3,
        icon_key: 'salary',
        color_token: 'chart-1',
        color_hex: null,
      },
      {
        id: 2,
        name: 'Utilities',
        type: 'expense',
        status: 'active',
        domain: 'payment',
        mappedCount: 0,
        icon_key: 'utilities',
        color_token: 'chart-4',
        color_hex: null,
      },
    ] as never)

    const request = new NextRequest(
      'http://localhost/api/categories?domain=payment&period=this_month&paymentSubtype=all&status=all&sortBy=name&search=',
    )
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.categories).toHaveLength(2)
    expect(payload.categories[0].mappedCount).toBe(3)
    expect(payload.categories[1].mappedCount).toBe(0)
    expect(mockedListCategories).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        domain: 'payment',
        householdId: 'hh-1',
        period: 'this_month',
      }),
    )
  })
})
