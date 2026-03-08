/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'

const MATCH_REASON_SOURCES = new Set(['auto_suggestion', 'manual_candidate_pick', 'user_direct'])

function sanitizeMatchReason(input: unknown) {
  const reason = input && typeof input === 'object' ? { ...(input as Record<string, unknown>) } : {}
  if (typeof reason.source !== 'string' || !MATCH_REASON_SOURCES.has(reason.source)) {
    reason.source = 'user_direct'
  }
  return reason
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ mappingId: string }> },
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

    const { mappingId } = await params
    const body = await request.json()

    const { data: mapping, error: mappingError } = await serviceSupabase
      .from('mappings')
      .select('id, receipt_id')
      .eq('id', mappingId)
      .single()

    if (mappingError || !mapping) {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404 })
    }

    const { data: receipt, error: receiptError } = await serviceSupabase
      .from('receipts')
      .select('id, household_id')
      .eq('id', mapping.receipt_id)
      .single()

    if (receiptError || !receipt || receipt.household_id !== profile.household_id) {
      return NextResponse.json({ error: 'Mapping does not belong to this household' }, { status: 403 })
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      matched_by: 'user',
      matched_by_user_id: user.id,
    }

    if (Object.hasOwn(body, 'status')) {
      updatePayload.status = body.status
    }

    if (Object.hasOwn(body, 'matchConfidence')) {
      const value = Number(body.matchConfidence)
      updatePayload.match_score = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
    }

    if (Object.hasOwn(body, 'matchReason')) {
      updatePayload.match_reason = sanitizeMatchReason(body.matchReason)
    }

    if (Object.hasOwn(body, 'notes')) {
      updatePayload.notes = typeof body.notes === 'string' ? body.notes : null
    }

    if (updatePayload.status === 'confirmed' || updatePayload.status === 'rejected') {
      updatePayload.reviewed_at = new Date().toISOString()
    }

    const { data: updated, error: updateError } = await serviceSupabase
      .from('mappings')
      .update(updatePayload)
      .eq('id', mappingId)
      .select('*')
      .single()

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message || 'Failed to update mapping' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      mapping: updated,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update receipt mapping' },
      { status: 500 },
    )
  }
}
