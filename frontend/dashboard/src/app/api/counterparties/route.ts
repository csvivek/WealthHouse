import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { getAuthenticatedHouseholdContext } from '@/lib/server/household-context'

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthenticatedHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const search = request.nextUrl.searchParams.get('search')
    const supabase = createServiceSupabaseClient()

    let query = supabase
      .from('counterparties')
      .select('id, name, relationship, phone, counterparty_type, notes, created_at')
      .or(`household_id.eq.${ctx.householdId},household_id.is.null`)
      .order('name', { ascending: true })

    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ counterparties: data ?? [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list counterparties' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthenticatedHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const name = String(body?.name ?? '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const supabase = createServiceSupabaseClient()

    // Check for duplicate name within household (case-insensitive)
    const { data: existing } = await supabase
      .from('counterparties')
      .select('id')
      .eq('household_id', ctx.householdId)
      .ilike('name', name)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'A counterparty with this name already exists' }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('counterparties')
      .insert({
        household_id: ctx.householdId,
        name,
        relationship: typeof body?.relationship === 'string' ? body.relationship : null,
        phone: typeof body?.phone === 'string' ? body.phone : null,
        counterparty_type: typeof body?.counterparty_type === 'string' ? body.counterparty_type : null,
        notes: typeof body?.notes === 'string' ? body.notes : null,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ counterparty: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create counterparty' },
      { status: 500 },
    )
  }
}
