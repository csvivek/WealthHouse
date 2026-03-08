import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  createAccountWithRelatedRecords,
  findOrCreateInstitution,
  normalizeAccountType,
} from '@/lib/server/accounts'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('household_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const body = await request.json()
    const {
      institution_id,
      institution_code,
      institution_name,
      product_name,
      nickname,
      identifier_hint,
      currency,
      account_type,
      card_name,
      card_last4,
    } = body

    if (!product_name || (!institution_name && !institution_id && !institution_code)) {
      return NextResponse.json(
        { error: 'Institution and product name are required.' },
        { status: 400 },
      )
    }

    const institution = await findOrCreateInstitution(supabase, {
      institutionId: institution_id,
      institutionCode: institution_code,
      institutionName: institution_name,
    })

    const account = await createAccountWithRelatedRecords(supabase, {
      householdId: profile.household_id,
      institutionId: institution.id,
      accountType: normalizeAccountType(account_type),
      productName: product_name,
      nickname: nickname || null,
      identifierHint: identifier_hint || null,
      currency: currency || 'SGD',
      cardName: card_name || null,
      cardLast4: card_last4 || null,
    })

    return NextResponse.json({ account, institution })
  } catch (error) {
    console.error('Account creation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create account' },
      { status: 500 },
    )
  }
}
