import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { buildChatSessionPayload } from '@/lib/ai/chat/session'
import type { ChatSessionPayload } from '@/lib/ai/chat/types'
import { createServerSupabaseClient } from '@/lib/supabase/server'

type ServerSupabaseClient = SupabaseClient<Database>

export interface ChatRequestContext {
  supabase: ServerSupabaseClient
  userId: string
  householdId: string
}

export async function getAuthenticatedChatRequestContext(): Promise<ChatRequestContext | null> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('household_id')
    .eq('id', user.id)
    .single()

  if (!profile?.household_id) return null

  return {
    supabase,
    userId: user.id,
    householdId: profile.household_id,
  }
}

export async function getAuthorizedChatSessionContext(params: {
  requestedSession: ChatSessionPayload | null
  userId: string
  householdId: string
}) {
  if (params.requestedSession?.householdId === params.householdId) {
    return params.requestedSession
  }

  const supabase = await createServerSupabaseClient()
  return buildChatSessionPayload({
    supabase,
    userId: params.userId,
    householdId: params.householdId,
  })
}
