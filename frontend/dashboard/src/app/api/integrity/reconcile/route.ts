import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { runFullReconciliation } from '@/lib/integrity/reconciler'

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const results = await runFullReconciliation(supabase, user.id)

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Reconciliation error:', error)
    return NextResponse.json({ error: 'Reconciliation failed' }, { status: 500 })
  }
}
