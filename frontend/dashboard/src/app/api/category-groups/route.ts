import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { createCategoryGroup, listCategoryGroups } from '@/lib/server/category-groups'

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

export async function GET(request: NextRequest) {
  try {
    const ctx = await getHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const domain = (request.nextUrl.searchParams.get('domain') ?? 'payment') as 'payment' | 'receipt'
    const includeArchived = request.nextUrl.searchParams.get('includeArchived') === '1'
    const groups = await listCategoryGroups(createServiceSupabaseClient(), {
      domain,
      householdId: ctx.householdId,
      includeArchived,
    })

    return NextResponse.json({ groups })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list category groups' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const domain = (body?.domain ?? 'payment') as 'payment' | 'receipt'
    const name = String(body?.name ?? '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 })
    }

    const group = await createCategoryGroup(createServiceSupabaseClient(), {
      domain,
      householdId: ctx.householdId,
      name,
      paymentSubtype: typeof body?.payment_subtype === 'string' ? body.payment_subtype : null,
      description: typeof body?.description === 'string' ? body.description : null,
      actorUserId: ctx.userId,
    })

    return NextResponse.json({ group })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create category group' },
      { status: 500 },
    )
  }
}
