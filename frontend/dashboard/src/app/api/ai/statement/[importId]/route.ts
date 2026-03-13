import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'
import { resolveEffectivePaymentGroups } from '@/lib/server/category-groups'
import { listTags } from '@/lib/server/tag-service'
import { isStatementLinkingSchemaNotReadyError } from '@/lib/statement-linking/config'

type FileImportRow = Database['public']['Tables']['file_imports']['Row']
type ImportStagingRow = Database['public']['Tables']['import_staging']['Row']
type CategoryType = Database['public']['Enums']['category_type']
type QueryableSupabaseClient = Pick<Awaited<ReturnType<typeof createServerSupabaseClient>>, 'from'>
type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>

interface UploaderProfileSummary {
  id: string
  displayName: string | null
  email: string | null
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function readNumber(value: unknown) {
  return typeof value === 'number' ? value : null
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function readObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readTagSuggestions(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      tagId: typeof item.tagId === 'string' ? item.tagId : null,
      name: typeof item.name === 'string' ? item.name : '',
      confidence: typeof item.confidence === 'number' ? item.confidence : 0,
      reason: typeof item.reason === 'string' ? item.reason : '',
      source: typeof item.source === 'string' ? item.source : 'rule',
    }))
    .filter((item) => item.name.length > 0)
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '')
  }
  return String(error ?? '')
}

function createOptionalEnrichmentClient(
  fallbackClient: Awaited<ReturnType<typeof createServerSupabaseClient>>,
) {
  try {
    return createServiceSupabaseClient() as never
  } catch {
    return fallbackClient as never
  }
}

function createOptionalServiceClient(): ServiceSupabaseClient | null {
  try {
    return createServiceSupabaseClient()
  } catch {
    return null
  }
}

async function loadUploaderProfile(
  supabase: QueryableSupabaseClient,
  serviceSupabase: ServiceSupabaseClient | null,
  uploaderId: string,
  importId: string,
): Promise<UploaderProfileSummary> {
  try {
    const result = await supabase
      .from('user_profiles')
      .select('id, display_name')
      .eq('id', uploaderId)
      .maybeSingle()

    if (result.error || !result.data) {
      if (result.error) {
        console.warn(
          `Statement review uploader metadata unavailable for import ${importId}: ${result.error.message}`,
        )
      }
      return {
        id: uploaderId,
        displayName: null,
        email: null,
      }
    }

    const record = result.data as unknown as Record<string, unknown>
    let email: string | null = null

    if (serviceSupabase) {
      const authResult = await serviceSupabase.auth.admin.getUserById(uploaderId)
      if (authResult.error) {
        console.warn(
          `Statement review uploader metadata unavailable for import ${importId}: ${authResult.error.message}`,
        )
      } else {
        email = authResult.data.user?.email ?? null
      }
    }

    return {
      id: String(record.id ?? uploaderId),
      displayName: typeof record.display_name === 'string' ? record.display_name : null,
      email,
    }
  } catch (error) {
    console.warn(
      `Statement review uploader metadata unavailable for import ${importId}: ${toErrorMessage(error)}`,
    )
    return {
      id: uploaderId,
      displayName: null,
      email: null,
    }
  }
}

async function loadStatementReviewTags(
  supabase: never,
  householdId: string,
  importId: string,
) {
  try {
    const tags = await listTags(supabase, {
      householdId,
      status: 'active',
      sortBy: 'name',
      sortDir: 'asc',
      source: 'all',
    })
    return Array.isArray(tags) ? tags : []
  } catch (error) {
    console.warn(
      `Statement review tags unavailable for import ${importId}: ${toErrorMessage(error)}`,
    )
    return []
  }
}

async function loadCommittedImportCount(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  importId: string,
) {
  try {
    const result = await supabase
      .from('statement_imports')
      .select('id', { count: 'exact' })
      .eq('file_import_id', importId)

    if (result.error) {
      console.warn(
        `Statement review committed import metadata unavailable for import ${importId}: ${result.error.message}`,
      )
      return 0
    }

    return result.count ?? 0
  } catch (error) {
    console.warn(
      `Statement review committed import metadata unavailable for import ${importId}: ${toErrorMessage(error)}`,
    )
    return 0
  }
}

async function loadStatementLinks(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  importId: string,
) {
  try {
    const result = await supabase
      .from('staging_transaction_links')
      .select('*')
      .eq('file_import_id', importId)

    if (result.error) {
      if (isStatementLinkingSchemaNotReadyError(result.error)) {
        return []
      }

      console.warn(
        `Statement review links unavailable for import ${importId}: ${result.error.message}`,
      )
      return []
    }

    return Array.isArray(result.data) ? result.data : []
  } catch (error) {
    if (isStatementLinkingSchemaNotReadyError(error)) {
      return []
    }

    console.warn(
      `Statement review links unavailable for import ${importId}: ${toErrorMessage(error)}`,
    )
    return []
  }
}

async function loadEffectivePaymentGroupMap(
  supabase: never,
  householdId: string,
  importId: string,
  categories: Array<{
    id: number
    name: string
    type: CategoryType | null
    group_name: string | null
  }>,
) {
  if (categories.length === 0) return new Map<number, { id: number | null; name: string; sort_order: number }>()

  try {
    const groups = await resolveEffectivePaymentGroups(
      supabase,
      householdId,
      categories.map((category) => ({
        id: category.id,
        name: category.name,
        type: category.type,
        payment_subtype: category.type === 'income' || category.type === 'transfer' ? category.type : 'expense',
        group_name: category.group_name,
        group_id: null,
        display_order: null,
      })),
    )
    return groups instanceof Map ? groups : new Map<number, { id: number | null; name: string; sort_order: number }>()
  } catch (error) {
    console.warn(
      `Statement review category groups unavailable for import ${importId}: ${toErrorMessage(error)}`,
    )
    return new Map<number, { id: number | null; name: string; sort_order: number }>()
  }
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

    const enrichmentSupabase = createOptionalEnrichmentClient(supabase)
    const serviceSupabase = createOptionalServiceClient()

    const [rowsResult, categoriesResult, committedImportCount, links, tagsResult, uploadedBy] = await Promise.all([
      supabase
        .from('import_staging')
        .select('*')
        .eq('file_import_id', importId)
        .order('row_index', { ascending: true }),
      supabase
        .from('categories')
        .select('id, name, type, group_name')
        .order('type', { ascending: true })
        .order('group_name', { ascending: true })
        .order('name', { ascending: true }),
      loadCommittedImportCount(supabase, importId),
      loadStatementLinks(supabase, importId),
      loadStatementReviewTags(enrichmentSupabase, profile.household_id, importId),
      loadUploaderProfile(enrichmentSupabase, serviceSupabase, fileImport.uploaded_by, importId),
    ])

    const { data: householdAccounts } = await supabase
      .from('accounts')
      .select('id, product_name, nickname, account_type, institutions(name)')
      .eq('household_id', profile.household_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (rowsResult.error) {
      return NextResponse.json({ error: 'Failed to fetch staged rows' }, { status: 500 })
    }

    if (categoriesResult.error) {
      return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
    }

    const stagingRows: ImportStagingRow[] = rowsResult.data ?? []
    const hasCommittedVersion = committedImportCount > 0 || stagingRows.some((row) => row.committed_transaction_id)
    const isRevision = fileImport.status === 'in_review' && hasCommittedVersion
    const canReopen = fileImport.status === 'committed' && hasCommittedVersion
    const rawParseResult = readObject(fileImport.raw_parse_result)
    const parsedAccount = readObject(rawParseResult?.account)
    const cardInfo = readObject(fileImport.card_info_json)
    const matchedAccounts = Array.isArray(rawParseResult?.matched_accounts)
      ? rawParseResult?.matched_accounts
      : Array.isArray(cardInfo?.matchedAccounts)
        ? cardInfo?.matchedAccounts
        : []
    const matchedAccountLabel = matchedAccounts
      .map((entry) => readObject(entry))
      .find((entry) => entry)?.label
    const matchedAccountLabelText = typeof matchedAccountLabel === 'string' ? matchedAccountLabel : null
    const parsedAccountType = readString(parsedAccount?.account_type)
    const parsedInstitutionName = readString(rawParseResult?.institution_name)
    const parsedProductName = readString(parsedAccount?.product_name)
    const parsedIdentifierHint = readString(parsedAccount?.identifier_hint)
    const parsedCardName = readString(parsedAccount?.card_name)
    const parsedCardLast4 = readString(parsedAccount?.card_last4)

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

    const linksByStagingId = new Map<string, Array<{ id: string; fromStagingId: string; toStagingId: string | null; toTransactionId: string | null; linkType: string; linkScore: number; linkReason: Record<string, unknown>; status: string; matchedBy: string; reviewedBy: string | null; reviewedAt: string | null }>>()
    for (const link of links) {
      const key = link.from_staging_id
      const existing = linksByStagingId.get(key) ?? []
      existing.push({
        id: link.id,
        fromStagingId: link.from_staging_id,
        toStagingId: link.to_staging_id,
        toTransactionId: link.to_transaction_id,
        linkType: link.link_type,
        linkScore: Number(link.link_score ?? 0),
        linkReason: link.link_reason ?? {},
        status: link.status,
        matchedBy: link.matched_by,
        reviewedBy: link.reviewed_by,
        reviewedAt: link.reviewed_at,
      })
      linksByStagingId.set(key, existing)
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

    const reviewCategories = (categoriesResult.data ?? []).map((category) => ({
      id: category.id,
      name: category.name,
      type: (category.type as CategoryType | null) ?? null,
      group_name: category.group_name,
    }))

    const effectiveGroups = await loadEffectivePaymentGroupMap(
      enrichmentSupabase,
      profile.household_id,
      importId,
      reviewCategories,
    )

    return NextResponse.json({
      import: {
        id: (fileImport as FileImportRow).id,
        status: fileImport.status,
        fileName: fileImport.file_name,
        institutionCode: fileImport.institution_code,
        institutionName: parsedInstitutionName,
        parsedAccountType,
        parsedProductName,
        parsedIdentifierHint,
        parsedCardName,
        parsedCardLast4,
        matchedAccountLabel: matchedAccountLabelText,
        statementDate: fileImport.statement_date,
        period: {
          start: fileImport.statement_period_start,
          end: fileImport.statement_period_end,
        },
        summary: fileImport.summary_json,
        cardInfo: fileImport.card_info_json,
        currency: fileImport.currency,
        createdAt: fileImport.created_at,
        uploadedBy,
        hasCommittedVersion,
        isRevision,
        canReopen,
      },
      accounts: ((householdAccounts ?? []) as Array<Record<string, unknown>>).map((account) => {
        const institution = readObject(account.institutions)
        const institutionName = readString(institution?.name)
        const label = institutionName
          ? `${institutionName} — ${String(account.nickname ?? account.product_name ?? '')}`
          : String(account.nickname ?? account.product_name ?? '')

        return {
          id: String(account.id),
          label,
          accountType: readString(account.account_type),
          institutionName,
          productName: readString(account.product_name),
          nickname: readString(account.nickname),
        }
      }),
      categories: reviewCategories.map((category) => ({
        id: category.id,
        name: category.name,
        type: (category.type as CategoryType | null) ?? 'expense',
        group_name: effectiveGroups.get(category.id)?.name ?? category.group_name,
        effective_group_id: effectiveGroups.get(category.id)?.id ?? null,
        effective_group_name: effectiveGroups.get(category.id)?.name ?? category.group_name,
        effective_group_sort_order: effectiveGroups.get(category.id)?.sort_order ?? null,
      })),
      stats,
      tags: tagsResult.map((tag) => ({
        id: tag.id,
        name: tag.name,
        color_token: tag.color_token,
        color_hex: tag.color_hex,
        icon_key: tag.icon_key,
        source: tag.source,
      })),
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
          tagIds: readStringArray(originalData.tagIds),
          tagSuggestions: readTagSuggestions(originalData.tagSuggestions),
          similarMerchantKey,
          similarMerchantCount: similarPreview ? Math.max(similarPreview.count - 1, 0) : 0,
          similarMerchantExamples: similarPreview?.examples.filter((example) => example !== row.merchant_raw) ?? [],
          searchSummary: readString(originalData.searchSummary),
          links: (linksByStagingId.get(row.id) ?? []).sort((a, b) => b.linkScore - a.linkScore),
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
