import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/integrity/audit'
import type { Database } from '@/types/database'

type FileImportUpdate = Database['public']['Tables']['file_imports']['Update']
type ImportStagingUpdate = Database['public']['Tables']['import_staging']['Update']
type ApprovalLogInsert = Database['public']['Tables']['approval_log']['Insert']
type StatementImportInsert = Database['public']['Tables']['statement_imports']['Insert']
type StatementTransactionInsert = Database['public']['Tables']['statement_transactions']['Insert']

export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json()
    const { importId } = body

    if (!importId) {
      return NextResponse.json({ error: 'importId is required' }, { status: 400 })
    }

    // Fetch and lock file import
    const { data: fileImport, error: fiError } = await supabase
      .from('file_imports')
      .select('*')
      .eq('id', importId)
      .eq('household_id', profile.household_id)
      .single()

    if (fiError || !fileImport) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 })
    }

    if (fileImport.status !== 'in_review') {
      return NextResponse.json({ error: `Import is in "${fileImport.status}" state. Only "in_review" imports can be committed.` }, { status: 400 })
    }

    // Update status to committing
    const committingUpdate: FileImportUpdate = {
      status: 'committing',
      updated_at: new Date().toISOString(),
    }

    await supabase
      .from('file_imports')
      .update(committingUpdate)
      .eq('id', importId)

    // Fetch approved rows
    const { data: approvedRows } = await supabase
      .from('import_staging')
      .select('*')
      .eq('file_import_id', importId)
      .eq('review_status', 'approved')
      .order('row_index', { ascending: true })

    if (!approvedRows || approvedRows.length === 0) {
      const emptyCommitUpdate: FileImportUpdate = {
        status: 'committed',
        committed_at: new Date().toISOString(),
        committed_rows: 0,
        updated_at: new Date().toISOString(),
      }

      await supabase
        .from('file_imports')
        .update(emptyCommitUpdate)
        .eq('id', importId)

      return NextResponse.json({
        statementImportId: null,
        committedCount: 0,
        skippedDuplicateCount: 0,
        rejectedCount: fileImport.rejected_rows || 0,
        status: 'committed',
      })
    }

    if (!fileImport.institution_id) {
      await supabase
        .from('file_imports')
        .update({ status: 'in_review', updated_at: new Date().toISOString() })
        .eq('id', importId)

      return NextResponse.json(
        { error: 'File import is missing an institution_id and cannot be committed.' },
        { status: 400 },
      )
    }

    // Create final statement_imports record
    const statementImportInsert: StatementImportInsert = {
      account_id: fileImport.account_id,
      institution_id: fileImport.institution_id,
      file_import_id: fileImport.id,
      statement_period_start: fileImport.statement_period_start,
      statement_period_end: fileImport.statement_period_end,
      statement_name: fileImport.file_name,
      source: 'upload',
      parse_status: 'confirmed',
      parse_confidence: Number(fileImport.parse_confidence) || 0.85,
    }

    const { data: stmtImport, error: stmtError } = await supabase
      .from('statement_imports')
      .insert(statementImportInsert)
      .select('id')
      .single()

    if (stmtError || !stmtImport) {
      await supabase
        .from('file_imports')
        .update({ status: 'in_review', updated_at: new Date().toISOString() })
        .eq('id', importId)
      console.error('Failed to create statement import:', stmtError)
      return NextResponse.json({ error: 'Failed to create statement import record' }, { status: 500 })
    }

    // Insert approved transactions into final table
    let committedCount = 0
    let skippedDuplicateCount = 0

    for (const row of approvedRows ?? []) {
      const transactionInsert: StatementTransactionInsert = {
        statement_import_id: stmtImport.id,
        account_id: fileImport.account_id,
        txn_date: row.txn_date,
        posting_date: row.posting_date,
        merchant_raw: row.merchant_raw,
        description: row.description,
        amount: row.amount,
        txn_type: row.txn_type as Database['public']['Enums']['txn_type'],
        currency: row.currency,
        original_amount: row.original_amount,
        original_currency: row.original_currency,
        txn_hash: row.txn_hash,
        confidence: Number(row.confidence) || 0.85,
      }

      const { data: inserted, error: txnError } = await supabase
        .from('statement_transactions')
        .insert(transactionInsert)
        .select('id')
        .maybeSingle()

      if (txnError) {
        // Unique constraint violation = duplicate, skip
        if (txnError.code === '23505') {
          skippedDuplicateCount++
          const duplicateUpdate: ImportStagingUpdate = {
            review_status: 'rejected',
            duplicate_status: 'existing_final',
            review_note: 'Duplicate detected at commit time',
            updated_at: new Date().toISOString(),
          }

          await supabase
            .from('import_staging')
            .update(duplicateUpdate)
            .eq('id', row.id)
          continue
        }
        console.error('Failed to insert transaction:', txnError)
        continue
      }

      // Mark staging row as committed
      const committedUpdate: ImportStagingUpdate = {
          review_status: 'committed',
          committed_transaction_id: inserted?.id,
          updated_at: new Date().toISOString(),
        }

      await supabase
        .from('import_staging')
        .update(committedUpdate)
        .eq('id', row.id)

      committedCount++
    }

    // Save statement summary if present
    if (fileImport.summary_json && fileImport.card_info_json) {
      const summary = fileImport.summary_json as Record<string, unknown>
      await supabase.from('statement_summaries').insert({
        statement_import_id: stmtImport.id,
        account_id: fileImport.account_id,
        statement_date: fileImport.statement_date ?? new Date().toISOString().split('T')[0],
        credit_limit: summary.credit_limit as number | null,
        minimum_payment: summary.minimum_payment as number | null,
        payment_due_date: summary.payment_due_date as string | null,
        grand_total: summary.grand_total as number | null,
      })
    }

    // Update file import
    const rejectedCount = (await supabase
      .from('import_staging')
      .select('id', { count: 'exact' })
      .eq('file_import_id', importId)
      .eq('review_status', 'rejected')).count || 0

    const committedImportUpdate: FileImportUpdate = {
        status: 'committed',
        committed_statement_import_id: stmtImport.id,
        committed_at: new Date().toISOString(),
        committed_rows: committedCount,
        rejected_rows: rejectedCount,
        updated_at: new Date().toISOString(),
      }

    await supabase
      .from('file_imports')
      .update(committedImportUpdate)
      .eq('id', importId)

    // Log approval
    const approvalLog: ApprovalLogInsert = {
      household_id: profile.household_id,
      file_import_id: importId,
      actor_user_id: user.id,
      action: 'commit',
      new_data: {
        committedCount,
        skippedDuplicateCount,
        rejectedCount,
        statementImportId: stmtImport.id,
      },
    }

    await supabase.from('approval_log').insert(approvalLog)

    // Audit log
    await logAudit(supabase, {
      table_name: 'statement_imports',
      record_id: stmtImport.id,
      action: 'insert',
      new_data: {
        institution_code: fileImport.institution_code,
        transactions_count: committedCount,
        statement_date: fileImport.statement_date,
        file_import_id: importId,
      },
      source: 'statement_import',
      user_id: user.id,
    })

    return NextResponse.json({
      statementImportId: stmtImport.id,
      committedCount,
      skippedDuplicateCount,
      rejectedCount,
      status: 'committed',
    })
  } catch (error) {
    console.error('Commit error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to commit import' },
      { status: 500 }
    )
  }
}
