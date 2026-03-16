// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/statements/[importId]/download/route'
import { createServerSupabaseClient } from '@/lib/supabase/server'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient)

describe('GET /api/statements/[importId]/download', () => {
  beforeEach(() => {
    mockedCreateServerSupabaseClient.mockReset()
  })

  it('streams the stored statement for the owning household', async () => {
    mockedCreateServerSupabaseClient.mockReturnValue({
      auth: {
        getUser: async () => ({ data: { user: { id: 'user-1' } } }),
      },
      storage: {
        from: () => ({
          download: async () => ({
            data: new Blob(['statement-bytes'], { type: 'application/pdf' }),
            error: null,
          }),
        }),
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

        if (table === 'file_imports') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: 'import-1',
                      household_id: 'hh-1',
                      file_name: 'statement.pdf',
                      mime_type: 'application/pdf',
                      storage_bucket: 'statements',
                      storage_path: 'households/hh-1/statements/file-1/statement.pdf',
                    },
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

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ importId: 'import-1' }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Content-Disposition')).toContain('statement.pdf')
    expect(Buffer.from(await response.arrayBuffer()).toString('utf8')).toBe('statement-bytes')
  })

  it('returns a handled 404 when legacy imports do not have storage metadata', async () => {
    mockedCreateServerSupabaseClient.mockReturnValue({
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

        if (table === 'file_imports') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: 'import-1',
                      household_id: 'hh-1',
                      file_name: 'statement.pdf',
                      mime_type: 'application/pdf',
                      storage_bucket: null,
                      storage_path: null,
                    },
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

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ importId: 'import-1' }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Original statement unavailable for this import',
    })
  })
})
