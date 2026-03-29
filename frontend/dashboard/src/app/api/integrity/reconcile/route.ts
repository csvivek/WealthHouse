import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { runFullReconciliation } from '@/lib/integrity/reconciler'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data } = await supabase
      .from('reconciliation_runs')
      .select('type, status, summary, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    if (!data || data.length === 0) {
      return NextResponse.json(null)
    }

    // Group the latest batch (runs within 5 seconds of each other)
    const latestTime = data[0].created_at
    const checks = data
      .filter(r => Math.abs(new Date(r.created_at).getTime() - new Date(latestTime).getTime()) < 5000)
      .map(r => ({ name: r.type, status: r.status, summary: r.summary }))

    return NextResponse.json({ checks, ran_at: latestTime })
  } catch (error) {
    console.error('Reconciliation fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch reconciliation' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const results = await runFullReconciliation(supabase, user.id)
    const checks = results.map(r => ({ name: r.type, status: r.status, summary: r.summary }))

    return NextResponse.json({ checks, ran_at: new Date().toISOString() })
  } catch (error) {
    console.error('Reconciliation error:', error)
    return NextResponse.json({ error: 'Reconciliation failed' }, { status: 500 })
  }
}
