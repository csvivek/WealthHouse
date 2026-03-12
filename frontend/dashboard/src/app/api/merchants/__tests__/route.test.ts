// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/merchants/route'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { listMerchants } from '@/lib/server/merchant-service'
import { MERCHANT_ERROR_CODES } from '@/lib/merchants/config'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/server/merchant-service', () => ({
  listMerchants: vi.fn(),
  createMerchant: vi.fn(),
}))

const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient)
const mockedCreateServiceSupabaseClient = vi.mocked(createServiceSupabaseClient)
const mockedListMerchants = vi.mocked(listMerchants)

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

describe('GET /api/merchants', () => {
  beforeEach(() => {
    mockedCreateServerSupabaseClient.mockReset()
    mockedCreateServiceSupabaseClient.mockReset()
    mockedListMerchants.mockReset()

    mockedCreateServerSupabaseClient.mockResolvedValue(createSupabaseMock('user-1') as never)
    mockedCreateServiceSupabaseClient.mockReturnValue({} as never)
  })

  it('returns a schema guidance payload when merchant migrations are missing', async () => {
    mockedListMerchants.mockRejectedValue(new Error('column merchants.household_id does not exist'))

    const response = await GET(new NextRequest('http://localhost/api/merchants'))
    const payload = await response.json()

    expect(response.status).toBe(503)
    expect(payload.code).toBe(MERCHANT_ERROR_CODES.SCHEMA_NOT_READY)
    expect(payload.action).toContain('016_merchant_management.sql')
  })
})
