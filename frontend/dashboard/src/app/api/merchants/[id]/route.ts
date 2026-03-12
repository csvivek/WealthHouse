import { NextRequest, NextResponse } from 'next/server'
import { merchantApiErrorPayload } from '@/lib/merchants/config'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { deleteMerchant } from '@/lib/server/merchants'
import { getMerchantDetail, updateMerchant } from '@/lib/server/merchant-service'

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

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const merchant = await getMerchantDetail(createServiceSupabaseClient(), ctx.householdId, id)
    if (!merchant) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })

    return NextResponse.json({ merchant })
  } catch (error) {
    const { status, body } = merchantApiErrorPayload(error, 'Failed to load merchant')
    return NextResponse.json(body, { status })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await request.json()

    const merchant = await updateMerchant({
      db: createServiceSupabaseClient(),
      householdId: ctx.householdId,
      merchantId: id,
      actorUserId: ctx.userId,
      name: typeof body?.name === 'string' ? body.name : null,
      iconKey: typeof body?.icon_key === 'string' ? body.icon_key : null,
      colorToken: typeof body?.color_token === 'string' ? body.color_token : null,
      colorHex: typeof body?.color_hex === 'string' ? body.color_hex : null,
      notes: typeof body?.notes === 'string' ? body.notes : null,
      isActive: typeof body?.is_active === 'boolean' ? body.is_active : undefined,
      alias: typeof body?.alias === 'string' ? body.alias : null,
    })

    return NextResponse.json({ merchant })
  } catch (error) {
    const { status, body } = merchantApiErrorPayload(error, 'Failed to update merchant')
    return NextResponse.json(body, { status })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const merchant = await getMerchantDetail(createServiceSupabaseClient(), ctx.householdId, id)
    if (!merchant) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })

    const result = await deleteMerchant(id)
    if (result.blocked) {
      return NextResponse.json(
        { error: 'Merchant is still in use and cannot be deleted', impact: result.impact },
        { status: 400 },
      )
    }

    return NextResponse.json({ success: true, result })
  } catch (error) {
    const { status, body } = merchantApiErrorPayload(error, 'Failed to delete merchant', 'delete_merchant_safe')
    return NextResponse.json(body, { status })
  }
}
