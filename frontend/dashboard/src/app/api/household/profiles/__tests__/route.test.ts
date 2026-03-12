// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/household/profiles/route'
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

function createServerSupabaseMock(options?: {
  profilesErrorMessage?: string
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
    from: (table: string) => {
      if (table !== 'user_profiles') {
        throw new Error(`Unexpected table ${table}`)
      }

      return {
        select: (columns?: string) => {
          if (columns === 'household_id') {
            return {
              eq: () => ({
                single: async () => ({ data: { household_id: 'hh-1' }, error: null }),
              }),
            }
          }

          if (columns !== 'id, display_name, avatar_url, role, created_at, household_id') {
            throw new Error(`Unexpected select ${String(columns)}`)
          }

          return {
            eq: async () => ({
              data: options?.profilesErrorMessage
                ? null
                : [
                    {
                      id: 'user-1',
                      display_name: 'Owner User',
                      avatar_url: null,
                      role: 'owner',
                      created_at: '2026-03-12T00:00:00.000Z',
                      household_id: 'hh-1',
                    },
                    {
                      id: 'user-2',
                      display_name: 'Alex Example',
                      avatar_url: null,
                      role: 'member',
                      created_at: '2026-03-12T00:00:00.000Z',
                      household_id: 'hh-1',
                    },
                  ],
              error: options?.profilesErrorMessage ? { message: options.profilesErrorMessage } : null,
            }),
          }
        },
      }
    },
  }
}

function createServiceSupabaseMock(options?: {
  emailErrorByUserId?: Record<string, string>
}) {
  return {
    auth: {
      admin: {
        getUserById: async (userId: string) => ({
          data: options?.emailErrorByUserId?.[userId]
            ? { user: null }
            : { user: { email: `${userId}@example.com` } },
          error: options?.emailErrorByUserId?.[userId]
            ? { message: options.emailErrorByUserId[userId] }
            : null,
        }),
      },
    },
  }
}

describe('GET /api/household/profiles', () => {
  beforeEach(() => {
    mockedCreateServerSupabaseClient.mockReset()
    mockedCreateServiceSupabaseClient.mockReset()
    mockedCreateServerSupabaseClient.mockResolvedValue(createServerSupabaseMock() as never)
    mockedCreateServiceSupabaseClient.mockReturnValue(createServiceSupabaseMock() as never)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  it('returns household profiles with auth emails', async () => {
    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.profiles).toEqual([
      expect.objectContaining({
        id: 'user-1',
        display_name: 'Owner User',
        email: 'user-1@example.com',
      }),
      expect.objectContaining({
        id: 'user-2',
        display_name: 'Alex Example',
        email: 'user-2@example.com',
      }),
    ])
  })

  it('keeps profiles available when auth email enrichment fails', async () => {
    mockedCreateServiceSupabaseClient.mockReturnValue(createServiceSupabaseMock({
      emailErrorByUserId: {
        'user-2': 'permission denied for auth.admin',
      },
    }) as never)

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.profiles).toEqual([
      expect.objectContaining({
        id: 'user-1',
        email: 'user-1@example.com',
      }),
      expect.objectContaining({
        id: 'user-2',
        email: null,
      }),
    ])
    expect(vi.mocked(console.warn).mock.calls.flat().map((value) => String(value))).toContain(
      'Household profile email unavailable for user user-2: permission denied for auth.admin',
    )
  })
})
