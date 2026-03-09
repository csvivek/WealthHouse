import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

type FileImportRow = Database['public']['Tables']['file_imports']['Row']
type ImportStagingRow = Database['public']['Tables']['import_staging']['Row']
type CategoryType = Database['public']['Enums']['category_type']

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function readNumber(value: unknown) {
  return typeof value === 'number' ? value : null
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

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

    const { data: fileImport, error: fiError } = await supabase
      .from('file_imports')
      .select('*')
      .eq('id', importId)
      .eq('household_id', profile.household_id)
      .single()

    if (fiError || !fileImport) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 })
    }

    const [rowsResult, categoriesResult, committedImportsResult] = await Promise.all([
      supabase
        .from('import_staging')
        .select('*')
        .eq('file_import_id', importId)
        .order('row_index', { ascending: true }),
      supabase
        .from('categories')
        .select('id, name, type, group_name, group_id, subgroup_id')
        .order('type', { ascending: true })
        .order('group_name', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('statement_imports')
        .select('id', { count: 'exact' })
        .eq('file_import_id', importId),
    ])

    if (rowsResult.error) {
      return NextResponse.json({ error: 'Failed to fetch staged rows' }, { status: 500 })
    }

    if (categoriesResult.error) {
      return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
    }

    if (committedImportsResult.error) {
      return NextResponse.json({ error: 'Failed to fetch committed import metadata' }, { status: 500 })
    }

    const stagingRows: ImportStagingRow[] = rowsResult.data ?? []
    const committedImportCount = committedImportsResult.count ?? 0
    const hasCommittedVersion = committedImportCount > 0 || stagingRows.some((row) => row.committed_transaction_id)
    const isRevision = fileImport.status === 'in_review' && hasCommittedVersion
    const canReopen = fileImport.status === 'committed' && hasCommittedVersion

    const similarPreviewMap = new Map<string, { count: number; examples: string[] }>()

    for (const row of stagingRows) {
      const originalData = (row.original_data || {}) as Record<string, unknown>
      const similarMerchantKey = readString(originalData.similarMerchantKey)
      if (!similarMerchantKey) continue

      const existing = similarPreviewMap.get(similarMerchantKey) ?? { count: 0, examples: [] }
      existing.count += 1
      if (existing.examples.length < 3 && typeof row.merchant_raw === 'string' && !existing.examples.includes(row.merchant_raw)) {
        existing.examples.push(row.merchant_raw)
      }
      similarPreviewMap.set(similarMerchantKey, existing)
    }

    const stats = {
      total: stagingRows.length,
      pending: stagingRows.filter((row) => row.review_status === 'pending').length,
      approved: stagingRows.filter((row) => row.review_status === 'approved').length,
      rejected: stagingRows.filter((row) => row.review_status === 'rejected').length,
      committed: stagingRows.filter((row) => row.review_status === 'committed').length,
      alreadyImported: stagingRows.filter((row) => row.duplicate_status === 'existing_final').length,
      duplicates: stagingRows.filter((row) => row.duplicate_status === 'within_import').length,
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
        hasCommittedVersion,
        isRevision,
        canReopen,
      },
      categories: (categoriesResult.data ?? []).map((category) => ({
        id: category.id,
        name: category.name,
        type: (category.type as CategoryType | null) ?? 'expense',
        group_name: category.group_name,
        group_id: category.group_id,
        subgroup_id: category.subgroup_id,
      })),
      stats,
      rows: stagingRows.map((row) => {
        const originalData = (row.original_data || {}) as Record<string, unknown>
        const similarMerchantKey = readString(originalData.similarMerchantKey)
        const similarPreview = similarMerchantKey ? similarPreviewMap.get(similarMerchantKey) : null

        return {
          id: row.id,
          rowIndex: row.row_index,
          reviewStatus: row.review_status,
          duplicateStatus: row.duplicate_status,
          flagStatus:
            row.duplicate_status === 'existing_final'
              ? 'already_imported'
              : row.duplicate_status === 'within_import'
                ? 'duplicate_in_file'
                : 'none',
          duplicateTransactionId: row.duplicate_transaction_id,
          committedTransactionId: row.committed_transaction_id,
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
          accountLabel: readString(originalData.matchedAccountName),
          categoryId: readNumber(originalData.categoryId),
          categoryName: readString(originalData.categoryName),
          categoryConfidence: typeof originalData.categoryConfidence === 'number' ? originalData.categoryConfidence : null,
          categoryDecisionSource: readString(originalData.categoryDecisionSource),
          merchantCanonicalName: readString(originalData.merchantCanonicalName),
          merchantBusinessType: readString(originalData.merchantBusinessType),
          merchantAliases: readStringArray(originalData.merchantAliases),
          similarMerchantKey,
          similarMerchantCount: similarPreview ? Math.max(similarPreview.count - 1, 0) : 0,
          similarMerchantExamples: similarPreview?.examples.filter((example) => example !== row.merchant_raw) ?? [],
          searchSummary: readString(originalData.searchSummary),
        }
      }),
    })
  } catch (error) {
    console.error('Failed to fetch import review data:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load review data' },
      { status: 500 }
    )
  }
}
