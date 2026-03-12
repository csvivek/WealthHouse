import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { deleteCategoryGroup, updateCategoryGroup } from '@/lib/server/category-groups'

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
  { params }: { params: Promise<{ domain: string; groupId: string }> },
) {
  try {
    const ctx = await getHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { domain, groupId } = await params
    const body = await request.json()
    const group = await updateCategoryGroup(createServiceSupabaseClient(), {
      domain: domain as 'payment' | 'receipt',
      householdId: ctx.householdId,
      groupId: Number(groupId),
      actorUserId: ctx.userId,
      name: typeof body?.name === 'string' ? body.name : undefined,
      description: typeof body?.description === 'string' ? body.description : body?.description === null ? null : undefined,
      isArchived: typeof body?.is_archived === 'boolean' ? body.is_archived : undefined,
    })

    return NextResponse.json({ group })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update category group' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ domain: string; groupId: string }> },
) {
  try {
    const ctx = await getHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { domain, groupId } = await params
    const targetGroupId = request.nextUrl.searchParams.get('targetGroupId')
    await deleteCategoryGroup(createServiceSupabaseClient(), {
      domain: domain as 'payment' | 'receipt',
      householdId: ctx.householdId,
      groupId: Number(groupId),
      targetGroupId: targetGroupId ? Number(targetGroupId) : null,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete category group' },
      { status: 500 },
    )
  }
}
