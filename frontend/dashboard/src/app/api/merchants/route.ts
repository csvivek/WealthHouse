import { NextRequest, NextResponse } from 'next/server'
import { merchantApiErrorPayload } from '@/lib/merchants/config'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { createMerchant, listMerchants } from '@/lib/server/merchant-service'

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

export async function GET(request: NextRequest) {
  try {
    const ctx = await getHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const searchParams = request.nextUrl.searchParams
    const merchants = await listMerchants(createServiceSupabaseClient(), {
      householdId: ctx.householdId,
      search: searchParams.get('search') ?? undefined,
      status: (searchParams.get('status') as 'all' | 'active' | 'inactive' | null) ?? 'all',
      sortBy:
        (searchParams.get('sortBy') as 'name' | 'updated_at' | 'alias_count' | 'transaction_count' | 'receipt_count' | 'total_spend' | null) ??
        'name',
      sortDir: (searchParams.get('sortDir') as 'asc' | 'desc' | null) ?? 'asc',
    })

    return NextResponse.json({ merchants })
  } catch (error) {
    const { status, body } = merchantApiErrorPayload(error, 'Failed to list merchants')
    return NextResponse.json(body, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const name = String(body?.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'Merchant name is required' }, { status: 400 })

    const merchant = await createMerchant({
      db: createServiceSupabaseClient(),
      householdId: ctx.householdId,
      actorUserId: ctx.userId,
      name,
      iconKey: typeof body?.icon_key === 'string' ? body.icon_key : null,
      colorToken: typeof body?.color_token === 'string' ? body.color_token : null,
      colorHex: typeof body?.color_hex === 'string' ? body.color_hex : null,
      notes: typeof body?.notes === 'string' ? body.notes : null,
      alias: typeof body?.alias === 'string' ? body.alias : null,
    })

    return NextResponse.json({ merchant })
  } catch (error) {
    const { status, body } = merchantApiErrorPayload(error, 'Failed to create merchant')
    return NextResponse.json(body, { status })
  }
}
