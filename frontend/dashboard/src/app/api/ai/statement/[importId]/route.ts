import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

type FileImportRow = Database['public']['Tables']['file_imports']['Row']
type ImportStagingRow = Database['public']['Tables']['import_staging']['Row']

export async function GET(
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

    // Fetch file import
    const { data: fileImport, error: fiError } = await supabase
      .from('file_imports')
      .select('*')
      .eq('id', importId)
      .eq('household_id', profile.household_id)
      .single()

    if (fiError || !fileImport) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 })
    }

    // Fetch all staged rows
    const { data: rows, error: rowsError } = await supabase
      .from('import_staging')
      .select('*')
      .eq('file_import_id', importId)
      .order('row_index', { ascending: true })

    if (rowsError) {
      return NextResponse.json({ error: 'Failed to fetch staged rows' }, { status: 500 })
    }

    const stagingRows: ImportStagingRow[] = rows ?? []

    // Compute stats
    const stats = {
      total: stagingRows.length,
      pending: stagingRows.filter((row) => row.review_status === 'pending').length,
      approved: stagingRows.filter((row) => row.review_status === 'approved').length,
      rejected: stagingRows.filter((row) => row.review_status === 'rejected').length,
      committed: stagingRows.filter((row) => row.review_status === 'committed').length,
      duplicates: stagingRows.filter((row) => row.duplicate_status !== 'none').length,
      debitTotal: stagingRows
        .filter((row) => row.txn_type === 'debit' && row.review_status !== 'rejected')
        .reduce((sum, row) => sum + Number(row.amount), 0),
      creditTotal: stagingRows
        .filter((row) => row.txn_type === 'credit' && row.review_status !== 'rejected')
        .reduce((sum, row) => sum + Number(row.amount), 0),
    }

    return NextResponse.json({
      import: {
        id: (fileImport as FileImportRow).id,
        status: fileImport.status,
        fileName: fileImport.file_name,
        institutionCode: fileImport.institution_code,
        statementDate: fileImport.statement_date,
        period: {
          start: fileImport.statement_period_start,
          end: fileImport.statement_period_end,
        },
        summary: fileImport.summary_json,
        cardInfo: fileImport.card_info_json,
        currency: fileImport.currency,
        createdAt: fileImport.created_at,
      },
      stats,
      rows: stagingRows.map((row) => ({
        id: row.id,
        rowIndex: row.row_index,
        reviewStatus: row.review_status,
        duplicateStatus: row.duplicate_status,
        duplicateTransactionId: row.duplicate_transaction_id,
        isEdited: row.is_edited,
        txnDate: row.txn_date,
        postingDate: row.posting_date,
        merchantRaw: row.merchant_raw,
        description: row.description,
        amount: Number(row.amount),
        txnType: row.txn_type,
        currency: row.currency,
        reference: row.reference,
        originalAmount: row.original_amount ? Number(row.original_amount) : null,
        originalCurrency: row.original_currency,
        originalData: row.original_data,
        reviewNote: row.review_note,
      })),
    })
  } catch (error) {
    console.error('Failed to fetch import review data:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load review data' },
      { status: 500 }
    )
  }
}
