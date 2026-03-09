import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'

async function getHouseholdId() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('user_profiles').select('household_id').eq('id', user.id).single()
  return profile?.household_id ?? null
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ domain: string; id: string }> }) {
  try {
    const householdId = await getHouseholdId()
    if (!householdId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { domain, id } = await params
    const body = await request.json()
    const targetId = String(body?.targetId ?? '').trim()
    if (!targetId) return NextResponse.json({ error: 'targetId is required' }, { status: 400 })

    const db = createServiceSupabaseClient()

    if (domain === 'receipt') {
      await db.from('receipt_staging_transactions').update({ receipt_category_id: targetId }).eq('receipt_category_id', id)
      await db.from('receipt_staging_items').update({ receipt_category_id: targetId }).eq('receipt_category_id', id)
      const { error } = await db.from('receipt_categories').delete().eq('id', id).eq('household_id', householdId)
      if (error) throw new Error(error.message)
      return NextResponse.json({ success: true })
    }

    await db.from('statement_transactions').update({ category_id: Number(targetId) }).eq('category_id', Number(id))
    await db.from('ledger_entries').update({ category_id: Number(targetId) }).eq('category_id', Number(id))
    const { error } = await db.from('categories').delete().eq('id', Number(id))
    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Merge failed' }, { status: 500 })
  }
}
