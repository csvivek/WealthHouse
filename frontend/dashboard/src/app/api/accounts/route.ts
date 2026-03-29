import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  createAccountWithRelatedRecords,
  findOrCreateInstitution,
  type InstitutionBrandDecision,
  normalizeAccountType,
} from '@/lib/server/accounts'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('household_id')
      .eq('id', user.id)
      .single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('id, nickname, product_name, currency, account_type')
      .eq('household_id', profile.household_id)
      .eq('is_active', true)
      .order('product_name', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ accounts: accounts ?? [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch accounts' },
      { status: 500 },
    )
  }
}

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
      institution_brand_code,
      institution_brand_decision,
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
      institutionBrandCode: typeof institution_brand_code === 'string' ? institution_brand_code : null,
      institutionBrandDecision: (
        institution_brand_decision === 'verified' || institution_brand_decision === 'generic'
          ? institution_brand_decision
          : null
      ) as InstitutionBrandDecision | null,
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
