/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient()
    const db = supabase as any

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('household_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'No profile found' }, { status: 404 })
    }

    const { uploadId } = await params

    const { data: staging, error: stagingError } = await db
      .from('receipt_staging_transactions')
      .select('id')
      .eq('upload_id', uploadId)
      .eq('household_id', profile.household_id)
      .single()

    if (stagingError || !staging) {
      return NextResponse.json({ error: 'Staged receipt not found' }, { status: 404 })
    }

    const { data: runs, error: runsError } = await db
      .from('receipt_classification_runs')
      .select('*')
      .eq('staging_transaction_id', staging.id)
      .order('created_at', { ascending: false })
      .limit(20)

    if (runsError) {
      return NextResponse.json({ error: runsError.message }, { status: 500 })
    }

    const runIds = ((runs ?? []) as Array<Record<string, unknown>>)
      .map((run) => run.id)
      .filter(Boolean)

    let itemClassifications: Array<Record<string, unknown>> = []
    if (runIds.length > 0) {
      const { data: itemData, error: itemError } = await db
        .from('receipt_item_classifications')
        .select('*')
        .in('classification_run_id', runIds)

      if (itemError) {
        return NextResponse.json({ error: itemError.message }, { status: 500 })
      }

      itemClassifications = itemData ?? []
    }

    return NextResponse.json({
      runs: runs ?? [],
      items: itemClassifications,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch receipt classification details' },
      { status: 500 },
    )
  }
}
