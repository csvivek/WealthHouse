import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  processStatementReroute,
  StatementRerouteProcessError,
  type StatementRerouteInput,
} from '@/lib/server/statement-reroute'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ importId: string }> },
) {
  try {
    const { importId } = await params
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
      return NextResponse.json({ error: 'No profile found' }, { status: 404 })
    }

    const payload = await request.json() as StatementRerouteInput
    if (!payload?.targetAccountId && !payload?.createAccount) {
      return NextResponse.json(
        { error: 'Provide a targetAccountId or createAccount payload.' },
        { status: 400 },
      )
    }

    const result = await processStatementReroute({
      importId,
      householdId: profile.household_id,
      userId: user.id,
      input: payload,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof StatementRerouteProcessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('Statement reroute error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reroute statement import' },
      { status: 500 },
    )
  }
}
