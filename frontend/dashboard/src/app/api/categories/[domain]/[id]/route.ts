import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { resolveCategoryStyle } from '@/lib/server/category-style'

async function getHouseholdId() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('user_profiles').select('household_id').eq('id', user.id).single()
  return profile?.household_id ?? null
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ domain: string; id: string }> }) {
  const householdId = await getHouseholdId()
  if (!householdId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { domain, id } = await params
  const db = createServiceSupabaseClient()
  const query = domain === 'receipt'
    ? db.from('receipt_categories').select('*').eq('id', id).or(`household_id.is.null,household_id.eq.${householdId}`)
    : db.from('categories').select('*').eq('id', Number(id))
  const { data, error } = await query.single()
  if (error || !data) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  return NextResponse.json({ category: data })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ domain: string; id: string }> }) {
  const householdId = await getHouseholdId()
  if (!householdId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { domain, id } = await params
  const body = await request.json()
  const db = createServiceSupabaseClient()
  const providedName = typeof body?.name === 'string' ? body.name.trim() : null
  const providedIconKey = typeof body?.icon_key === 'string' ? body.icon_key : null
  const providedColorToken = typeof body?.color_token === 'string' ? body.color_token : null
  const providedColorHex = typeof body?.color_hex === 'string' ? body.color_hex : null

  if (domain === 'receipt') {
    const { data: existing, error: existingError } = await db
      .from('receipt_categories')
      .select('*')
      .eq('id', id)
      .or(`household_id.is.null,household_id.eq.${householdId}`)
      .single()

    if (existingError || !existing) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    if (existing.household_id !== householdId) {
      return NextResponse.json({ error: 'Cannot edit global receipt categories from this screen' }, { status: 403 })
    }

    const nextName = providedName || existing.name
    const style = resolveCategoryStyle({
      name: nextName,
      iconKey: providedIconKey,
      colorToken: providedColorToken,
      colorHex: providedColorHex,
    })

    const { data, error } = await db.from('receipt_categories').update({
      name: nextName,
      category_family: body?.type ?? existing.category_family,
      is_active: typeof body?.is_active === 'boolean' ? body.is_active : existing.is_active,
      description: body?.description ?? existing.description,
      icon_key: style.icon_key,
      color_token: style.color_token,
      color_hex: style.color_hex,
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('household_id', householdId).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ category: data })
  }

  const { data: existing, error: existingError } = await db.from('categories').select('*').eq('id', Number(id)).single()
  if (existingError || !existing) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  const nextName = providedName || existing.name
  const style = resolveCategoryStyle({
    name: nextName,
    iconKey: providedIconKey,
    colorToken: providedColorToken,
    colorHex: providedColorHex,
  })

  const { data, error } = await db.from('categories').update({
    name: nextName,
    type: body?.type ?? existing.type,
    group_name: body?.group_name ?? existing.group_name,
    icon_key: style.icon_key,
    color_token: style.color_token,
    color_hex: style.color_hex,
  }).eq('id', Number(id)).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ category: data })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ domain: string; id: string }> }) {
  const householdId = await getHouseholdId()
  if (!householdId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { domain, id } = await params
  const db = createServiceSupabaseClient()

  if (domain === 'receipt') {
    const [{ count: headerCount }, { count: itemCount }] = await Promise.all([
      db.from('receipt_staging_transactions').select('*', { count: 'exact', head: true }).eq('receipt_category_id', id),
      db.from('receipt_staging_items').select('*', { count: 'exact', head: true }).eq('receipt_category_id', id),
    ])
    if ((headerCount ?? 0) > 0 || (itemCount ?? 0) > 0) {
      return NextResponse.json({ error: 'Category is in use and cannot be deleted' }, { status: 400 })
    }
    const { error } = await db.from('receipt_categories').delete().eq('id', id).eq('household_id', householdId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  const [{ count: statementCount }, { count: ledgerCount }] = await Promise.all([
    db.from('statement_transactions').select('*', { count: 'exact', head: true }).eq('category_id', Number(id)),
    db.from('ledger_entries').select('*', { count: 'exact', head: true }).eq('category_id', Number(id)),
  ])
  if ((statementCount ?? 0) > 0 || (ledgerCount ?? 0) > 0) {
    return NextResponse.json({ error: 'Category is in use and cannot be deleted' }, { status: 400 })
  }
  const { error } = await db.from('categories').delete().eq('id', Number(id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
