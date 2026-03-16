import { NextResponse } from 'next/server'
import { isStatementStorageSchemaNotReadyError } from '@/lib/statements/config'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { buildStatementOverviewCards, type StatementOverviewFileImport } from '@/lib/statements/overview'

const OVERVIEW_IMPORT_SELECT = 'id, file_name, status, institution_code, statement_date, statement_period_start, statement_period_end, currency, raw_parse_result, summary_json, card_info_json, total_rows, duplicate_rows, storage_bucket, storage_path, created_at'
const OVERVIEW_IMPORT_SELECT_FALLBACK = 'id, file_name, status, institution_code, statement_date, statement_period_start, statement_period_end, currency, raw_parse_result, summary_json, card_info_json, total_rows, duplicate_rows, created_at'

type ImportQueryResult = {
  data: StatementOverviewFileImport[] | null
  error: {
    message?: string | null
    details?: string | null
    code?: string | null
  } | null
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

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

    const loadImports = async (withStorageColumns: boolean) => {
      const query = supabase
        .from('file_imports')
        .select(withStorageColumns ? OVERVIEW_IMPORT_SELECT : OVERVIEW_IMPORT_SELECT_FALLBACK)
        .eq('household_id', profile.household_id)
        .in('status', ['committed', 'in_review'])
        .order('created_at', { ascending: false })
        .limit(50)

      const result = await query as ImportQueryResult
      if (withStorageColumns || result.error || !Array.isArray(result.data)) {
        return result
      }

      return {
        error: result.error,
        data: result.data.map((row) => ({
          ...row,
          storage_bucket: null,
          storage_path: null,
        })),
      } satisfies ImportQueryResult
    }

    let { data: imports, error: importsError } = await loadImports(true)

    if (importsError && isStatementStorageSchemaNotReadyError(importsError, 'file_imports')) {
      const fallbackResult = await loadImports(false)
      imports = fallbackResult.data
      importsError = fallbackResult.error
    }

    if (importsError) {
      return NextResponse.json({ error: importsError.message }, { status: 500 })
    }

    const importRows = imports ?? []
    if (importRows.length === 0) {
      return NextResponse.json({ cards: [] })
    }

    const importIds = importRows.map((row) => row.id)
    const { data: stagingRows, error: stagingError } = await supabase
      .from('import_staging')
      .select('id, file_import_id, row_index, review_status, txn_date, merchant_raw, description, amount, txn_type, currency, original_data')
      .in('file_import_id', importIds)
      .neq('review_status', 'rejected')

    if (stagingError) {
      return NextResponse.json({ error: stagingError.message }, { status: 500 })
    }

    return NextResponse.json({
      cards: buildStatementOverviewCards({
        imports: importRows,
        stagingRows: (stagingRows ?? []) as Parameters<typeof buildStatementOverviewCards>[0]['stagingRows'],
      }),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load statement overview' },
      { status: 500 },
    )
  }
}
