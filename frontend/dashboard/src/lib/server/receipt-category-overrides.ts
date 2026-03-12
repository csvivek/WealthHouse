import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { inheritReceiptCategoryGroupMembership } from '@/lib/server/category-groups'

type DbClient = SupabaseClient
type ReceiptCategoryRow = Database['public']['Tables']['receipt_categories']['Row']

const RECEIPT_CATEGORY_COLUMNS = [
  'id',
  'household_id',
  'source_category_id',
  'name',
  'category_family',
  'description',
  'is_active',
  'sort_order',
  'icon_key',
  'color_token',
  'color_hex',
  'created_at',
  'updated_at',
].join(', ')

function toErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim().length > 0) {
      return message
    }
  }
  return fallback
}

async function getHouseholdMaxSortOrder(db: DbClient, householdId: string) {
  const { data, error } = await db
    .from('receipt_categories')
    .select('sort_order')
    .eq('household_id', householdId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)

  const numeric = Number((data as { sort_order?: unknown } | null)?.sort_order)
  return Number.isFinite(numeric) ? numeric : 100
}

async function findHouseholdOverride(db: DbClient, householdId: string, sourceCategoryId: string) {
  const { data, error } = await db
    .from('receipt_categories')
    .select(RECEIPT_CATEGORY_COLUMNS)
    .eq('household_id', householdId)
    .eq('source_category_id', sourceCategoryId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as ReceiptCategoryRow | null) ?? null
}

async function remapHouseholdCategoryUsage(params: {
  db: DbClient
  householdId: string
  sourceCategoryId: string
  targetCategoryId: string
}) {
  if (params.sourceCategoryId === params.targetCategoryId) return

  const { error: transactionUpdateError } = await params.db
    .from('receipt_staging_transactions')
    .update({ receipt_category_id: params.targetCategoryId } as never)
    .eq('household_id', params.householdId)
    .eq('receipt_category_id', params.sourceCategoryId)

  if (transactionUpdateError) {
    throw new Error(transactionUpdateError.message)
  }

  const { error: itemUpdateError } = await params.db
    .from('receipt_staging_items')
    .update({ receipt_category_id: params.targetCategoryId } as never)
    .eq('household_id', params.householdId)
    .eq('receipt_category_id', params.sourceCategoryId)

  if (itemUpdateError) {
    throw new Error(itemUpdateError.message)
  }
}

async function createHouseholdOverride(params: {
  db: DbClient
  householdId: string
  sourceCategory: ReceiptCategoryRow
}) {
  const nextSortOrder = Math.max(await getHouseholdMaxSortOrder(params.db, params.householdId), params.sourceCategory.sort_order) + 10
  const now = new Date().toISOString()

  const { data, error } = await params.db
    .from('receipt_categories')
    .insert({
      household_id: params.householdId,
      source_category_id: params.sourceCategory.id,
      name: params.sourceCategory.name,
      category_family: params.sourceCategory.category_family,
      description: params.sourceCategory.description,
      is_active: params.sourceCategory.is_active,
      sort_order: nextSortOrder,
      icon_key: params.sourceCategory.icon_key,
      color_token: params.sourceCategory.color_token,
      color_hex: params.sourceCategory.color_hex,
      updated_at: now,
    } as never)
    .select(RECEIPT_CATEGORY_COLUMNS)
    .single()

  if (!error && data) return data as unknown as ReceiptCategoryRow

  const duplicateWrite = error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505'
  if (duplicateWrite) {
    const existingOverride = await findHouseholdOverride(params.db, params.householdId, params.sourceCategory.id)
    if (existingOverride) return existingOverride
  }

  throw new Error(toErrorMessage(error, 'Failed to create receipt category override'))
}

export async function getAccessibleReceiptCategory(params: {
  db: DbClient
  householdId: string
  categoryId: string
}) {
  const { data, error } = await params.db
    .from('receipt_categories')
    .select(RECEIPT_CATEGORY_COLUMNS)
    .eq('id', params.categoryId)
    .or(`household_id.is.null,household_id.eq.${params.householdId}`)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as ReceiptCategoryRow | null) ?? null
}

export async function resolveActionableReceiptCategory(params: {
  db: DbClient
  householdId: string
  categoryId: string
}) {
  const category = await getAccessibleReceiptCategory({
    db: params.db,
    householdId: params.householdId,
    categoryId: params.categoryId,
  })

  if (!category) return null
  if (category.household_id === params.householdId) {
    return {
      category,
      sourceCategory: null,
      localized: false,
    }
  }

  if (category.household_id !== null) return null

  const existingOverride = await findHouseholdOverride(params.db, params.householdId, category.id)
  if (existingOverride) {
    return {
      category: existingOverride,
      sourceCategory: category,
      localized: false,
    }
  }

  const override = await createHouseholdOverride({
    db: params.db,
    householdId: params.householdId,
    sourceCategory: category,
  })

  await remapHouseholdCategoryUsage({
    db: params.db,
    householdId: params.householdId,
    sourceCategoryId: category.id,
    targetCategoryId: override.id,
  })

  await inheritReceiptCategoryGroupMembership(params.db as SupabaseClient<Database>, {
    householdId: params.householdId,
    sourceReceiptCategoryId: category.id,
    targetReceiptCategoryId: override.id,
  })

  return {
    category: override,
    sourceCategory: category,
    localized: true,
  }
}
