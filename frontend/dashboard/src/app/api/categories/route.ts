import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { listCategories } from '@/lib/server/category-service'

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

    if (domain === 'receipt') {
      const { data, error } = await db
        .from('receipt_categories')
        .insert({ household_id: householdId, name, category_family: body?.type || 'custom', is_active: true, sort_order: 100 })
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ category: data })
    }

    const { data, error } = await db
      .from('categories')
      .insert({ name, type: body?.type || 'expense', group_name: body?.group_name || null })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ category: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create category' }, { status: 500 })
  }
}
