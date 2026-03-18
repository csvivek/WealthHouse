import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { getAuthenticatedHouseholdContext } from '@/lib/server/household-context'

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthenticatedHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const params = request.nextUrl.searchParams
    const direction = params.get('direction')
    const status = params.get('status')

    const supabase = createServiceSupabaseClient()

    let query = supabase
      .from('advances')
      .select(`
        *,
        counterparties(id, name, relationship, phone, counterparty_type),
        advance_repayments(id, amount, repayment_date, event_type, method, notes)
      `)
      .eq('household_id', ctx.householdId)
      .order('created_at', { ascending: false })

    if (direction && direction !== 'all') {
      query = query.eq('direction', direction)
    }
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, error } = await query
    if (error) throw error

    const today = new Date().toISOString().split('T')[0]

    const advances = (data ?? []).map(adv => {
      const repayments: Array<{ amount: number; event_type: string }> = Array.isArray(adv.advance_repayments)
        ? adv.advance_repayments
        : []
      const total_repaid = repayments
        .filter(r => r.event_type !== 'writeoff')
        .reduce((s, r) => s + (r.amount ?? 0), 0)
      const outstanding_amount = Math.max(0, adv.expected_recovery_amount - total_repaid)
      const createdDate = adv.created_at ? adv.created_at.split('T')[0] : today
      const days_outstanding = Math.floor(
        (new Date(today).getTime() - new Date(createdDate).getTime()) / 86400000,
      )
      return { ...adv, total_repaid, outstanding_amount, days_outstanding }
    })

    // Summary stats
    const openStatuses = ['pending', 'partial']
    const open = advances.filter(a => openStatuses.includes(a.status))
    const summary = {
      open_given: open
        .filter(a => a.direction === 'given')
        .reduce((s, a) => s + a.outstanding_amount, 0),
      open_taken: open
        .filter(a => a.direction === 'taken')
        .reduce((s, a) => s + a.outstanding_amount, 0),
      overdue_count: open.filter(a => a.due_date && a.due_date < today).length,
      writeoff_eligible_count: open.filter(a => a.days_outstanding > 365).length,
    }

    return NextResponse.json({ advances, summary })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list advances' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthenticatedHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()

    // Validate required fields
    const direction = body?.direction as 'given' | 'taken' | undefined
    if (!direction || !['given', 'taken'].includes(direction)) {
      return NextResponse.json({ error: 'direction is required (given or taken)' }, { status: 400 })
    }
    const amount = Number(body?.amount)
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
    }
    const advance_date = String(body?.advance_date ?? '').trim()
    if (!advance_date) {
      return NextResponse.json({ error: 'advance_date is required' }, { status: 400 })
    }

    const supabase = createServiceSupabaseClient()

    // Step 1: Resolve or create counterparty
    let counterparty_id = typeof body?.counterparty_id === 'string' ? body.counterparty_id : null

    if (!counterparty_id) {
      const counterparty_name = String(body?.counterparty_name ?? '').trim()
      if (!counterparty_name) {
        return NextResponse.json(
          { error: 'Either counterparty_id or counterparty_name is required' },
          { status: 400 },
        )
      }
      const { data: newCp, error: cpErr } = await supabase
        .from('counterparties')
        .insert({
          household_id: ctx.householdId,
          name: counterparty_name,
          relationship: typeof body?.counterparty_relationship === 'string' ? body.counterparty_relationship : null,
        })
        .select('id')
        .single()
      if (cpErr) throw cpErr
      counterparty_id = newCp.id
    } else {
      // Verify counterparty belongs to household
      const { data: cp } = await supabase
        .from('counterparties')
        .select('id')
        .eq('id', counterparty_id)
        .or(`household_id.eq.${ctx.householdId},household_id.is.null`)
        .maybeSingle()
      if (!cp) {
        return NextResponse.json({ error: 'Counterparty not found' }, { status: 404 })
      }
    }

    // Step 2: Look up an appropriate category for advances
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .or('name.ilike.%advance%,name.ilike.%personal loan%,name.ilike.%loan repayment%')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (!category) {
      // Fall back to any transfer-type category
      const { data: fallbackCat } = await supabase
        .from('categories')
        .select('id')
        .eq('type', 'transfer')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      if (!fallbackCat) {
        return NextResponse.json(
          { error: 'No suitable category found for advances. Please create an "Advance" or transfer category first.' },
          { status: 422 },
        )
      }
    }

    const category_id = category
      ? category.id
      : (
          await supabase
            .from('categories')
            .select('id')
            .eq('type', 'transfer')
            .eq('is_active', true)
            .limit(1)
            .single()
        ).data?.id

    if (!category_id) {
      return NextResponse.json(
        { error: 'No suitable category found for advances. Please create an "Advance" category first.' },
        { status: 422 },
      )
    }

    // Step 3: Create ledger entry
    const currency = typeof body?.currency === 'string' ? body.currency : 'SGD'
    const { data: ledgerEntry, error: leErr } = await supabase
      .from('ledger_entries')
      .insert({
        entry_date: advance_date,
        category_id,
        amount,
        currency,
        source_priority: 'manual',
        notes: typeof body?.notes === 'string' ? body.notes : null,
      })
      .select('id')
      .single()
    if (leErr) throw leErr

    // Step 4: Create advance record
    const { data: advance, error: advErr } = await supabase
      .from('advances')
      .insert({
        household_id: ctx.householdId,
        ledger_entry_id: ledgerEntry.id,
        counterparty_id,
        direction,
        is_recoverable: direction === 'given',
        expected_recovery_amount: amount,
        status: 'pending',
        payment_mode: typeof body?.payment_mode === 'string' ? body.payment_mode : null,
        is_cash_advance: body?.is_cash_advance === true,
        due_date: typeof body?.due_date === 'string' ? body.due_date : null,
        notes: typeof body?.notes === 'string' ? body.notes : null,
      })
      .select(`
        *,
        counterparties(id, name, relationship, phone, counterparty_type),
        advance_repayments(id, amount, repayment_date, event_type, method, notes)
      `)
      .single()
    if (advErr) throw advErr

    return NextResponse.json({ advance })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create advance' },
      { status: 500 },
    )
  }
}
