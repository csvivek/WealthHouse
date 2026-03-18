import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { getAuthenticatedHouseholdContext } from '@/lib/server/household-context'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthenticatedHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const supabase = createServiceSupabaseClient()

    // Verify advance belongs to household
    const { data: advance, error: fetchErr } = await supabase
      .from('advances')
      .select('id, household_id, status, expected_recovery_amount')
      .eq('id', id)
      .eq('household_id', ctx.householdId)
      .maybeSingle()

    if (fetchErr) throw fetchErr
    if (!advance) return NextResponse.json({ error: 'Advance not found' }, { status: 404 })

    if (advance.status === 'settled' || advance.status === 'written_off') {
      return NextResponse.json(
        { error: `Cannot record repayment on a ${advance.status} advance` },
        { status: 400 },
      )
    }

    // Validate repayment fields
    const amount = Number(body?.amount)
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
    }
    const repayment_date = String(body?.repayment_date ?? '').trim()
    if (!repayment_date) {
      return NextResponse.json({ error: 'repayment_date is required' }, { status: 400 })
    }
    const event_type = String(body?.event_type ?? 'repayment')
    const validEventTypes = ['recovery', 'repayment', 'adjustment', 'writeoff']
    if (!validEventTypes.includes(event_type)) {
      return NextResponse.json(
        { error: `event_type must be one of: ${validEventTypes.join(', ')}` },
        { status: 400 },
      )
    }

    // Insert repayment
    const { data: repayment, error: repErr } = await supabase
      .from('advance_repayments')
      .insert({
        advance_id: id,
        repayment_date,
        amount,
        event_type: event_type as 'recovery' | 'repayment' | 'adjustment' | 'writeoff',
        method: typeof body?.method === 'string' ? body.method : null,
        statement_transaction_id:
          typeof body?.statement_transaction_id === 'string' ? body.statement_transaction_id : null,
        notes: typeof body?.notes === 'string' ? body.notes : null,
      })
      .select()
      .single()

    if (repErr) throw repErr

    // Recalculate advance status based on all repayments
    const { data: allRepayments, error: allRepErr } = await supabase
      .from('advance_repayments')
      .select('amount, event_type')
      .eq('advance_id', id)

    if (allRepErr) throw allRepErr

    const total_repaid = (allRepayments ?? [])
      .filter(r => r.event_type !== 'writeoff')
      .reduce((s, r) => s + r.amount, 0)

    let newStatus = advance.status
    const statusUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (event_type === 'writeoff') {
      newStatus = 'written_off'
      statusUpdates.status = 'written_off'
      statusUpdates.writeoff_date = repayment_date
      statusUpdates.writeoff_reason = typeof body?.notes === 'string' ? body.notes : null
    } else if (total_repaid >= advance.expected_recovery_amount) {
      newStatus = 'settled'
      statusUpdates.status = 'settled'
    } else if (total_repaid > 0) {
      newStatus = 'partial'
      statusUpdates.status = 'partial'
    }

    const { data: updatedAdvance, error: updErr } = await supabase
      .from('advances')
      .update(statusUpdates)
      .eq('id', id)
      .select(`
        *,
        counterparties(id, name, relationship, phone, counterparty_type),
        advance_repayments(id, amount, repayment_date, event_type, method, notes)
      `)
      .single()

    if (updErr) throw updErr

    // Compute stats for the response
    const outstanding_amount = Math.max(0, advance.expected_recovery_amount - total_repaid)

    return NextResponse.json({
      repayment,
      advance: { ...updatedAdvance, total_repaid, outstanding_amount, new_status: newStatus },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to record repayment' },
      { status: 500 },
    )
  }
}
