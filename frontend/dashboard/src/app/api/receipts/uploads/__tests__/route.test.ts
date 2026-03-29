// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/receipts/uploads/route'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: vi.fn(),
}))

const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient)
const mockedCreateServiceSupabaseClient = vi.mocked(createServiceSupabaseClient)

describe('GET /api/receipts/uploads', () => {
  beforeEach(() => {
    mockedCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: async () => ({ data: { user: { id: 'user-1' } } }),
      },
      from: (table: string) => {
        if (table === 'user_profiles') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { household_id: 'hh-1' }, error: null }),
              }),
            }),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      },
    } as never)
  })

  it('falls back when CSV metadata columns are missing from receipt_uploads', async () => {
    let uploadSelectCount = 0

    mockedCreateServiceSupabaseClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'receipt_uploads') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => {
                    uploadSelectCount += 1

                    if (uploadSelectCount === 1) {
                      return {
                        data: null,
                        error: { message: 'column receipt_uploads.import_source does not exist' },
                      }
                    }

                    return {
                      data: [{
                        id: 'upload-1',
                        status: 'committed',
                        original_filename: 'receipt.jpg',
                        file_size_bytes: 1234,
                        mime_type: 'image/jpeg',
                        created_at: '2026-03-18T00:00:00.000Z',
                        parse_error: null,
                        committed_receipt_id: 'receipt-1',
                        updated_at: '2026-03-18T00:05:00.000Z',
                      }],
                      error: null,
                    }
                  },
                }),
              }),
            }),
          }
        }

        if (table === 'receipt_tags') {
          return {
            select: () => ({
              eq: async () => ({
                data: [],
                error: null,
              }),
            }),
          }
        }

        if (table === 'receipts') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({
                    data: [{
                      id: 'receipt-1',
                      merchant_raw: 'Din Tai Fung',
                      total_amount: 42.5,
                      currency: 'SGD',
                      created_at: '2026-03-18T00:00:00.000Z',
                      approved_at: '2026-03-18T00:10:00.000Z',
                      status: 'approved',
                      source_upload_id: 'upload-1',
                      merchant: null,
                    }],
                    error: null,
                  }),
                }),
              }),
            }),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      },
    } as never)

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(uploadSelectCount).toBe(2)
    expect(payload.uploads).toEqual([
      expect.objectContaining({
        id: 'upload-1',
        import_source: 'image_upload',
        csv_batch_id: null,
      }),
    ])
    expect(payload.stats).toMatchObject({
      totalUploads: 1,
      committed: 1,
      finalReceipts: 1,
    })
  })
})
