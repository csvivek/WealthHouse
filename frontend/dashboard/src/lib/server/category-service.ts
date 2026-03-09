import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type CategoryType = Database['public']['Enums']['category_type']

type AnyDb = SupabaseClient

export type CategoryDomain = 'payment' | 'receipt'

export interface CategoryListFilters {
  domain: CategoryDomain
  householdId?: string
  search?: string
  status?: 'all' | 'active' | 'inactive'
  paymentSubtype?: 'all' | 'expense' | 'transfer' | 'income'
  sortBy?: 'name' | 'created_at' | 'type' | 'sort_order'
  sortDir?: 'asc' | 'desc'
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, ' ').slice(0, 80)
}

export async function listCategories(db: AnyDb, filters: CategoryListFilters) {
  const sortBy = filters.sortBy ?? 'name'
  const sortDir = filters.sortDir ?? 'asc'

  if (filters.domain === 'payment') {
    let query = db.from('categories').select('id, name, type, group_name, created_at')

    if (filters.search?.trim()) {
      query = query.ilike('name', `%${filters.search.trim()}%`)
    }

    if (filters.paymentSubtype && filters.paymentSubtype !== 'all') {
      query = query.eq('type', filters.paymentSubtype)
    }

    query = query.order(sortBy === 'sort_order' ? 'name' : sortBy, { ascending: sortDir === 'asc' })
    const { data, error } = await query
    if (error) throw new Error(error.message)

    return (data ?? []).map((row) => ({ ...row, status: 'active' as const, domain: 'payment' as const }))
  }

  if (!filters.householdId) throw new Error('householdId is required for receipt category queries')

  let query = db
    .from('receipt_categories')
    .select('id, household_id, name, category_family, sort_order, is_active, created_at, updated_at, description')
    .or(`household_id.is.null,household_id.eq.${filters.householdId}`)

  if (filters.search?.trim()) {
    query = query.ilike('name', `%${filters.search.trim()}%`)
  }

  if (filters.status === 'active') query = query.eq('is_active', true)
  if (filters.status === 'inactive') query = query.eq('is_active', false)

  const receiptSort = sortBy === 'type' ? 'category_family' : sortBy
  query = query.order(receiptSort, { ascending: sortDir === 'asc' })

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    ...row,
    type: row.category_family,
    status: row.is_active ? 'active' : 'inactive',
    domain: 'receipt' as const,
  }))
}

export async function resolveOrCreateReceiptCategory(params: {
  db: AnyDb
  householdId: string
  targetCategoryId?: string | null
  targetCategoryName?: string | null
  createIfMissing?: boolean
}) {
  const targetCategoryId = params.targetCategoryId?.trim() || null
  const targetName = params.targetCategoryName ? normalizeName(params.targetCategoryName) : null

  const { data: categories, error } = await params.db
    .from('receipt_categories')
    .select('id, household_id, name, category_family, sort_order, is_active')
    .or(`household_id.is.null,household_id.eq.${params.householdId}`)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)
  const list = (categories ?? []) as Record<string, unknown>[]

  if (targetCategoryId) {
    const match = list.find((cat) => cat.id === targetCategoryId)
    if (match) return { category: match, created: false, categories: list }
  }

  if (!targetName) throw new Error('Missing category id/name')

  const matchByName = list.find((cat) => String(cat.name).trim().toLowerCase() === targetName.toLowerCase())
  if (matchByName) return { category: matchByName, created: false, categories: list }

  if (!params.createIfMissing) throw new Error(`Receipt category "${targetName}" does not exist.`)

  const maxSort = list
    .filter((cat) => cat.household_id === params.householdId)
    .reduce((acc, cat) => Math.max(acc, Number(cat.sort_order) || 0), 100)

  const { data: created, error: createError } = await params.db
    .from('receipt_categories')
    .insert({
      household_id: params.householdId,
      name: targetName,
      category_family: 'custom',
      sort_order: maxSort + 10,
      is_active: true,
      description: 'Created from receipt category workflow.',
      updated_at: new Date().toISOString(),
    })
    .select('id, household_id, name, category_family, sort_order, is_active')
    .single()

  if (createError || !created) throw new Error(createError?.message || 'Failed to create category')

  return { category: created, created: true, categories: [...list, created] }
}

export async function resolveOrCreatePaymentCategory(params: {
  db: AnyDb
  categoryId: number | null | undefined
  newCategoryName: string | null | undefined
  groupName: string | null | undefined
  txnType: string
}) {
  const direction = String(params.txnType).toLowerCase() === 'credit' ? 'credit' : 'debit'
  const normalizedName = params.newCategoryName ? normalizeName(params.newCategoryName) : null

  if (normalizedName) {
    const inferredType: CategoryType = direction === 'credit' ? 'income' : 'expense'
    const { data: existing, error } = await params.db
      .from('categories')
      .select('id, name, type, group_name, created_at')
      .ilike('name', normalizedName)
      .eq('type', inferredType)
      .limit(1)
      .maybeSingle()

    if (error) throw error
    if (existing) return existing

    const { data: created, error: createError } = await params.db
      .from('categories')
      .insert({ name: normalizedName, type: inferredType, group_name: params.groupName || null })
      .select('id, name, type, group_name, created_at')
      .single()

    if (createError || !created) throw createError ?? new Error('Failed to create category')
    return created
  }

  if (params.categoryId === undefined) return undefined
  if (params.categoryId === null) return null

  const { data: found, error: foundError } = await params.db
    .from('categories')
    .select('id, name, type, group_name, created_at')
    .eq('id', params.categoryId)
    .single()

  if (foundError || !found) throw foundError ?? new Error('Selected category was not found')
  return found
}
