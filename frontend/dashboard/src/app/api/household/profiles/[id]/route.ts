import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'

function serviceClient() {
  return createService(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const updates = await request.json()
    // allowed fields
    const { display_name, avatar_url, role } = updates

    // fetch requester's profile
    const { data: me } = await supabase
      .from('user_profiles')
      .select('household_id, role')
      .eq('id', user.id)
      .single()

    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // check permission: self or owner
    if (user.id !== id && me.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const service = serviceClient()
    const { data: updated, error } = await service
      .from('user_profiles')
      .update({ display_name, avatar_url, role })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Profile update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ profile: updated })
  } catch (err) {
    console.error('Profile PATCH error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // only owner may remove others, and cannot remove self
    const { data: me } = await supabase
      .from('user_profiles')
      .select('household_id, role')
      .eq('id', user.id)
      .single()

    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    if (me.role !== 'owner' || id === user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const service = serviceClient()
    // remove profile (household_members is separate and does not reference user id)
    await service.from('user_profiles').delete().eq('id', id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Profile DELETE error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
