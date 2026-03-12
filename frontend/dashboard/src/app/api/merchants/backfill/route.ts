import { NextResponse } from 'next/server'
import { merchantApiErrorPayload } from '@/lib/merchants/config'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { backfillHouseholdMerchants } from '@/lib/server/merchant-service'

async function getHouseholdContext() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('user_profiles').select('household_id').eq('id', user.id).single()
  if (!profile?.household_id) return null

  return { userId: user.id, householdId: profile.household_id }
}

export async function POST() {
  try {
    const ctx = await getHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const result = await backfillHouseholdMerchants(createServiceSupabaseClient(), ctx.householdId, ctx.userId)
    return NextResponse.json({ result })
  } catch (error) {
    const { status, body } = merchantApiErrorPayload(error, 'Failed to backfill merchants')
    return NextResponse.json(body, { status })
  }
}
