import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/integrity/audit'

// GET - List quarantined items
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const status = (request.nextUrl.searchParams.get('status') || 'pending') as 'pending' | 'approved' | 'rejected' | 'auto_approved'

    const { data, error } = await supabase
      .from('data_quarantine')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', status)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ items: data })
  } catch (error) {
    console.error('Quarantine fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch quarantine items' }, { status: 500 })
  }
}

// PUT - Approve or reject a quarantined item
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, action, correctedData } = await request.json()

    if (!id || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'id and action (approve/reject) are required' }, { status: 400 })
    }

    // Get the quarantine item
    const { data: item, error: fetchError } = await supabase
      .from('data_quarantine')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !item) {
      return NextResponse.json({ error: 'Quarantine item not found' }, { status: 404 })
    }

    // Update quarantine status
    const { error: updateError } = await supabase
      .from('data_quarantine')
      .update({
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // If rejected, delete the original record
    if (action === 'reject') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: deleteError } = await (supabase as any)
        .from(item.table_name)
        .delete()
        .eq('id', item.record_id)

      if (deleteError) {
        console.error('Failed to delete rejected record:', deleteError)
      }

      // Log the deletion
      await logAudit(supabase, {
        table_name: item.table_name,
        record_id: item.record_id,
        action: 'delete',
        old_data: item.data_snapshot as Record<string, unknown>,
        new_data: null,
        source: 'system',
        user_id: user.id,
      })
    }

    // If approved with corrections, update the original record
    if (action === 'approve' && correctedData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: correctError } = await (supabase as any)
        .from(item.table_name)
        .update(correctedData)
        .eq('id', item.record_id)

      if (correctError) {
        console.error('Failed to apply corrections:', correctError)
      }

      await logAudit(supabase, {
        table_name: item.table_name,
        record_id: item.record_id,
        action: 'update',
        old_data: item.data_snapshot,
        new_data: correctedData,
        source: 'manual',
        user_id: user.id,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Quarantine action error:', error)
    return NextResponse.json({ error: 'Failed to process quarantine action' }, { status: 500 })
  }
}
