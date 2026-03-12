import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { reorderCategoryGroups } from '@/lib/server/category-groups'

async function getHouseholdContext() {
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
  return { userId: user.id, householdId: profile.household_id }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ domain: string }> },
) {
  try {
    const ctx = await getHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { domain } = await params
    const body = await request.json()
    const groupIds = Array.isArray(body?.groupIds) ? body.groupIds.map((value: unknown) => Number(value)).filter(Number.isFinite) : []
    await reorderCategoryGroups(createServiceSupabaseClient(), {
      domain: domain as 'payment' | 'receipt',
      householdId: ctx.householdId,
      groupIds,
      actorUserId: ctx.userId,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reorder category groups' },
      { status: 500 },
    )
  }
}
