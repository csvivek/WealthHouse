import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

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

    const { data: profile, error: profErr } = await supabase
      .from('user_profiles')
      .select('household_id')
      .eq('id', user.id)
      .single()
    if (profErr || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const service = serviceClient()
    const { data: household, error } = await service
      .from('households')
      .select('*')
      .eq('id', profile.household_id)
      .single()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ household })
  } catch (err) {
    console.error('Household GET error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name } = await request.json()
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // check owner role
    const { data: me } = await supabase
      .from('user_profiles')
      .select('household_id, role')
      .eq('id', user.id)
      .single()
    if (!me || me.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const service = serviceClient()
    const { data: updated, error } = await service
      .from('households')
      .update({ name })
      .eq('id', me.household_id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ household: updated })
  } catch (err) {
    console.error('Household PATCH error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
