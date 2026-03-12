import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type UserProfileRow = Pick<
  Database['public']['Tables']['user_profiles']['Row'],
  'id' | 'display_name' | 'avatar_url' | 'role' | 'created_at' | 'household_id'
>

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>

function createOptionalServiceClient(): ServiceSupabaseClient | null {
  try {
    return createServiceSupabaseClient()
  } catch {
    return null
  }
}

async function loadUserEmail(
  serviceSupabase: ServiceSupabaseClient | null,
  userId: string,
) {
  if (!serviceSupabase) return null

  const result = await serviceSupabase.auth.admin.getUserById(userId)
  if (result.error) {
    console.warn(`Household profile email unavailable for user ${userId}: ${result.error.message}`)
    return null
  }

  return result.data.user?.email ?? null
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: me, error: meErr } = await supabase
      .from('user_profiles')
      .select('household_id')
      .eq('id', user.id)
      .single()

    if (meErr || !me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const { data: profiles, error } = await supabase
      .from('user_profiles')
      .select('id, display_name, avatar_url, role, created_at, household_id')
      .eq('household_id', me.household_id)

    if (error) {
      console.error('Household profiles fetch error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const serviceSupabase = createOptionalServiceClient()
    const normalized = await Promise.all(
      ((profiles ?? []) as UserProfileRow[]).map(async (profile) => ({
        ...profile,
        email: await loadUserEmail(serviceSupabase, profile.id),
      })),
    )

    return NextResponse.json({ profiles: normalized })
  } catch (err) {
    console.error('Household profiles GET error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
