import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { getAuthenticatedHouseholdContext } from '@/lib/server/household-context'

const TERMINAL_STATUSES = ['settled', 'written_off']
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['partial', 'settled', 'written_off'],
  partial: ['settled', 'written_off'],
  settled: [],
  written_off: [],
}

export async function PATCH(
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
    const { data: existing, error: fetchErr } = await supabase
      .from('advances')
      .select('id, household_id, status')
      .eq('id', id)
      .eq('household_id', ctx.householdId)
      .maybeSingle()

    if (fetchErr) throw fetchErr
    if (!existing) return NextResponse.json({ error: 'Advance not found' }, { status: 404 })

    // Validate status transition if status is being updated
    if (body?.status !== undefined) {
      const newStatus = String(body.status)
      const allowed = VALID_TRANSITIONS[existing.status] ?? []
      if (!allowed.includes(newStatus)) {
        return NextResponse.json(
          {
            error: `Cannot transition from '${existing.status}' to '${newStatus}'. ${
              TERMINAL_STATUSES.includes(existing.status)
                ? 'This advance is already in a terminal state.'
                : `Allowed: ${allowed.join(', ')}.`
            }`,
          },
          { status: 400 },
        )
      }
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body?.due_date !== undefined) updates.due_date = body.due_date || null
    if (body?.payment_mode !== undefined) updates.payment_mode = body.payment_mode || null
    if (body?.notes !== undefined) updates.notes = body.notes || null
    if (body?.expected_recovery_amount !== undefined) {
      const amt = Number(body.expected_recovery_amount)
      if (amt > 0) updates.expected_recovery_amount = amt
    }
    if (body?.status !== undefined) {
      updates.status = body.status
      if (body.status === 'written_off') {
        updates.writeoff_date = body.writeoff_date ?? new Date().toISOString().split('T')[0]
        updates.writeoff_reason = body.writeoff_reason ?? null
      }
    }
    if (body?.writeoff_date !== undefined) updates.writeoff_date = body.writeoff_date
    if (body?.writeoff_reason !== undefined) updates.writeoff_reason = body.writeoff_reason
    if (body?.statement_transaction_id !== undefined) {
      updates.statement_transaction_id = body.statement_transaction_id || null
    }

    const { data, error } = await supabase
      .from('advances')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        counterparties(id, name, relationship, phone, counterparty_type),
        advance_repayments(id, amount, repayment_date, event_type, statement_transaction_id, method, notes)
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ advance: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update advance' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthenticatedHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const supabase = createServiceSupabaseClient()

    // Verify advance belongs to household
    const { data: existing, error: fetchErr } = await supabase
      .from('advances')
      .select('id, household_id, status, ledger_entry_id')
      .eq('id', id)
      .eq('household_id', ctx.householdId)
      .maybeSingle()

    if (fetchErr) throw fetchErr
    if (!existing) return NextResponse.json({ error: 'Advance not found' }, { status: 404 })

    if (existing.status !== 'pending') {
      return NextResponse.json(
        { error: 'Only pending advances with no repayments can be deleted' },
        { status: 400 },
      )
    }

    // Check for existing repayments
    const { count: repaymentCount } = await supabase
      .from('advance_repayments')
      .select('id', { count: 'exact', head: true })
      .eq('advance_id', id)

    if (repaymentCount && repaymentCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete an advance with recorded repayments' },
        { status: 400 },
      )
    }

    // Delete advance first (FK constraint), then ledger entry
    const { error: delAdvErr } = await supabase.from('advances').delete().eq('id', id)
    if (delAdvErr) throw delAdvErr

    const { error: delLeErr } = await supabase
      .from('ledger_entries')
      .delete()
      .eq('id', existing.ledger_entry_id)
    if (delLeErr) throw delLeErr

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete advance' },
      { status: 500 },
    )
  }
}
