import { NextResponse } from 'next/server'
import { getAuthenticatedHouseholdActorContext } from '@/lib/server/household-context'
import { createServiceSupabaseClient } from '@/lib/supabase/service'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getAuthenticatedHouseholdActorContext()
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (actor.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const serviceSupabase = createServiceSupabaseClient()

    const { data: updatedInvite, error } = await serviceSupabase
      .from('household_user_invites')
      .update({
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('household_id', actor.householdId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .select('id')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!updatedInvite) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Household invitations DELETE error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
