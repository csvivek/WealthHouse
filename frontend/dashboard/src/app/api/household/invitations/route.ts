import { NextRequest, NextResponse } from 'next/server'
import type { PostgrestError } from '@supabase/supabase-js'
import { mapHouseholdInvitation, normalizeInvitationEmail } from '@/lib/household-invitations'
import { getAuthenticatedHouseholdActorContext } from '@/lib/server/household-context'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type HouseholdInviteInsert = Database['public']['Tables']['household_user_invites']['Insert']

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isPendingInviteConflict(error: PostgrestError | null) {
  if (!error) return false
  return error.code === '23505' || /household_user_invites_pending_email_uq/i.test(error.message)
}

function isExistingAuthUserInviteError(message: string) {
  return /already been registered|already registered|already exists|email.*exists/i.test(message)
}

export async function GET() {
  try {
    const actor = await getAuthenticatedHouseholdActorContext()
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (actor.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const serviceSupabase = createServiceSupabaseClient()
    const { data, error } = await serviceSupabase
      .from('household_user_invites')
      .select('*')
      .eq('household_id', actor.householdId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      invitations: (data ?? []).map(mapHouseholdInvitation),
    })
  } catch (error) {
    console.error('Household invitations GET error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthenticatedHouseholdActorContext()
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (actor.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const serviceSupabase = createServiceSupabaseClient()
    const {
      email,
      displayName,
    } = (await request.json()) as { email?: string; displayName?: string | null }

    const trimmedEmail = email?.trim() ?? ''
    const normalizedEmail = normalizeInvitationEmail(trimmedEmail)

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 })
    }

    const inviteInsert: HouseholdInviteInsert = {
      household_id: actor.householdId,
      email: trimmedEmail,
      normalized_email: normalizedEmail,
      display_name: displayName?.trim() || null,
      role: 'member',
      invited_by: actor.userId,
    }

    const { data: insertedInvite, error: insertError } = await serviceSupabase
      .from('household_user_invites')
      .insert(inviteInsert)
      .select('*')
      .single()

    if (isPendingInviteConflict(insertError)) {
      return NextResponse.json(
        { error: 'This email already has a pending household invite.' },
        { status: 409 },
      )
    }

    if (insertError || !insertedInvite) {
      return NextResponse.json({ error: insertError?.message ?? 'Failed to create invite' }, { status: 500 })
    }

    const redirectTo = `${request.nextUrl.origin}/auth/callback?next=/settings`
    const { error: inviteError } = await serviceSupabase.auth.admin.inviteUserByEmail(trimmedEmail, {
      redirectTo,
      data: displayName?.trim() ? { full_name: displayName.trim() } : undefined,
    })

    if (inviteError) {
      await serviceSupabase
        .from('household_user_invites')
        .delete()
        .eq('id', insertedInvite.id)

      if (isExistingAuthUserInviteError(inviteError.message)) {
        return NextResponse.json(
          { error: 'Existing WealthHouse accounts can’t be invited yet.' },
          { status: 409 },
        )
      }

      return NextResponse.json({ error: inviteError.message }, { status: 500 })
    }

    return NextResponse.json({ invitation: mapHouseholdInvitation(insertedInvite) }, { status: 201 })
  } catch (error) {
    console.error('Household invitations POST error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
