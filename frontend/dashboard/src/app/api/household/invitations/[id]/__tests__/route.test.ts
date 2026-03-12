// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DELETE } from '@/app/api/household/invitations/[id]/route'
import { getAuthenticatedHouseholdActorContext } from '@/lib/server/household-context'
import { createServiceSupabaseClient } from '@/lib/supabase/service'

vi.mock('@/lib/server/household-context', () => ({
  getAuthenticatedHouseholdActorContext: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: vi.fn(),
}))

const mockedGetAuthenticatedHouseholdActorContext = vi.mocked(getAuthenticatedHouseholdActorContext)
const mockedCreateServiceSupabaseClient = vi.mocked(createServiceSupabaseClient)

function createServiceSupabaseMock() {
  return {
    from: (table: string) => {
      if (table !== 'household_user_invites') {
        throw new Error(`Unexpected table ${table}`)
      }

      return {
        update: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({
                is: () => ({
                  select: () => ({
                    maybeSingle: async () => ({
                      data: { id: 'invite-1' },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }
    },
  }
}

describe('DELETE /api/household/invitations/[id]', () => {
  beforeEach(() => {
    mockedGetAuthenticatedHouseholdActorContext.mockReset()
    mockedCreateServiceSupabaseClient.mockReset()
  })

  it('allows owners to revoke a pending invite', async () => {
    mockedGetAuthenticatedHouseholdActorContext.mockResolvedValue({
      userId: 'owner-1',
      householdId: 'hh-1',
      role: 'owner',
    })
    mockedCreateServiceSupabaseClient.mockReturnValue(createServiceSupabaseMock() as never)

    const response = await DELETE(new Request('http://localhost/api/household/invitations/invite-1'), {
      params: Promise.resolve({ id: 'invite-1' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ success: true })
  })

  it('rejects non-owner revoke attempts', async () => {
    mockedGetAuthenticatedHouseholdActorContext.mockResolvedValue({
      userId: 'member-1',
      householdId: 'hh-1',
      role: 'member',
    })

    const response = await DELETE(new Request('http://localhost/api/household/invitations/invite-1'), {
      params: Promise.resolve({ id: 'invite-1' }),
    })

    expect(response.status).toBe(403)
    expect(mockedCreateServiceSupabaseClient).not.toHaveBeenCalled()
  })
})
