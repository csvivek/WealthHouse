import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { resolveDatePeriodRange, type DatePeriod } from '@/lib/date-periods'
import { resolveCategoryStyle } from '@/lib/server/category-style'

type CategoryType = Database['public']['Enums']['category_type']

type AnyDb = SupabaseClient

export type CategoryDomain = 'payment' | 'receipt'

export interface CategoryListFilters {
  domain: CategoryDomain
  householdId?: string
  search?: string
  status?: 'all' | 'active' | 'inactive'
  paymentSubtype?: 'all' | 'expense' | 'transfer' | 'income'
  period?: DatePeriod
  sortBy?: 'name' | 'created_at' | 'type' | 'sort_order'
  sortDir?: 'asc' | 'desc'
}

interface CategoryListRow {
  id: string | number
  name: string
  type: string | null
  status: 'active' | 'inactive'
  domain: CategoryDomain
  mappedCount: number
  created_at?: string
  updated_at?: string
  icon_key?: string | null
  color_token?: string | null
  color_hex?: string | null
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, ' ').slice(0, 80)
}

function incrementCount(map: Map<string, number>, key: string | number | null | undefined) {
  if (key === null || key === undefined) return
  const normalized = String(key)
  map.set(normalized, (map.get(normalized) ?? 0) + 1)
}

export async function listCategories(db: AnyDb, filters: CategoryListFilters) {
  const sortBy = filters.sortBy ?? 'name'
  const sortDir = filters.sortDir ?? 'asc'
  const period = filters.period ?? 'all_history'
  const { start, end } = resolveDatePeriodRange(period)

  if (filters.domain === 'payment') {
    let query = db.from('categories').select('id, name, type, group_name, created_at, icon_key, color_token, color_hex')

    if (filters.search?.trim()) {
      query = query.ilike('name', `%${filters.search.trim()}%`)
    }

    if (filters.paymentSubtype && filters.paymentSubtype !== 'all') {
      query = query.eq('type', filters.paymentSubtype)
    }

    query = query.order(sortBy === 'sort_order' ? 'name' : sortBy, { ascending: sortDir === 'asc' })
    const { data, error } = await query
    if (error) throw new Error(error.message)

    const paymentCountsById = new Map<string, number>()
    let paymentTxnQuery = db
      .from('statement_transactions')
      .select('category_id, account_id')
      .not('category_id', 'is', null)

    if (filters.householdId) {
      const { data: householdAccounts, error: householdAccountsError } = await db
        .from('accounts')
        .select('id')
        .eq('household_id', filters.householdId)

      if (householdAccountsError) throw new Error(householdAccountsError.message)

      const accountIds = (householdAccounts ?? [])
        .map((account) => (account as { id?: string | null }).id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)

      if (accountIds.length === 0) {
        paymentTxnQuery = paymentTxnQuery.eq('account_id', '__no_matching_household_accounts__')
      } else {
        paymentTxnQuery = paymentTxnQuery.in('account_id', accountIds)
      }
    }
    if (start) {
      paymentTxnQuery = paymentTxnQuery.gte('txn_date', start)
    }
    if (end) {
      paymentTxnQuery = paymentTxnQuery.lte('txn_date', end)
    }

    const { data: paymentTxnRows, error: paymentTxnError } = await paymentTxnQuery
    if (paymentTxnError) throw new Error(paymentTxnError.message)

    for (const row of paymentTxnRows ?? []) {
      incrementCount(paymentCountsById, row.category_id as number | null | undefined)
    }

    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      type: (row.type as string | null) ?? null,
      status: 'active' as const,
      domain: 'payment' as const,
      mappedCount: paymentCountsById.get(String(row.id)) ?? 0,
    })) as CategoryListRow[]
  }

  if (!filters.householdId) throw new Error('householdId is required for receipt category queries')

  let query = db
    .from('receipt_categories')
    .select('id, household_id, name, category_family, sort_order, is_active, created_at, updated_at, description, icon_key, color_token, color_hex')
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

  const receiptCountsById = new Map<string, number>()
  let receiptTxnQuery = db
    .from('receipt_staging_transactions')
    .select('receipt_category_id')
    .eq('household_id', filters.householdId)
    .not('receipt_category_id', 'is', null)

  if (start) {
    receiptTxnQuery = receiptTxnQuery.gte('txn_date', start)
  }
  if (end) {
    receiptTxnQuery = receiptTxnQuery.lte('txn_date', end)
  }

  const { data: receiptTxnRows, error: receiptTxnError } = await receiptTxnQuery
  if (receiptTxnError) throw new Error(receiptTxnError.message)

  for (const row of receiptTxnRows ?? []) {
    incrementCount(receiptCountsById, row.receipt_category_id as string | null | undefined)
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    type: (row.category_family as string | null) ?? null,
    status: row.is_active ? 'active' : 'inactive',
    domain: 'receipt' as const,
    mappedCount: receiptCountsById.get(String(row.id)) ?? 0,
  })) as CategoryListRow[]
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
    .select('id, household_id, name, category_family, sort_order, is_active, icon_key, color_token, color_hex')
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
  const inferredStyle = resolveCategoryStyle({ name: targetName })

  const { data: created, error: createError } = await params.db
    .from('receipt_categories')
    .insert({
      household_id: params.householdId,
      name: targetName,
      category_family: 'custom',
      icon_key: inferredStyle.icon_key,
      color_token: inferredStyle.color_token,
      color_hex: null,
      sort_order: maxSort + 10,
      is_active: true,
      description: 'Created from receipt category workflow.',
      updated_at: new Date().toISOString(),
    })
    .select('id, household_id, name, category_family, sort_order, is_active, icon_key, color_token, color_hex')
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
      .insert({
        name: normalizedName,
        type: inferredType,
        group_name: params.groupName || null,
        ...resolveCategoryStyle({ name: normalizedName }),
      })
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
