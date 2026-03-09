import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { resolveOrCreatePaymentCategory } from '@/lib/server/category-service'

type CategoryType = Database['public']['Enums']['category_type']
type ImportStagingRow = Database['public']['Tables']['import_staging']['Row']

interface CategoryLookupRow {
  id: number
  name: string
  type: CategoryType | null
  group_name: string | null
  group_id: number | null
  subgroup_id: number | null
  created_at: string
}

interface PaymentCategoryResult {
  id: number
  name: string
  type: CategoryType | null
  group_name: string | null
  created_at?: string | null
}

export interface PropagationTarget {
  rowId: string
  rowIndex: number
  merchantRaw: string
  txnType: string
  amount: number
  accountLabel: string | null
  currentCategoryId: number | null
  currentCategoryName: string | null
  proposedCategoryId: number | null
  proposedCategoryName: string | null
  reason: string
  selectedByDefault: boolean
}

export interface PropagationPreviewResult {
  preselectedTargets: PropagationTarget[]
  optionalTargets: PropagationTarget[]
  excludedTargets: PropagationTarget[]
}

export interface ResolvedCategorySelection {
  id: number | null
  name: string
  type: CategoryType | null
  group_name: string | null
  group_id?: number | null
  subgroup_id?: number | null
  created_at?: string
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(value: unknown) {
  return typeof value === 'number' ? value : null
}

export function normalizeTxnDirection(txnType: string | null | undefined): 'credit' | 'debit' {
  return String(txnType).toLowerCase() === 'credit' ? 'credit' : 'debit'
}

export function isCategoryCompatible(txnType: string | null | undefined, categoryType: CategoryType | null): boolean {
  const direction = normalizeTxnDirection(txnType)
  if (direction === 'credit') {
    return categoryType === 'income' || categoryType === 'transfer'
  }

  return categoryType === 'expense' || categoryType === 'transfer' || categoryType == null
}

export function normalizeCategoryName(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed.replace(/\s+/g, ' ') : null
}

export function normalizeMerchantText(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getCanonicalMerchant(row: ImportStagingRow) {
  const originalData = (row.original_data || {}) as Record<string, unknown>
  return normalizeMerchantText(readString(originalData.merchantCanonicalName) || row.merchant_raw)
}

function getSimilarMerchantKey(row: ImportStagingRow) {
  const originalData = (row.original_data || {}) as Record<string, unknown>
  return readString(originalData.similarMerchantKey)
}

function getAccountLabel(row: ImportStagingRow) {
  const originalData = (row.original_data || {}) as Record<string, unknown>
  return readString(originalData.matchedAccountName)
}

function getCurrentCategoryId(row: ImportStagingRow) {
  const originalData = (row.original_data || {}) as Record<string, unknown>
  return readNumber(originalData.categoryId)
}

function getCurrentCategoryName(row: ImportStagingRow) {
  const originalData = (row.original_data || {}) as Record<string, unknown>
  return readString(originalData.categoryName)
}

function buildTarget(
  row: ImportStagingRow,
  category: ResolvedCategorySelection | null,
  reason: string,
  selectedByDefault: boolean,
): PropagationTarget {
  return {
    rowId: row.id,
    rowIndex: row.row_index,
    merchantRaw: row.merchant_raw,
    txnType: row.txn_type,
    amount: Number(row.amount),
    accountLabel: getAccountLabel(row),
    currentCategoryId: getCurrentCategoryId(row),
    currentCategoryName: getCurrentCategoryName(row),
    proposedCategoryId: category?.id ?? null,
    proposedCategoryName: category?.name ?? null,
    reason,
    selectedByDefault,
  }
}

export function buildPropagationPreview(params: {
  sourceRow: ImportStagingRow
  candidateRows: ImportStagingRow[]
  category: ResolvedCategorySelection | null
}) {
  const { sourceRow, candidateRows, category } = params
  const sourceDirection = normalizeTxnDirection(sourceRow.txn_type)
  const sourceMerchant = normalizeMerchantText(sourceRow.merchant_raw)
  const sourceCanonicalMerchant = getCanonicalMerchant(sourceRow)
  const sourceSimilarKey = getSimilarMerchantKey(sourceRow)

  const preview: PropagationPreviewResult = {
    preselectedTargets: [],
    optionalTargets: [],
    excludedTargets: [],
  }

  for (const row of candidateRows) {
    if (row.id === sourceRow.id) continue

    const rowDirection = normalizeTxnDirection(row.txn_type)
    const sameDirection = rowDirection === sourceDirection
    const rowMerchant = normalizeMerchantText(row.merchant_raw)
    const rowCanonicalMerchant = getCanonicalMerchant(row)
    const rowSimilarKey = getSimilarMerchantKey(row)
    const sameExactMerchant = Boolean(sourceMerchant) && Boolean(rowMerchant) && sourceMerchant === rowMerchant
    const sameCanonicalMerchant = Boolean(sourceCanonicalMerchant) && Boolean(rowCanonicalMerchant) && sourceCanonicalMerchant === rowCanonicalMerchant
    const sameFamily = Boolean(sourceSimilarKey) && Boolean(rowSimilarKey) && sourceSimilarKey === rowSimilarKey
    const related = sameExactMerchant || sameCanonicalMerchant || sameFamily

    if (!related) continue

    if (category && !isCategoryCompatible(row.txn_type, category.type)) {
      preview.excludedTargets.push(
        buildTarget(
          row,
          category,
          sameDirection
            ? 'Excluded because the selected category is not valid for this row.'
            : 'Excluded because this row is the opposite transaction direction.',
          false,
        ),
      )
      continue
    }

    if (!sameDirection) {
      preview.excludedTargets.push(
        buildTarget(row, category, 'Excluded because this row is the opposite transaction direction.', false),
      )
      continue
    }

    if (sameExactMerchant || sameCanonicalMerchant) {
      preview.preselectedTargets.push(
        buildTarget(row, category, 'Preselected because it is the same merchant and transaction direction.', true),
      )
      continue
    }

    preview.optionalTargets.push(
      buildTarget(row, category, 'Related by merchant family, but not an exact merchant match.', false),
    )
  }

  return preview
}

async function fetchCategoryLookupById(
  serviceSupabase: SupabaseClient<Database>,
  categoryId: number,
): Promise<ResolvedCategorySelection> {
  const { data, error } = await serviceSupabase
    .from('categories')
    .select('id, name, type, group_name, group_id, subgroup_id, created_at')
    .eq('id', categoryId)
    .single()

  if (error || !data) {
    throw error ?? new Error('Selected category was not found')
  }

  const category = data as CategoryLookupRow
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    group_name: category.group_name,
    group_id: category.group_id,
    subgroup_id: category.subgroup_id,
    created_at: category.created_at,
  }
}

export async function resolveCategorySelectionForSave(
  serviceSupabase: SupabaseClient<Database>,
  categoryId: number | null | undefined,
  newCategoryName: string | null | undefined,
  newCategoryGroupName: string | null | undefined,
  txnType: string,
): Promise<ResolvedCategorySelection | null | undefined> {
  const normalizedNewCategoryName = normalizeCategoryName(newCategoryName)
  const normalizedGroupName = normalizeCategoryName(newCategoryGroupName)
  const direction = normalizeTxnDirection(txnType)

  const category = await resolveOrCreatePaymentCategory({
    db: serviceSupabase,
    categoryId,
    newCategoryName: normalizedNewCategoryName,
    groupName: normalizedGroupName,
    txnType,
  }) as PaymentCategoryResult | null | undefined

  if (category === undefined) {
    return undefined
  }

  if (category === null) {
    return null
  }

  if (!isCategoryCompatible(txnType, category.type)) {
    throw new Error(
      direction === 'credit'
        ? 'Credit transactions can only use income or transfer categories.'
        : 'Debit transactions can only use expense or transfer categories.',
    )
  }

  return fetchCategoryLookupById(serviceSupabase, category.id)
}

export async function resolveCategorySelectionForPreview(
  serviceSupabase: SupabaseClient<Database>,
  categoryId: number | null | undefined,
  newCategoryName: string | null | undefined,
  newCategoryGroupName: string | null | undefined,
  txnType: string,
): Promise<ResolvedCategorySelection | null | undefined> {
  const normalizedNewCategoryName = normalizeCategoryName(newCategoryName)
  const normalizedGroupName = normalizeCategoryName(newCategoryGroupName)
  const direction = normalizeTxnDirection(txnType)

  if (normalizedNewCategoryName) {
    const previewType: CategoryType = direction === 'credit' ? 'income' : 'expense'
    const { data: existingCategory, error: existingCategoryError } = await serviceSupabase
      .from('categories')
      .select('id, name, type, group_name, group_id, subgroup_id, created_at')
      .ilike('name', normalizedNewCategoryName)
      .eq('type', previewType)
      .limit(1)
      .maybeSingle()

    if (existingCategoryError) {
      throw existingCategoryError
    }

    if (existingCategory) {
      return existingCategory as CategoryLookupRow
    }

    return {
      id: null,
      name: normalizedNewCategoryName,
      type: previewType,
      group_name: normalizedGroupName,
      group_id: null,
      subgroup_id: null,
    }
  }

  const saved = await resolveCategorySelectionForSave(
    serviceSupabase,
    categoryId,
    null,
    null,
    txnType,
  )

  return saved
}
