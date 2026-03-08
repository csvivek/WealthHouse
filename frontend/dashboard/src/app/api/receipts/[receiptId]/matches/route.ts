/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'

const MATCH_REASON_SOURCES = new Set(['auto_suggestion', 'manual_candidate_pick', 'user_direct'])

function sanitizeMatchReason(input: unknown) {
  const reason = input && typeof input === 'object' ? { ...(input as Record<string, unknown>) } : {}
  const source = typeof reason.source === 'string' && MATCH_REASON_SOURCES.has(reason.source)
    ? reason.source
    : 'user_direct'

  return {
    ...reason,
    source,
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ receiptId: string }> },
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

    const { receiptId } = await params
    const body = await request.json()

    const statementTransactionId = body.statementTransactionId as string | undefined
    const requestedStatus = (body.status as string | undefined) || 'needs_review'
    const status = ['needs_review', 'confirmed', 'rejected'].includes(requestedStatus) ? requestedStatus : 'needs_review'
    const matchScore = typeof body.matchConfidence === 'number' ? body.matchConfidence : Number(body.matchConfidence || 0.5)
    const notes = typeof body.notes === 'string' ? body.notes : null
    const requestedMatchType = (body.matchType as string | undefined) || 'fuzzy'
    const matchType = ['fuzzy', 'exact', 'manual'].includes(requestedMatchType) ? requestedMatchType : 'fuzzy'
    const matchReason = sanitizeMatchReason(body.matchReason)

    if (!statementTransactionId) {
      return NextResponse.json({ error: 'statementTransactionId is required' }, { status: 400 })
    }

    const { data: receipt, error: receiptError } = await serviceSupabase
      .from('receipts')
      .select('id, household_id')
      .eq('id', receiptId)
      .single()

    if (receiptError || !receipt || receipt.household_id !== profile.household_id) {
      return NextResponse.json({ error: 'Receipt not found for this household' }, { status: 404 })
    }

    const { data: statementTxn, error: statementError } = await serviceSupabase
      .from('statement_transactions')
      .select('id, account_id')
      .eq('id', statementTransactionId)
      .single()

    if (statementError || !statementTxn) {
      return NextResponse.json({ error: 'Statement transaction not found' }, { status: 404 })
    }

    const { data: account, error: accountError } = await serviceSupabase
      .from('accounts')
      .select('id, household_id')
      .eq('id', statementTxn.account_id)
      .single()

    if (accountError || !account || account.household_id !== profile.household_id) {
      return NextResponse.json({ error: 'Statement transaction does not belong to this household' }, { status: 403 })
    }

    const { data: mapping, error: mappingError } = await serviceSupabase
      .from('mappings')
      .upsert(
        {
          receipt_id: receiptId,
          statement_transaction_id: statementTransactionId,
          match_score: Math.max(0, Math.min(1, matchScore)),
          match_type: matchType,
          status,
          match_reason: matchReason,
          matched_by: 'user',
          matched_by_user_id: user.id,
          notes,
          updated_at: new Date().toISOString(),
          reviewed_at: new Date().toISOString(),
        },
        { onConflict: 'statement_transaction_id,receipt_id' },
      )
      .select('*')
      .single()

    if (mappingError || !mapping) {
      return NextResponse.json({ error: mappingError?.message || 'Failed to save receipt mapping' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      mapping,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create receipt mapping' },
      { status: 500 },
    )
  }
}
