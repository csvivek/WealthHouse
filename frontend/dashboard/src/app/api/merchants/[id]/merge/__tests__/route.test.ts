// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/merchants/[id]/merge/route'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { mergeMerchant, previewMerchantMerge } from '@/lib/server/merchants'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/server/merchants', () => ({
  mergeMerchant: vi.fn(),
  previewMerchantMerge: vi.fn(),
}))

const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient)
const mockedCreateServiceSupabaseClient = vi.mocked(createServiceSupabaseClient)
const mockedMergeMerchant = vi.mocked(mergeMerchant)
const mockedPreviewMerchantMerge = vi.mocked(previewMerchantMerge)

function createRequest(body: Record<string, unknown>, survivorId = 'merchant-survivor') {
  return new NextRequest(`http://localhost/api/merchants/${survivorId}/merge`, {
    method: 'POST',
    body: JSON.stringify(body),
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

      throw new Error(`Unexpected auth table ${table}`)
    },
  }
}

function createServiceSupabaseMock() {
  return {
    from: (table: string) => {
      if (table === 'merchants') {
        return {
          select: () => ({
            in: () => ({
              eq: async () => ({
                data: [
                  { id: 'merchant-survivor', household_id: 'hh-1' },
                  { id: 'merchant-a', household_id: 'hh-1' },
                  { id: 'merchant-b', household_id: 'hh-1' },
                ],
                error: null,
              }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected service table ${table}`)
    },
  }
}

describe('POST /api/merchants/[id]/merge', () => {
  beforeEach(() => {
    mockedCreateServerSupabaseClient.mockReset()
    mockedCreateServiceSupabaseClient.mockReset()
    mockedMergeMerchant.mockReset()
    mockedPreviewMerchantMerge.mockReset()

    mockedCreateServerSupabaseClient.mockResolvedValue(createAuthSupabaseMock() as never)
    mockedCreateServiceSupabaseClient.mockReturnValue(createServiceSupabaseMock() as never)
  })

  it('rejects when victimIds is missing', async () => {
    const response = await POST(createRequest({}), { params: Promise.resolve({ id: 'merchant-survivor' }) })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/victimIds/i)
  })

  it('returns an aggregate preview for multiple victims', async () => {
    mockedPreviewMerchantMerge
      .mockResolvedValueOnce({
        victimId: 'merchant-a',
        survivorId: 'merchant-survivor',
        impact: {
          aliases: 1,
          statementTransactions: 2,
          receipts: 1,
          ledgerEntries: 0,
          receiptKnowledge: 0,
          categorizationAudits: 0,
          groceryPurchases: 0,
          total: 4,
        },
      } as never)
      .mockResolvedValueOnce({
        victimId: 'merchant-b',
        survivorId: 'merchant-survivor',
        impact: {
          aliases: 2,
          statementTransactions: 1,
          receipts: 0,
          ledgerEntries: 1,
          receiptKnowledge: 0,
          categorizationAudits: 0,
          groceryPurchases: 0,
          total: 4,
        },
      } as never)

    const response = await POST(
      createRequest({ victimIds: ['merchant-a', 'merchant-b'], preview: true }),
      { params: Promise.resolve({ id: 'merchant-survivor' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.preview.impact).toMatchObject({
      aliases: 3,
      statementTransactions: 3,
      receipts: 1,
      ledgerEntries: 1,
      total: 8,
    })
  })

  it('merges each victim into the chosen survivor', async () => {
    mockedMergeMerchant.mockResolvedValue({
      victimId: 'merchant-a',
      survivorId: 'merchant-survivor',
      impactBefore: {
        aliases: 1,
        statementTransactions: 1,
        receipts: 0,
        ledgerEntries: 0,
        receiptKnowledge: 0,
        categorizationAudits: 0,
        groceryPurchases: 0,
        total: 2,
      },
      moved: {
        aliases: 1,
        statementTransactions: 1,
        receipts: 0,
        ledgerEntries: 0,
        receiptKnowledge: 0,
        categorizationAudits: 0,
        groceryPurchases: 0,
        total: 2,
      },
      impactAfterVictim: {
        aliases: 0,
        statementTransactions: 0,
        receipts: 0,
        ledgerEntries: 0,
        receiptKnowledge: 0,
        categorizationAudits: 0,
        groceryPurchases: 0,
        total: 0,
      },
      impactAfterSurvivor: {
        aliases: 2,
        statementTransactions: 4,
        receipts: 1,
        ledgerEntries: 0,
        receiptKnowledge: 0,
        categorizationAudits: 0,
        groceryPurchases: 0,
        total: 7,
      },
    } as never)

    const response = await POST(
      createRequest({ victimIds: ['merchant-a', 'merchant-b'] }),
      { params: Promise.resolve({ id: 'merchant-survivor' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(mockedMergeMerchant).toHaveBeenCalledTimes(2)
    expect(mockedMergeMerchant).toHaveBeenCalledWith('merchant-a', 'merchant-survivor', 'user-1')
    expect(mockedMergeMerchant).toHaveBeenCalledWith('merchant-b', 'merchant-survivor', 'user-1')
  })
})
