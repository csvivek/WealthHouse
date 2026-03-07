import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import * as crypto from 'crypto'
import type { Database } from '@/types/database'

type FileImportUpdate = Database['public']['Tables']['file_imports']['Update']
type ImportStagingUpdate = Database['public']['Tables']['import_staging']['Update']
type ApprovalLogInsert = Database['public']['Tables']['approval_log']['Insert']

function computeTxnHash(
  accountId: string,
  txnDate: string,
  postingDate: string | undefined,
  amount: number,
  currency: string,
  merchantRaw: string,
  reference: string | undefined
): string {
  const input = [
    accountId,
    txnDate,
    postingDate ?? '',
    String(amount),
    currency,
    merchantRaw.trim().toLowerCase(),
    reference ?? '',
  ].join('|')
  return crypto.createHash('sha256').update(input).digest('hex')
}

interface RowUpdate {
  id: string
  fields?: {
    txn_date?: string
    posting_date?: string | null
    merchant_raw?: string
    description?: string | null
    amount?: number
    txn_type?: string
    currency?: string
    reference?: string | null
    review_note?: string | null
  }
  reviewStatus?: 'approved' | 'rejected' | 'pending'
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ importId: string }> }
) {
  try {
    const { importId } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

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

    // Validate import ownership
    const { data: fileImport } = await supabase
      .from('file_imports')
      .select('id, account_id, status')
      .eq('id', importId)
      .eq('household_id', profile.household_id)
      .single()

    if (!fileImport) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 })
    }

    if (fileImport.status !== 'in_review') {
      return NextResponse.json({ error: 'Import is not in review state' }, { status: 400 })
    }

    const body = await request.json()
    const updates: RowUpdate[] = body.updates || []
    const bulkRowIds: string[] = body.rowIds || []
    const bulkStatus = body.reviewStatus as RowUpdate['reviewStatus'] | undefined
    const note: string | undefined = body.note

    const results: { id: string; success: boolean; error?: string }[] = []

    // Handle bulk status update
    if (bulkRowIds.length > 0 && bulkStatus) {
      const bulkUpdate: ImportStagingUpdate = {
        review_status: bulkStatus,
        review_note: note || null,
        last_reviewed_by: user.id,
        last_reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const { error: bulkError } = await supabase
        .from('import_staging')
        .update({
          ...bulkUpdate,
        })
        .eq('file_import_id', importId)
        .in('id', bulkRowIds)

      if (bulkError) {
        return NextResponse.json({ error: 'Bulk update failed' }, { status: 500 })
      }

      // Log approval action
      const action = bulkRowIds.length > 1
        ? (bulkStatus === 'approved' ? 'bulk_approve' : 'bulk_reject')
        : (bulkStatus === 'approved' ? 'approve' : 'reject')

      const approvalLog: ApprovalLogInsert = {
        household_id: profile.household_id,
        file_import_id: importId,
        actor_user_id: user.id,
        action,
        new_data: { rowIds: bulkRowIds, reviewStatus: bulkStatus },
        note: note || null,
      }

      await supabase.from('approval_log').insert(approvalLog)

      // Update file import counters
      await updateFileImportCounters(supabase, importId)

      for (const id of bulkRowIds) {
        results.push({ id, success: true })
      }
    }

    // Handle individual row edits
    for (const update of updates) {
      const updateData: ImportStagingUpdate = {
        updated_at: new Date().toISOString(),
        last_reviewed_by: user.id,
        last_reviewed_at: new Date().toISOString(),
      }

      if (update.fields) {
        Object.assign(updateData, update.fields)
        updateData.is_edited = true

        // Recompute txn_hash after field edits
        const { data: currentRow } = await supabase
          .from('import_staging')
          .select('*')
          .eq('id', update.id)
          .eq('file_import_id', importId)
          .single()

        if (currentRow) {
          const newHash = computeTxnHash(
            fileImport.account_id,
            (update.fields.txn_date ?? currentRow.txn_date) as string,
            (update.fields.posting_date !== undefined ? update.fields.posting_date : currentRow.posting_date) as string | undefined,
            update.fields.amount ?? Number(currentRow.amount),
            (update.fields.currency ?? currentRow.currency) as string,
            (update.fields.merchant_raw ?? currentRow.merchant_raw) as string,
            (update.fields.reference !== undefined ? update.fields.reference : currentRow.reference) as string | undefined,
          )
          updateData.txn_hash = newHash

          // Re-check duplicate status
          const { data: existingTxn } = await supabase
            .from('statement_transactions')
            .select('id')
            .eq('account_id', fileImport.account_id)
            .eq('txn_hash', newHash)
            .limit(1)
            .maybeSingle()

          updateData.duplicate_status = existingTxn ? 'existing_final' : 'none'

          // Log edit
          const editLog: ApprovalLogInsert = {
            household_id: profile.household_id,
            file_import_id: importId,
            staging_id: update.id,
            actor_user_id: user.id,
            action: 'edit',
            old_data: currentRow as unknown as Record<string, unknown>,
            new_data: update.fields as unknown as Record<string, unknown>,
            note: note || null,
          }

          await supabase.from('approval_log').insert(editLog)
        }
      }

      if (update.reviewStatus) {
        updateData.review_status = update.reviewStatus
      }

      const { error: updateError } = await supabase
        .from('import_staging')
        .update(updateData)
        .eq('id', update.id)
        .eq('file_import_id', importId)

      results.push({
        id: update.id,
        success: !updateError,
        error: updateError?.message,
      })
    }

    if (updates.length > 0) {
      await updateFileImportCounters(supabase, importId)
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Failed to update staging rows:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update rows' },
      { status: 500 }
    )
  }
}

async function updateFileImportCounters(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  importId: string,
) {
  const { data: rows } = await supabase
    .from('import_staging')
    .select('review_status, duplicate_status')
    .eq('file_import_id', importId)

  if (!rows) return

  const fileImportUpdate: FileImportUpdate = {
      approved_rows: rows.filter((row) => row.review_status === 'approved').length,
      rejected_rows: rows.filter((row) => row.review_status === 'rejected').length,
      duplicate_rows: rows.filter((row) => row.duplicate_status !== 'none').length,
      updated_at: new Date().toISOString(),
    }

  await supabase
    .from('file_imports')
    .update(fileImportUpdate)
    .eq('id', importId)
}
