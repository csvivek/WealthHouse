import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Ensures a user_profiles row exists for the authenticated user.
 * Calls the SECURITY DEFINER RPC function that mirrors the
 * on_auth_user_created trigger logic as a fallback.
 */
export async function ensureProfile(
  supabase: SupabaseClient,
  userId: string
) {
  // Quick check — avoids the RPC round-trip in the common case
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', userId)
    .single()

  if (existing) return

  // Profile missing — call the DB function to create it
  const { error } = await supabase.rpc('ensure_user_profile')
  if (error) {
    console.error('ensure_user_profile RPC failed:', error)
  }
}
