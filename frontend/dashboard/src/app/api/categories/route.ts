import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { listCategories } from '@/lib/server/category-service'
import { resolveCategoryStyle } from '@/lib/server/category-style'
import type { DatePeriod } from '@/lib/date-periods'

async function getHouseholdId() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('user_profiles').select('household_id').eq('id', user.id).single()
  return profile?.household_id ?? null
}

export async function GET(request: NextRequest) {
  try {
    const householdId = await getHouseholdId()
    if (!householdId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const searchParams = request.nextUrl.searchParams
    const domain = (searchParams.get('domain') ?? 'payment') as 'payment' | 'receipt'
    const rows = await listCategories(createServiceSupabaseClient(), {
      domain,
      householdId,
      search: searchParams.get('search') ?? undefined,
      status: (searchParams.get('status') as 'all' | 'active' | 'inactive' | null) ?? 'all',
      paymentSubtype: (searchParams.get('paymentSubtype') as 'all' | 'expense' | 'transfer' | 'income' | null) ?? 'all',
      period: (searchParams.get('period') as DatePeriod | null) ?? 'all_history',
      sortBy: (searchParams.get('sortBy') as 'name' | 'created_at' | 'type' | 'sort_order' | null) ?? 'name',
      sortDir: (searchParams.get('sortDir') as 'asc' | 'desc' | null) ?? 'asc',
    })

    return NextResponse.json({ categories: rows })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to list categories' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const householdId = await getHouseholdId()
    if (!householdId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const db = createServiceSupabaseClient()
    const domain = body?.domain as 'payment' | 'receipt'
    const name = String(body?.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    const style = resolveCategoryStyle({
      name,
      iconKey: typeof body?.icon_key === 'string' ? body.icon_key : null,
      colorToken: typeof body?.color_token === 'string' ? body.color_token : null,
      colorHex: typeof body?.color_hex === 'string' ? body.color_hex : null,
    })

    if (domain === 'receipt') {
      const { data, error } = await db
        .from('receipt_categories')
        .insert({
          household_id: householdId,
          name,
          category_family: body?.type || 'custom',
          is_active: true,
          sort_order: 100,
          icon_key: style.icon_key,
          color_token: style.color_token,
          color_hex: style.color_hex,
        })
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ category: data })
    }

    const { data, error } = await db
      .from('categories')
      .insert({
        name,
        type: body?.type || 'expense',
        group_name: body?.group_name || null,
        icon_key: style.icon_key,
        color_token: style.color_token,
        color_hex: style.color_hex,
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ category: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create category' }, { status: 500 })
  }
}
