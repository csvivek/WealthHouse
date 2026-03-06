import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// utility to get service-role supabase client
function serviceClient() {
  return createService<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // fetch current profile to know household
    const { data: me, error: meErr } = await supabase
      .from('user_profiles')
      .select('household_id')
      .eq('id', user.id)
      .single()

    if (meErr || !me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const service = serviceClient()
    // fetch all profiles in household, include auth.users.email via join
    const { data: profiles, error } = await service
      .from('user_profiles')
      .select(
        'id,display_name,avatar_url,role,created_at, household_id, auth.users(email)'
      )
      .eq('household_id', me.household_id)

    if (error) {
      console.error('Household profiles fetch error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // flatten email field
    const normalized = (profiles || []).map((p) => ({
      ...p,
      email: (p as any).auth?.users?.email ?? null,
    }))

    return NextResponse.json({ profiles: normalized })
  } catch (err) {
    console.error('Household profiles GET error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
