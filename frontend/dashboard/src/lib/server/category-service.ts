import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { resolveDatePeriodRange, type DatePeriod } from '@/lib/date-periods'
import { resolveCategoryStyle } from '@/lib/server/category-style'
import {
  assignDefaultPaymentGroupForCategory,
  assignDefaultReceiptGroupForCategory,
  listCategoryGroups,
  moveCategoriesToGroup,
  resolveEffectivePaymentGroups,
  resolveEffectiveReceiptGroups,
} from '@/lib/server/category-groups'

type CategoryType = Database['public']['Enums']['category_type']
type PaymentSubtype = Database['public']['Enums']['category_payment_subtype']
// Category APIs need to tolerate schema drift while migrations are applied lazily.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any>

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

export interface CategoryListRow {
  id: string | number
  name: string
  type: string | null
  status: 'active' | 'inactive'
  domain: CategoryDomain
  mappedCount: number
  household_id?: string | null
  source_category_id?: string | null
  isGlobal?: boolean
  created_at?: string
  updated_at?: string
  icon_key?: string | null
  color_token?: string | null
  color_hex?: string | null
  group_name?: string | null
  group_id?: number | null
  payment_subtype?: PaymentSubtype | null
  is_archived?: boolean
  is_system?: boolean
  display_order?: number | null
  effective_group_id?: number | null
  effective_group_name?: string | null
  effective_group_sort_order?: number | null
  effective_group_archived?: boolean
  effective_category_sort_order?: number | null
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
    let query = db
      .from('categories')
      .select('id, name, type, payment_subtype, group_name, group_id, display_order, created_at, icon_key, color_token, color_hex, is_archived, is_system')

    if (filters.search?.trim()) {
      query = query.ilike('name', `%${filters.search.trim()}%`)
    }

    if (filters.paymentSubtype && filters.paymentSubtype !== 'all') {
      query = query.eq('type', filters.paymentSubtype)
    }

    query = query.order(sortBy === 'sort_order' ? 'display_order' : sortBy, { ascending: sortDir === 'asc' })
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
    if (start) paymentTxnQuery = paymentTxnQuery.gte('txn_date', start)
    if (end) paymentTxnQuery = paymentTxnQuery.lte('txn_date', end)

    const { data: paymentTxnRows, error: paymentTxnError } = await paymentTxnQuery
    if (paymentTxnError) throw new Error(paymentTxnError.message)

    for (const row of paymentTxnRows ?? []) {
      incrementCount(paymentCountsById, row.category_id as number | null | undefined)
    }

    const rows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      type: (row.type as string | null) ?? null,
      status: (row.is_archived as boolean | undefined) ? 'inactive' : 'active',
      domain: 'payment' as const,
      mappedCount: paymentCountsById.get(String(row.id)) ?? 0,
      household_id: null,
      source_category_id: null,
      isGlobal: false,
      payment_subtype: (row.payment_subtype as PaymentSubtype | null) ?? null,
      is_archived: Boolean(row.is_archived),
      is_system: Boolean(row.is_system),
      display_order: typeof row.display_order === 'number' ? row.display_order : null,
    })) as CategoryListRow[]

    if (!filters.householdId) {
      return rows.map((row) => ({
        ...row,
        effective_group_id: null,
        effective_group_name: typeof row.group_name === 'string' ? row.group_name : null,
        effective_group_sort_order: null,
        effective_group_archived: false,
        effective_category_sort_order: row.display_order ?? null,
      }))
    }

    const effectiveGroups = await resolveEffectivePaymentGroups(
      db,
      filters.householdId,
      rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        type: (row.type as CategoryType | null) ?? null,
        payment_subtype: row.payment_subtype ?? null,
        group_name: typeof row.group_name === 'string' ? row.group_name : null,
        group_id: typeof row.group_id === 'number' ? row.group_id : null,
        display_order: row.display_order ?? null,
      })),
    )

    return rows.map((row) => {
      const effective = effectiveGroups.get(Number(row.id))
      return {
        ...row,
        effective_group_id: effective?.id ?? null,
        effective_group_name: effective?.name ?? null,
        effective_group_sort_order: effective?.sort_order ?? null,
        effective_group_archived: effective?.is_archived ?? false,
        effective_category_sort_order: row.display_order ?? null,
      }
    })
  }

  if (!filters.householdId) throw new Error('householdId is required for receipt category queries')

  let query = db
    .from('receipt_categories')
    .select('id, household_id, source_category_id, name, category_family, sort_order, is_active, created_at, updated_at, description, icon_key, color_token, color_hex')
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
  const list = (data ?? []) as Array<Record<string, unknown>>
  const localizedGlobalIds = new Set(
    list
      .filter((row) => row.household_id === filters.householdId && typeof row.source_category_id === 'string' && row.source_category_id.length > 0)
      .map((row) => String(row.source_category_id)),
  )
  const visibleRows = list.filter((row) => !(row.household_id === null && localizedGlobalIds.has(String(row.id))))

  const receiptCountsById = new Map<string, number>()
  let receiptTxnQuery = db
    .from('receipt_staging_transactions')
    .select('receipt_category_id')
    .eq('household_id', filters.householdId)
    .not('receipt_category_id', 'is', null)

  if (start) receiptTxnQuery = receiptTxnQuery.gte('txn_date', start)
  if (end) receiptTxnQuery = receiptTxnQuery.lte('txn_date', end)

  const { data: receiptTxnRows, error: receiptTxnError } = await receiptTxnQuery
  if (receiptTxnError) throw new Error(receiptTxnError.message)

  for (const row of receiptTxnRows ?? []) {
    incrementCount(receiptCountsById, row.receipt_category_id as string | null | undefined)
  }

  const rows = visibleRows.map((row) => ({
    ...row,
    type: (row.category_family as string | null) ?? null,
    status: row.is_active ? 'active' : 'inactive',
    domain: 'receipt' as const,
    mappedCount: receiptCountsById.get(String(row.id)) ?? 0,
    household_id: typeof row.household_id === 'string' ? row.household_id : null,
    source_category_id: typeof row.source_category_id === 'string' ? row.source_category_id : null,
    isGlobal: row.household_id === null,
    display_order: typeof row.sort_order === 'number' ? row.sort_order : null,
  })) as CategoryListRow[]

  const effectiveGroups = await resolveEffectiveReceiptGroups(
    db,
    filters.householdId,
    rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      category_family: row.type,
      sort_order: row.display_order ?? 0,
    })),
  )

  return rows.map((row) => {
    const effective = effectiveGroups.get(String(row.id))
    return {
      ...row,
      effective_group_id: effective?.id ?? null,
      effective_group_name: effective?.name ?? null,
      effective_group_sort_order: effective?.sort_order ?? null,
      effective_group_archived: effective?.is_archived ?? false,
      effective_category_sort_order: row.display_order ?? null,
    }
  })
}

export async function listGroupedCategories(db: AnyDb, filters: CategoryListFilters) {
  const categories = await listCategories(db, filters)
  if (!filters.householdId) {
    return { categories, groups: [] }
  }

  const groups = await listCategoryGroups(db, {
    domain: filters.domain,
    householdId: filters.householdId,
    includeArchived: filters.status !== 'active',
  })

  const filteredCategories = filters.domain === 'payment' && filters.paymentSubtype !== 'all'
    ? categories.filter((row) => row.type === filters.paymentSubtype)
    : categories

  const sortedGroups = [...groups].sort((left, right) => {
    if ((left.payment_subtype ?? '').localeCompare(right.payment_subtype ?? '') !== 0) {
      return (left.payment_subtype ?? '').localeCompare(right.payment_subtype ?? '')
    }
    if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order
    return left.name.localeCompare(right.name)
  })

  const grouped = sortedGroups.map((group) => ({
    ...group,
    categories: filteredCategories
      .filter((row) => row.effective_group_id === group.id)
      .sort((left, right) => {
        const leftOrder = left.effective_category_sort_order ?? 0
        const rightOrder = right.effective_category_sort_order ?? 0
        if (leftOrder !== rightOrder) return leftOrder - rightOrder
        return left.name.localeCompare(right.name)
      }),
  }))

  const ungrouped = filteredCategories.filter((row) => row.effective_group_id == null)

  return {
    categories: filteredCategories,
    groups: grouped,
    ungrouped,
  }
}

export async function resolveOrCreateReceiptCategory(params: {
  db: AnyDb
  householdId: string
  targetCategoryId?: string | null
  targetCategoryName?: string | null
  createIfMissing?: boolean
  groupId?: number | null
}) {
  const targetCategoryId = params.targetCategoryId?.trim() || null
  const targetName = params.targetCategoryName ? normalizeName(params.targetCategoryName) : null

  const { data: categories, error } = await params.db
    .from('receipt_categories')
    .select('id, household_id, source_category_id, name, category_family, sort_order, is_active, icon_key, color_token, color_hex')
    .or(`household_id.is.null,household_id.eq.${params.householdId}`)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)
  const list = (categories ?? []) as Record<string, unknown>[]

  if (targetCategoryId) {
    const match = list.find((cat) => cat.id === targetCategoryId)
    if (match) {
      if (typeof params.groupId === 'number') {
        await moveCategoriesToGroup(params.db, {
          domain: 'receipt',
          householdId: params.householdId,
          targetGroupId: params.groupId,
          categoryIds: [String(match.id)],
        })
      }
      return { category: match, created: false, categories: list }
    }
  }

  if (!targetName) throw new Error('Missing category id/name')

  const matchByName = list.find((cat) => String(cat.name).trim().toLowerCase() === targetName.toLowerCase())
  if (matchByName) {
    if (typeof params.groupId === 'number') {
      await moveCategoriesToGroup(params.db, {
        domain: 'receipt',
        householdId: params.householdId,
        targetGroupId: params.groupId,
        categoryIds: [String(matchByName.id)],
      })
    }
    return { category: matchByName, created: false, categories: list }
  }

  if (!params.createIfMissing) throw new Error(`Receipt category "${targetName}" does not exist.`)

  const maxSort = list
    .filter((cat) => cat.household_id === params.householdId)
    .reduce((acc, cat) => Math.max(acc, Number(cat.sort_order) || 0), 100)
  const inferredStyle = resolveCategoryStyle({ name: targetName })

  const { data: created, error: createError } = await params.db
    .from('receipt_categories')
    .insert({
      household_id: params.householdId,
      source_category_id: null,
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
    .select('id, household_id, source_category_id, name, category_family, sort_order, is_active, icon_key, color_token, color_hex')
    .single()

  if (createError || !created) throw new Error(createError?.message || 'Failed to create category')

  if (typeof params.groupId === 'number') {
    await moveCategoriesToGroup(params.db, {
      domain: 'receipt',
      householdId: params.householdId,
      targetGroupId: params.groupId,
      categoryIds: [created.id],
    })
  } else {
    await assignDefaultReceiptGroupForCategory(params.db, {
      householdId: params.householdId,
      receiptCategoryId: created.id,
      categoryName: created.name,
      categoryFamily: created.category_family,
    })
  }

  return { category: created, created: true, categories: [...list, created] }
}

export async function resolveOrCreatePaymentCategory(params: {
  db: AnyDb
  householdId?: string
  categoryId: number | null | undefined
  newCategoryName: string | null | undefined
  groupId?: number | null
  groupName: string | null | undefined
  txnType: string
  explicitType?: CategoryType | null
}) {
  const direction = String(params.txnType).toLowerCase() === 'credit' ? 'credit' : 'debit'
  const normalizedName = params.newCategoryName ? normalizeName(params.newCategoryName) : null

  if (normalizedName) {
    const inferredType: CategoryType =
      params.explicitType === 'income' || params.explicitType === 'expense' || params.explicitType === 'transfer'
        ? params.explicitType
        : direction === 'credit'
          ? 'income'
          : 'expense'
    const { data: existing, error } = await params.db
      .from('categories')
      .select('id, name, type, payment_subtype, group_name, created_at')
      .ilike('name', normalizedName)
      .eq('type', inferredType)
      .limit(1)
      .maybeSingle()

    if (error) throw error
    if (existing) {
      if (params.householdId && typeof params.groupId === 'number') {
        await moveCategoriesToGroup(params.db, {
          domain: 'payment',
          householdId: params.householdId,
          targetGroupId: params.groupId,
          categoryIds: [existing.id],
        })
      } else if (params.householdId) {
        await assignDefaultPaymentGroupForCategory(params.db, {
          householdId: params.householdId,
          categoryId: existing.id,
          categoryName: existing.name,
          categoryType: (existing.payment_subtype as PaymentSubtype | null) ?? (existing.type as PaymentSubtype | null),
          legacyGroupName: existing.group_name,
        })
      }
      return existing
    }

    const { data: created, error: createError } = await params.db
      .from('categories')
      .insert({
        name: normalizedName,
        type: inferredType,
        payment_subtype: inferredType === 'transfer' ? 'transfer' : inferredType,
        group_name: params.groupName || null,
        ...resolveCategoryStyle({ name: normalizedName }),
      })
      .select('id, name, type, payment_subtype, group_name, created_at')
      .single()

    if (createError || !created) throw createError ?? new Error('Failed to create category')

    if (params.householdId && typeof params.groupId === 'number') {
      await moveCategoriesToGroup(params.db, {
        domain: 'payment',
        householdId: params.householdId,
        targetGroupId: params.groupId,
        categoryIds: [created.id],
      })
    } else if (params.householdId) {
      await assignDefaultPaymentGroupForCategory(params.db, {
        householdId: params.householdId,
        categoryId: created.id,
        categoryName: created.name,
        categoryType: (created.payment_subtype as PaymentSubtype | null) ?? (created.type as PaymentSubtype | null),
        legacyGroupName: created.group_name,
      })
    }
    return created
  }

  if (params.categoryId === undefined) return undefined
  if (params.categoryId === null) return null

  const { data: found, error: foundError } = await params.db
    .from('categories')
    .select('id, name, type, payment_subtype, group_name, created_at')
    .eq('id', params.categoryId)
    .single()

  if (foundError || !found) throw foundError ?? new Error('Selected category was not found')

  if (params.householdId && typeof params.groupId === 'number') {
    await moveCategoriesToGroup(params.db, {
      domain: 'payment',
      householdId: params.householdId,
      targetGroupId: params.groupId,
      categoryIds: [found.id],
    })
  } else if (params.householdId) {
    await assignDefaultPaymentGroupForCategory(params.db, {
      householdId: params.householdId,
      categoryId: found.id,
      categoryName: found.name,
      categoryType: (found.payment_subtype as PaymentSubtype | null) ?? (found.type as PaymentSubtype | null),
      legacyGroupName: found.group_name,
    })
  }

  return found
}
