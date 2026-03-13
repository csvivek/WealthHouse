import { NextRequest, NextResponse } from 'next/server'
import {
  AccountMutationError,
  updateAccountWithRelatedRecords,
} from '@/lib/server/accounts'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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

  return { householdId: profile.household_id }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const institutionName = typeof body?.institution_name === 'string' ? body.institution_name.trim() : ''
    const productName = typeof body?.product_name === 'string' ? body.product_name.trim() : ''
    const currency = typeof body?.currency === 'string' ? body.currency.trim().toUpperCase() : ''

    if (!institutionName || !productName) {
      return NextResponse.json(
        { error: 'Institution and product name are required.' },
        { status: 400 },
      )
    }

    if (!currency) {
      return NextResponse.json(
        { error: 'Currency is required.' },
        { status: 400 },
      )
    }

    if (typeof body?.is_active !== 'boolean') {
      return NextResponse.json(
        { error: 'is_active must be provided.' },
        { status: 400 },
      )
    }

    const { id } = await params
    const result = await updateAccountWithRelatedRecords(createServiceSupabaseClient(), {
      householdId: ctx.householdId,
      accountId: id,
      institutionName,
      productName,
      nickname: typeof body?.nickname === 'string' ? body.nickname.trim() || null : null,
      identifierHint: typeof body?.identifier_hint === 'string' ? body.identifier_hint.trim() || null : null,
      currency,
      isActive: body.is_active,
      cardName: typeof body?.card_name === 'string' ? body.card_name.trim() || null : null,
      cardLast4: typeof body?.card_last4 === 'string' ? body.card_last4 : null,
      accountType: typeof body?.account_type === 'string' ? body.account_type : null,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AccountMutationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('Account update error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update account' },
      { status: 500 },
    )
  }
}
