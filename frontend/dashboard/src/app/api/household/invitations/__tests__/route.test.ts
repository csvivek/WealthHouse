// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/household/invitations/route'
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

function createServiceSupabaseMock(options?: {
  invitations?: Array<Record<string, unknown>>
  insertError?: { code?: string; message: string }
  inviteError?: { message: string }
}) {
  const deleteEq = vi.fn(async () => ({ error: null }))
  const inviteUserByEmail = vi.fn(async () => ({
    data: options?.inviteError ? null : { user: { id: 'auth-user-1' } },
    error: options?.inviteError ?? null,
  }))

  const insertedInvitation = {
    id: 'invite-1',
    household_id: 'hh-1',
    email: 'new-user@example.com',
    normalized_email: 'new-user@example.com',
    display_name: 'New User',
    role: 'member',
    invited_by: 'owner-1',
    accepted_user_id: null,
    accepted_at: null,
    revoked_at: null,
    created_at: '2026-03-12T00:00:00.000Z',
    updated_at: '2026-03-12T00:00:00.000Z',
  }

  return {
    auth: {
      admin: {
        inviteUserByEmail,
      },
    },
    from: (table: string) => {
      if (table !== 'household_user_invites') {
        throw new Error(`Unexpected table ${table}`)
      }

      return {
        select: () => ({
          eq: () => ({
            is: () => ({
              is: () => ({
                order: async () => ({
                  data: options?.invitations ?? [],
                  error: null,
                }),
              }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: options?.insertError ? null : insertedInvitation,
              error: options?.insertError ?? null,
            }),
          }),
        }),
        delete: () => ({
          eq: deleteEq,
        }),
      }
    },
    __deleteEq: deleteEq,
    __inviteUserByEmail: inviteUserByEmail,
  }
}

describe('household invitations route', () => {
  beforeEach(() => {
    mockedGetAuthenticatedHouseholdActorContext.mockReset()
    mockedCreateServiceSupabaseClient.mockReset()
  })

  it('returns pending invitations for owners', async () => {
    mockedGetAuthenticatedHouseholdActorContext.mockResolvedValue({
      userId: 'owner-1',
      householdId: 'hh-1',
      role: 'owner',
    })
    mockedCreateServiceSupabaseClient.mockReturnValue(createServiceSupabaseMock({
      invitations: [
        {
          id: 'invite-1',
          household_id: 'hh-1',
          email: 'new-user@example.com',
          normalized_email: 'new-user@example.com',
          display_name: 'New User',
          role: 'member',
          invited_by: 'owner-1',
          accepted_user_id: null,
          accepted_at: null,
          revoked_at: null,
          created_at: '2026-03-12T00:00:00.000Z',
          updated_at: '2026-03-12T00:00:00.000Z',
        },
      ],
    }) as never)

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.invitations).toEqual([
      {
        id: 'invite-1',
        email: 'new-user@example.com',
        displayName: 'New User',
        role: 'member',
        createdAt: '2026-03-12T00:00:00.000Z',
        acceptedAt: null,
        revokedAt: null,
      },
    ])
  })

  it('creates an invitation for owners', async () => {
    mockedGetAuthenticatedHouseholdActorContext.mockResolvedValue({
      userId: 'owner-1',
      householdId: 'hh-1',
      role: 'owner',
    })
    const serviceMock = createServiceSupabaseMock()
    mockedCreateServiceSupabaseClient.mockReturnValue(serviceMock as never)

    const response = await POST(new NextRequest('http://localhost/api/household/invitations', {
      method: 'POST',
      body: JSON.stringify({
        email: 'new-user@example.com',
        displayName: 'New User',
      }),
    }))
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload.invitation).toEqual({
      id: 'invite-1',
      email: 'new-user@example.com',
      displayName: 'New User',
      role: 'member',
      createdAt: '2026-03-12T00:00:00.000Z',
      acceptedAt: null,
      revokedAt: null,
    })
    expect(serviceMock.__inviteUserByEmail).toHaveBeenCalledWith(
      'new-user@example.com',
      expect.objectContaining({
        redirectTo: 'http://localhost/auth/callback?next=/settings',
      }),
    )
  })

  it('rejects non-owner invite creation', async () => {
    mockedGetAuthenticatedHouseholdActorContext.mockResolvedValue({
      userId: 'member-1',
      householdId: 'hh-1',
      role: 'member',
    })

    const response = await POST(new NextRequest('http://localhost/api/household/invitations', {
      method: 'POST',
      body: JSON.stringify({ email: 'new-user@example.com' }),
    }))

    expect(response.status).toBe(403)
    expect(mockedCreateServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('returns 409 for duplicate pending invites', async () => {
    mockedGetAuthenticatedHouseholdActorContext.mockResolvedValue({
      userId: 'owner-1',
      householdId: 'hh-1',
      role: 'owner',
    })
    const serviceMock = createServiceSupabaseMock({
      insertError: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "household_user_invites_pending_email_uq"',
      },
    })
    mockedCreateServiceSupabaseClient.mockReturnValue(serviceMock as never)

    const response = await POST(new NextRequest('http://localhost/api/household/invitations', {
      method: 'POST',
      body: JSON.stringify({ email: 'new-user@example.com' }),
    }))

    expect(response.status).toBe(409)
    expect(serviceMock.__inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('returns 409 for existing WealthHouse accounts and cleans up the pending invite', async () => {
    mockedGetAuthenticatedHouseholdActorContext.mockResolvedValue({
      userId: 'owner-1',
      householdId: 'hh-1',
      role: 'owner',
    })
    const serviceMock = createServiceSupabaseMock({
      inviteError: {
        message: 'A user with this email address has already been registered',
      },
    })
    mockedCreateServiceSupabaseClient.mockReturnValue(serviceMock as never)

    const response = await POST(new NextRequest('http://localhost/api/household/invitations', {
      method: 'POST',
      body: JSON.stringify({ email: 'existing@example.com' }),
    }))
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error).toBe('Existing WealthHouse accounts can’t be invited yet.')
    expect(serviceMock.__deleteEq).toHaveBeenCalledWith('id', 'invite-1')
  })
})
