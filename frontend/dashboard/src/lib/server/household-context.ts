import { createServerSupabaseClient } from '@/lib/supabase/server'

export interface HouseholdContext {
  userId: string
  householdId: string
}

export interface HouseholdActorContext extends HouseholdContext {
  role: string
}

export async function getAuthenticatedHouseholdActorContext(): Promise<HouseholdActorContext | null> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('household_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.household_id) return null

  return {
    userId: user.id,
    householdId: profile.household_id,
    role: profile.role,
  }
}

export async function getAuthenticatedHouseholdContext(): Promise<HouseholdContext | null> {
  const actor = await getAuthenticatedHouseholdActorContext()
  if (!actor) return null

  return {
    userId: actor.userId,
    householdId: actor.householdId,
  }
}
