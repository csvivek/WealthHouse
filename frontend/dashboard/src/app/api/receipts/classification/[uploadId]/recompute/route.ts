/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { classifyReceiptStaging } from '@/lib/receipts/intelligence'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient()
    const serviceSupabase = createServiceSupabaseClient() as any

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

    const { data: staging, error: stagingError } = await serviceSupabase
      .from('receipt_staging_transactions')
      .select('id')
      .eq('upload_id', uploadId)
      .eq('household_id', profile.household_id)
      .single()

    if (stagingError || !staging) {
      return NextResponse.json({ error: 'Staged receipt not found' }, { status: 404 })
    }

    const result = await classifyReceiptStaging({
      supabase: serviceSupabase,
      stagingTransactionId: staging.id,
      actorUserId: user.id,
      persistKnowledge: false,
      force: true,
    })

    await serviceSupabase
      .from('receipt_uploads')
      .update({
        status: 'needs_review',
        updated_at: new Date().toISOString(),
      })
      .eq('id', uploadId)

    return NextResponse.json({
      success: true,
      classification: result,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to recompute receipt classification' },
      { status: 500 },
    )
  }
}
