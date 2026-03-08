import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'
import {
  buildPropagationPreview,
  resolveCategorySelectionForPreview,
} from '@/lib/server/statement-propagation'

type ImportStagingRow = Database['public']['Tables']['import_staging']['Row']

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ importId: string }> }
) {
  try {
    const { importId } = await params
    const supabase = await createServerSupabaseClient()
    const serviceSupabase = createServiceSupabaseClient()
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

    const { data: fileImport } = await supabase
      .from('file_imports')
      .select('id, status')
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
    const rowId = typeof body.rowId === 'string' ? body.rowId : null
    const fields = (body.fields || {}) as {
      categoryId?: number | null
      newCategoryName?: string | null
      newCategoryGroupName?: string | null
      txn_type?: string
    }

    if (!rowId) {
      return NextResponse.json({ error: 'rowId is required' }, { status: 400 })
    }

    const { data: sourceRow } = await supabase
      .from('import_staging')
      .select('*')
      .eq('id', rowId)
      .eq('file_import_id', importId)
      .single()

    if (!sourceRow) {
      return NextResponse.json({ error: 'Row not found' }, { status: 404 })
    }

    const effectiveTxnType = fields.txn_type ?? sourceRow.txn_type
    const resolvedCategory = await resolveCategorySelectionForPreview(
      serviceSupabase,
      fields.categoryId,
      fields.newCategoryName,
      fields.newCategoryGroupName,
      effectiveTxnType,
    )

    if (resolvedCategory === undefined) {
      return NextResponse.json({
        sourceRow: null,
        resolvedCategory: undefined,
        preselectedTargets: [],
        optionalTargets: [],
        excludedTargets: [],
      })
    }

    const { data: candidateRows } = await supabase
      .from('import_staging')
      .select('*')
      .eq('file_import_id', importId)
      .neq('id', rowId)

    const preview = buildPropagationPreview({
      sourceRow: sourceRow as ImportStagingRow,
      candidateRows: ((candidateRows ?? []) as ImportStagingRow[]),
      category: resolvedCategory,
    })

    const originalData = (sourceRow.original_data || {}) as Record<string, unknown>

    return NextResponse.json({
      sourceRow: {
        rowId: sourceRow.id,
        rowIndex: sourceRow.row_index,
        merchantRaw: sourceRow.merchant_raw,
        txnType: fields.txn_type ?? sourceRow.txn_type,
        amount: Number(sourceRow.amount),
        accountLabel: readString(originalData.matchedAccountName),
        currentCategoryId: typeof originalData.categoryId === 'number' ? originalData.categoryId : null,
        currentCategoryName: readString(originalData.categoryName),
      },
      resolvedCategory: resolvedCategory
        ? {
            id: resolvedCategory.id,
            name: resolvedCategory.name,
            type: resolvedCategory.type,
            group_name: resolvedCategory.group_name,
          }
        : null,
      preselectedTargets: preview.preselectedTargets,
      optionalTargets: preview.optionalTargets,
      excludedTargets: preview.excludedTargets,
    })
  } catch (error) {
    console.error('Failed to preview statement propagation:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to preview propagation' },
      { status: 500 },
    )
  }
}
