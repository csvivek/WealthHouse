import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Generated database types lag behind the lazy-migrated group tables during local development.
// Using the client in a relaxed mode keeps the service operable until the next type generation run.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>
type PaymentSubtype = Database['public']['Enums']['category_payment_subtype']
type PaymentCategoryRow = Database['public']['Tables']['categories']['Row']
type ReceiptCategoryRow = Database['public']['Tables']['receipt_categories']['Row']
type PaymentGroupRow = Database['public']['Tables']['payment_category_groups']['Row']
type ReceiptGroupRow = Database['public']['Tables']['receipt_category_groups']['Row']

export type CategoryGroupDomain = 'payment' | 'receipt'

export interface EffectiveCategoryGroup {
  id: number | null
  name: string
  sort_order: number
  is_archived: boolean
  is_system_seeded: boolean
  template_key: string | null
}

export interface CategoryGroupSummary extends EffectiveCategoryGroup {
  domain: CategoryGroupDomain
  household_id: string
  payment_subtype?: PaymentSubtype | null
  description?: string | null
  category_count: number
}

const PAYMENT_GROUP_SEEDS: Record<PaymentSubtype, string[]> = {
  income: ['Salary', 'Investments', 'Refunds & Reimbursements', 'Other Income'],
  expense: [
    'Housing',
    'Bills & Utilities',
    'Groceries',
    'Food & Dining',
    'Transport',
    'Shopping',
    'Children',
    'Education',
    'Health & Wellness',
    'Travel & Lifestyle',
    'Business',
    'Bank Charges',
    'General Household',
    'Other Expense',
  ],
  transfer: ['Transfers', 'Credit Card Payments', 'Other Transfer'],
}

const RECEIPT_GROUP_SEEDS = [
  'Essentials',
  'Dining & Grocery',
  'Travel & Transport',
  'Shopping',
  'Home',
  'Health',
  'Family',
  'Business',
  'Other',
  'Ungrouped',
]

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 80)
}

function normalizeToken(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function titleize(value: string | null | undefined) {
  return normalizeToken(value)
    .split(/[ _-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function buildTemplateKey(domain: CategoryGroupDomain, name: string, subtype?: PaymentSubtype) {
  const normalized = normalizeToken(name).replace(/[^a-z0-9]+/g, '-')
  return subtype ? `${domain}:${subtype}:${normalized}` : `${domain}:${normalized}`
}

function inferPaymentSubtype(category: Pick<PaymentCategoryRow, 'payment_subtype' | 'type'>): PaymentSubtype {
  const value = category.payment_subtype ?? category.type
  if (value === 'income' || value === 'transfer') return value
  return 'expense'
}

function inferPaymentGroupName(
  category: Pick<PaymentCategoryRow, 'name' | 'group_name' | 'payment_subtype' | 'type'>,
  legacyGroupName?: string | null,
) {
  if (category.group_name?.trim()) return normalizeName(category.group_name)
  if (legacyGroupName?.trim()) return normalizeName(legacyGroupName)

  const name = normalizeToken(category.name)
  const subtype = inferPaymentSubtype(category)
  if (subtype === 'income') {
    if (/(salary|payroll|bonus|allowance)/.test(name)) return 'Salary'
    if (/(dividend|interest|investment|brokerage)/.test(name)) return 'Investments'
    if (/(refund|reversal|reimburse)/.test(name)) return 'Refunds & Reimbursements'
    return 'Other Income'
  }

  if (subtype === 'transfer') {
    if (/(credit card|card payment)/.test(name)) return 'Credit Card Payments'
    return 'Transfers'
  }

  if (/(grocery|supermarket|market)/.test(name)) return 'Groceries'
  if (/(dining|food|restaurant|coffee|cafe)/.test(name)) return 'Food & Dining'
  if (/(rent|mortgage|housing|property)/.test(name)) return 'Housing'
  if (/(utility|electric|water|internet|phone|gas)/.test(name)) return 'Bills & Utilities'
  if (/(transport|taxi|mrt|bus|ride|fuel|parking)/.test(name)) return 'Transport'
  if (/(shopping|retail|fashion|gift)/.test(name)) return 'Shopping'
  if (/(kid|child|school|tuition)/.test(name)) return 'Children'
  if (/(health|medical|clinic|pharmacy|fitness|gym)/.test(name)) return 'Health & Wellness'
  if (/(travel|hotel|flight|holiday)/.test(name)) return 'Travel & Lifestyle'
  if (/(business|office|software|subscription|saas)/.test(name)) return 'Business'
  if (/(bank charge|fee|late fee|annual fee|interest charge)/.test(name)) return 'Bank Charges'
  if (/(household|home|laundry|cleaning)/.test(name)) return 'General Household'
  return 'Other Expense'
}

function inferReceiptGroupName(category: Pick<ReceiptCategoryRow, 'name' | 'category_family'>) {
  if (category.category_family?.trim()) {
    const normalized = normalizeToken(category.category_family)
    if (normalized === 'food') return 'Dining & Grocery'
    if (normalized === 'transport') return 'Travel & Transport'
    if (normalized === 'health') return 'Health'
    if (normalized === 'family') return 'Family'
    if (normalized === 'custom') return 'Other'
    return titleize(category.category_family)
  }

  const name = normalizeToken(category.name)
  if (/(grocery|supermarket|market|food|dining|coffee|restaurant)/.test(name)) return 'Dining & Grocery'
  if (/(transport|taxi|mrt|bus|fuel|parking|travel)/.test(name)) return 'Travel & Transport'
  if (/(health|clinic|medical|pharmacy)/.test(name)) return 'Health'
  if (/(child|kid|school|family)/.test(name)) return 'Family'
  if (/(office|business|software)/.test(name)) return 'Business'
  if (/(shopping|retail|fashion)/.test(name)) return 'Shopping'
  if (/(home|household|cleaning|laundry)/.test(name)) return 'Home'
  return 'Ungrouped'
}

async function selectHouseholdPaymentGroups(db: DbClient, householdId: string) {
  const { data, error } = await db
    .from('payment_category_groups')
    .select('*')
    .eq('household_id', householdId)
    .order('payment_subtype', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as PaymentGroupRow[]
}

async function selectHouseholdReceiptGroups(db: DbClient, householdId: string) {
  const { data, error } = await db
    .from('receipt_category_groups')
    .select('*')
    .eq('household_id', householdId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as ReceiptGroupRow[]
}

async function getOrSeedHouseholdPaymentGroups(db: DbClient, householdId: string, actorUserId?: string | null) {
  const existing = await selectHouseholdPaymentGroups(db, householdId)
  if (existing.length > 0) return existing
  return ensureDefaultPaymentGroups(db, householdId, actorUserId)
}

async function getOrSeedHouseholdReceiptGroups(db: DbClient, householdId: string, actorUserId?: string | null) {
  const existing = await selectHouseholdReceiptGroups(db, householdId)
  if (existing.length > 0) return existing
  return ensureDefaultReceiptGroups(db, householdId, actorUserId)
}

export async function ensureDefaultPaymentGroups(db: DbClient, householdId: string, actorUserId?: string | null) {
  const existing = await selectHouseholdPaymentGroups(db, householdId)
  const byTemplate = new Map(existing.map((group) => [group.template_key ?? '', group]))
  const inserts: Database['public']['Tables']['payment_category_groups']['Insert'][] = []

  let sortOrder = 0
  for (const subtype of ['income', 'expense', 'transfer'] as const) {
    for (const name of PAYMENT_GROUP_SEEDS[subtype]) {
      sortOrder += 10
      const templateKey = buildTemplateKey('payment', name, subtype)
      if (byTemplate.has(templateKey)) continue
      inserts.push({
        household_id: householdId,
        name,
        payment_subtype: subtype,
        sort_order: sortOrder,
        is_archived: false,
        is_system_seeded: true,
        template_key: templateKey,
        created_by: actorUserId ?? null,
        updated_by: actorUserId ?? null,
      })
    }
  }

  if (inserts.length > 0) {
    const { error } = await db.from('payment_category_groups').insert(inserts)
    if (error) throw new Error(error.message)
  }

  return selectHouseholdPaymentGroups(db, householdId)
}

export async function ensureDefaultReceiptGroups(db: DbClient, householdId: string, actorUserId?: string | null) {
  const existing = await selectHouseholdReceiptGroups(db, householdId)
  const byTemplate = new Map(existing.map((group) => [group.template_key ?? '', group]))
  const inserts: Database['public']['Tables']['receipt_category_groups']['Insert'][] = []

  let sortOrder = 0
  for (const name of RECEIPT_GROUP_SEEDS) {
    sortOrder += 10
    const templateKey = buildTemplateKey('receipt', name)
    if (byTemplate.has(templateKey)) continue
    inserts.push({
      household_id: householdId,
      name,
      sort_order: sortOrder,
      is_archived: false,
      is_system_seeded: true,
      template_key: templateKey,
      created_by: actorUserId ?? null,
      updated_by: actorUserId ?? null,
    })
  }

  if (inserts.length > 0) {
    const { error } = await db.from('receipt_category_groups').insert(inserts)
    if (error) throw new Error(error.message)
  }

  return selectHouseholdReceiptGroups(db, householdId)
}

async function ensurePaymentGroupByName(
  db: DbClient,
  householdId: string,
  subtype: PaymentSubtype,
  name: string,
  actorUserId?: string | null,
) {
  const groups = await getOrSeedHouseholdPaymentGroups(db, householdId, actorUserId)
  const normalized = normalizeToken(name)
  const existing = groups.find(
    (group) => group.payment_subtype === subtype && normalizeToken(group.name) === normalized,
  )
  if (existing) return existing

  const maxSort = groups
    .filter((group) => group.payment_subtype === subtype)
    .reduce((max, group) => Math.max(max, group.sort_order), 0)

  const { data, error } = await db
    .from('payment_category_groups')
    .insert({
      household_id: householdId,
      name: normalizeName(name),
      payment_subtype: subtype,
      sort_order: maxSort + 10,
      is_archived: false,
      is_system_seeded: false,
      template_key: null,
      created_by: actorUserId ?? null,
      updated_by: actorUserId ?? null,
    })
    .select('*')
    .single()

  if (error || !data) throw new Error(error?.message || 'Failed to create payment category group')
  return data as PaymentGroupRow
}

async function ensureReceiptGroupByName(
  db: DbClient,
  householdId: string,
  name: string,
  actorUserId?: string | null,
) {
  const groups = await getOrSeedHouseholdReceiptGroups(db, householdId, actorUserId)
  const normalized = normalizeToken(name)
  const existing = groups.find((group) => normalizeToken(group.name) === normalized)
  if (existing) return existing

  const maxSort = groups.reduce((max, group) => Math.max(max, group.sort_order), 0)
  const { data, error } = await db
    .from('receipt_category_groups')
    .insert({
      household_id: householdId,
      name: normalizeName(name),
      sort_order: maxSort + 10,
      is_archived: false,
      is_system_seeded: false,
      template_key: null,
      created_by: actorUserId ?? null,
      updated_by: actorUserId ?? null,
    })
    .select('*')
    .single()

  if (error || !data) throw new Error(error?.message || 'Failed to create receipt category group')
  return data as ReceiptGroupRow
}

export async function ensurePaymentCategoryMemberships(
  db: DbClient,
  householdId: string,
  categories: Array<Pick<PaymentCategoryRow, 'id' | 'name' | 'type' | 'payment_subtype' | 'group_name' | 'group_id' | 'display_order'>>,
  actorUserId?: string | null,
) {
  if (categories.length === 0) {
    return {
      groups: await getOrSeedHouseholdPaymentGroups(db, householdId, actorUserId),
      membershipByCategoryId: new Map<number, number>(),
    }
  }

  const { data: membershipRows, error: membershipError } = await db
    .from('payment_category_group_memberships')
    .select('category_id, group_id')
    .eq('household_id', householdId)
    .in('category_id', categories.map((category) => category.id))

  if (membershipError) throw new Error(membershipError.message)
  const membershipByCategoryId = new Map<number, number>((membershipRows ?? []).map((row) => [row.category_id, row.group_id]))

  const legacyGroupIds = Array.from(
    new Set(categories.map((category) => category.group_id).filter((value): value is number => typeof value === 'number')),
  )
  const legacyGroupsById = new Map<number, string>()
  if (legacyGroupIds.length > 0) {
    const { data, error } = await db.from('category_groups').select('id, name').in('id', legacyGroupIds)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      legacyGroupsById.set(row.id, row.name)
    }
  }

  for (const category of categories) {
    if (membershipByCategoryId.has(category.id)) continue
    const subtype = inferPaymentSubtype(category)
    const group = await ensurePaymentGroupByName(
      db,
      householdId,
      subtype,
      inferPaymentGroupName(category, category.group_id ? legacyGroupsById.get(category.group_id) ?? null : null),
      actorUserId,
    )
    const { error } = await db.from('payment_category_group_memberships').upsert({
      household_id: householdId,
      category_id: category.id,
      group_id: group.id,
      sort_order: category.display_order ?? 0,
    })
    if (error) throw new Error(error.message)
    membershipByCategoryId.set(category.id, group.id)
  }

  return {
    groups: await selectHouseholdPaymentGroups(db, householdId),
    membershipByCategoryId,
  }
}

async function listVisibleReceiptCategories(
  db: DbClient,
  householdId: string,
  receiptCategoryIds?: string[],
) {
  let query = db
    .from('receipt_categories')
    .select('id, household_id, source_category_id, name, category_family, description, is_active, sort_order, icon_key, color_token, color_hex, created_at, updated_at')
    .or(`household_id.is.null,household_id.eq.${householdId}`)

  if (receiptCategoryIds && receiptCategoryIds.length > 0) {
    query = query.in('id', receiptCategoryIds)
  }

  const { data, error } = await query.order('sort_order', { ascending: true }).order('name', { ascending: true })
  if (error) throw new Error(error.message)
  const list = (data ?? []) as ReceiptCategoryRow[]
  const localizedGlobalIds = new Set(
    list
      .filter((row) => row.household_id === householdId && typeof row.source_category_id === 'string' && row.source_category_id.length > 0)
      .map((row) => row.source_category_id as string),
  )
  return list.filter((row) => !(row.household_id === null && localizedGlobalIds.has(row.id)))
}

export async function ensureReceiptCategoryMemberships(
  db: DbClient,
  householdId: string,
  receiptCategories?: Array<Pick<ReceiptCategoryRow, 'id' | 'name' | 'category_family' | 'sort_order'>>,
  actorUserId?: string | null,
) {
  const categories = receiptCategories
    ? receiptCategories as ReceiptCategoryRow[]
    : await listVisibleReceiptCategories(db, householdId)

  if (categories.length === 0) {
    return {
      groups: await getOrSeedHouseholdReceiptGroups(db, householdId, actorUserId),
      membershipByCategoryId: new Map<string, number>(),
    }
  }

  const { data: membershipRows, error: membershipError } = await db
    .from('receipt_category_group_memberships')
    .select('receipt_category_id, group_id')
    .eq('household_id', householdId)
    .in('receipt_category_id', categories.map((category) => category.id))

  if (membershipError) throw new Error(membershipError.message)
  const membershipByCategoryId = new Map<string, number>((membershipRows ?? []).map((row) => [row.receipt_category_id, row.group_id]))

  for (const category of categories) {
    if (membershipByCategoryId.has(category.id)) continue
    const group = await ensureReceiptGroupByName(db, householdId, inferReceiptGroupName(category), actorUserId)
    const { error } = await db.from('receipt_category_group_memberships').upsert({
      household_id: householdId,
      receipt_category_id: category.id,
      group_id: group.id,
      sort_order: category.sort_order ?? 0,
    })
    if (error) throw new Error(error.message)
    membershipByCategoryId.set(category.id, group.id)
  }

  return {
    groups: await selectHouseholdReceiptGroups(db, householdId),
    membershipByCategoryId,
  }
}

export async function resolveEffectivePaymentGroups(
  db: DbClient,
  householdId: string,
  categories: Array<Pick<PaymentCategoryRow, 'id' | 'name' | 'type' | 'payment_subtype' | 'group_name' | 'group_id' | 'display_order'>>,
) {
  const { groups, membershipByCategoryId } = await ensurePaymentCategoryMemberships(db, householdId, categories)
  const groupsById = new Map(groups.map((group) => [group.id, group]))
  const fallbackBySubtype = new Map<PaymentSubtype, PaymentGroupRow>()

  for (const group of groups) {
    if (group.is_archived) continue
    if (!fallbackBySubtype.has(group.payment_subtype)) fallbackBySubtype.set(group.payment_subtype, group)
  }

  return new Map(
    categories.map((category) => {
      const subtype = inferPaymentSubtype(category)
      const group = groupsById.get(membershipByCategoryId.get(category.id) ?? -1) ?? fallbackBySubtype.get(subtype)
      const effective: EffectiveCategoryGroup = group
        ? {
            id: group.id,
            name: group.name,
            sort_order: group.sort_order,
            is_archived: group.is_archived,
            is_system_seeded: group.is_system_seeded,
            template_key: group.template_key,
          }
        : {
            id: null,
            name: subtype === 'income' ? 'Other Income' : subtype === 'transfer' ? 'Other Transfer' : 'Other Expense',
            sort_order: 0,
            is_archived: false,
            is_system_seeded: true,
            template_key: null,
          }
      return [category.id, effective]
    }),
  )
}

export async function resolveEffectiveReceiptGroups(
  db: DbClient,
  householdId: string,
  receiptCategories: Array<Pick<ReceiptCategoryRow, 'id' | 'name' | 'category_family' | 'sort_order'>>,
) {
  const { groups, membershipByCategoryId } = await ensureReceiptCategoryMemberships(db, householdId, receiptCategories)
  const groupsById = new Map(groups.map((group) => [group.id, group]))
  const fallback = groups.find((group) => normalizeToken(group.name) === 'ungrouped') ?? groups[0] ?? null

  return new Map(
    receiptCategories.map((category) => {
      const group = groupsById.get(membershipByCategoryId.get(category.id) ?? -1) ?? fallback
      const effective: EffectiveCategoryGroup = group
        ? {
            id: group.id,
            name: group.name,
            sort_order: group.sort_order,
            is_archived: group.is_archived,
            is_system_seeded: group.is_system_seeded,
            template_key: group.template_key,
          }
        : {
            id: null,
            name: 'Ungrouped',
            sort_order: 0,
            is_archived: false,
            is_system_seeded: true,
            template_key: null,
          }
      return [category.id, effective]
    }),
  )
}

export async function listCategoryGroups(
  db: DbClient,
  params: { domain: CategoryGroupDomain; householdId: string; includeArchived?: boolean },
): Promise<CategoryGroupSummary[]> {
  if (params.domain === 'payment') {
    const groups = await selectHouseholdPaymentGroups(db, params.householdId)
    const { data, error } = await db
      .from('payment_category_group_memberships')
      .select('group_id')
      .eq('household_id', params.householdId)

    if (error) throw new Error(error.message)
    const counts = new Map<number, number>()
    for (const row of data ?? []) {
      counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1)
    }

    return groups
      .filter((group) => params.includeArchived || !group.is_archived)
      .map((group) => ({
        id: group.id,
        household_id: group.household_id,
        name: group.name,
        payment_subtype: group.payment_subtype,
        sort_order: group.sort_order,
        is_archived: group.is_archived,
        is_system_seeded: group.is_system_seeded,
        template_key: group.template_key,
        description: group.description,
        category_count: counts.get(group.id) ?? 0,
        domain: 'payment',
      }))
  }

  const groups = await selectHouseholdReceiptGroups(db, params.householdId)
  const { data, error } = await db
    .from('receipt_category_group_memberships')
    .select('group_id')
    .eq('household_id', params.householdId)

  if (error) throw new Error(error.message)
  const counts = new Map<number, number>()
  for (const row of data ?? []) {
    counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1)
  }

  return groups
    .filter((group) => params.includeArchived || !group.is_archived)
    .map((group) => ({
      id: group.id,
      household_id: group.household_id,
      name: group.name,
      sort_order: group.sort_order,
      is_archived: group.is_archived,
      is_system_seeded: group.is_system_seeded,
      template_key: group.template_key,
      description: group.description,
      category_count: counts.get(group.id) ?? 0,
      domain: 'receipt',
    }))
}

export async function createCategoryGroup(
  db: DbClient,
  params: {
    domain: CategoryGroupDomain
    householdId: string
    name: string
    paymentSubtype?: PaymentSubtype | null
    description?: string | null
    actorUserId?: string | null
  },
) {
  const name = normalizeName(params.name)
  if (!name) throw new Error('Group name is required')

  if (params.domain === 'payment') {
    const subtype = params.paymentSubtype ?? 'expense'
    const group = await ensurePaymentGroupByName(db, params.householdId, subtype, name, params.actorUserId)
    if (params.description === undefined) return group

    const { data, error } = await db
      .from('payment_category_groups')
      .update({ description: params.description ?? null, updated_by: params.actorUserId ?? null })
      .eq('id', group.id)
      .select('*')
      .single()

    if (error || !data) throw new Error(error?.message || 'Failed to update group')
    return data as PaymentGroupRow
  }

  const group = await ensureReceiptGroupByName(db, params.householdId, name, params.actorUserId)
  if (params.description === undefined) return group

  const { data, error } = await db
    .from('receipt_category_groups')
    .update({ description: params.description ?? null, updated_by: params.actorUserId ?? null })
    .eq('id', group.id)
    .select('*')
    .single()

  if (error || !data) throw new Error(error?.message || 'Failed to update group')
  return data as ReceiptGroupRow
}

export async function updateCategoryGroup(
  db: DbClient,
  params: {
    domain: CategoryGroupDomain
    householdId: string
    groupId: number
    actorUserId?: string | null
    name?: string
    description?: string | null
    isArchived?: boolean
  },
) {
  const payload: Record<string, unknown> = {
    updated_by: params.actorUserId ?? null,
  }
  if (typeof params.name === 'string') payload.name = normalizeName(params.name)
  if (params.description !== undefined) payload.description = params.description
  if (typeof params.isArchived === 'boolean') payload.is_archived = params.isArchived

  const table = params.domain === 'payment' ? 'payment_category_groups' : 'receipt_category_groups'
  const { data, error } = await db
    .from(table)
    .update(payload as never)
    .eq('id', params.groupId)
    .eq('household_id', params.householdId)
    .select('*')
    .single()

  if (error || !data) throw new Error(error?.message || 'Failed to update group')
  return data
}

export async function reorderCategoryGroups(
  db: DbClient,
  params: { domain: CategoryGroupDomain; householdId: string; groupIds: number[]; actorUserId?: string | null },
) {
  const table = params.domain === 'payment' ? 'payment_category_groups' : 'receipt_category_groups'
  for (const [index, groupId] of params.groupIds.entries()) {
    const { error } = await db
      .from(table)
      .update({ sort_order: (index + 1) * 10, updated_by: params.actorUserId ?? null } as never)
      .eq('id', groupId)
      .eq('household_id', params.householdId)
    if (error) throw new Error(error.message)
  }
}

export async function moveCategoriesToGroup(
  db: DbClient,
  params: {
    domain: CategoryGroupDomain
    householdId: string
    targetGroupId: number
    categoryIds: Array<number | string>
  },
) {
  if (params.categoryIds.length === 0) return

  if (params.domain === 'payment') {
    const { error } = await db.from('payment_category_group_memberships').upsert(
      params.categoryIds.map((categoryId, index) => ({
        household_id: params.householdId,
        category_id: Number(categoryId),
        group_id: params.targetGroupId,
        sort_order: (index + 1) * 10,
      })),
    )
    if (error) throw new Error(error.message)
    return
  }

  const { error } = await db.from('receipt_category_group_memberships').upsert(
    params.categoryIds.map((categoryId, index) => ({
      household_id: params.householdId,
      receipt_category_id: String(categoryId),
      group_id: params.targetGroupId,
      sort_order: (index + 1) * 10,
    })),
  )
  if (error) throw new Error(error.message)
}

export async function reorderGroupMemberships(
  db: DbClient,
  params: {
    domain: CategoryGroupDomain
    householdId: string
    orderedCategoryIds: Array<number | string>
  },
) {
  if (params.domain === 'payment') {
    for (const [index, categoryId] of params.orderedCategoryIds.entries()) {
      const { error } = await db
        .from('payment_category_group_memberships')
        .update({ sort_order: (index + 1) * 10 })
        .eq('household_id', params.householdId)
        .eq('category_id', Number(categoryId))
      if (error) throw new Error(error.message)
    }
    return
  }

  for (const [index, categoryId] of params.orderedCategoryIds.entries()) {
    const { error } = await db
      .from('receipt_category_group_memberships')
      .update({ sort_order: (index + 1) * 10 })
      .eq('household_id', params.householdId)
      .eq('receipt_category_id', String(categoryId))
    if (error) throw new Error(error.message)
  }
}

export async function deleteCategoryGroup(
  db: DbClient,
  params: {
    domain: CategoryGroupDomain
    householdId: string
    groupId: number
    targetGroupId?: number | null
  },
) {
  const membershipTable = params.domain === 'payment' ? 'payment_category_group_memberships' : 'receipt_category_group_memberships'
  const groupTable = params.domain === 'payment' ? 'payment_category_groups' : 'receipt_category_groups'

  const { data: memberships, error: membershipError } = await db
    .from(membershipTable)
    .select('*')
    .eq('household_id', params.householdId)
    .eq('group_id', params.groupId)

  if (membershipError) throw new Error(membershipError.message)
  const count = (memberships ?? []).length
  if (count > 0 && !params.targetGroupId) {
    throw new Error('Group contains categories. Reassign them or archive the group first.')
  }

  if (count > 0 && params.targetGroupId) {
    if (params.domain === 'payment') {
      const rows = (memberships ?? []) as Database['public']['Tables']['payment_category_group_memberships']['Row'][]
      await moveCategoriesToGroup(db, {
        domain: 'payment',
        householdId: params.householdId,
        targetGroupId: params.targetGroupId,
        categoryIds: rows.map((row) => row.category_id),
      })
    } else {
      const rows = (memberships ?? []) as Database['public']['Tables']['receipt_category_group_memberships']['Row'][]
      await moveCategoriesToGroup(db, {
        domain: 'receipt',
        householdId: params.householdId,
        targetGroupId: params.targetGroupId,
        categoryIds: rows.map((row) => row.receipt_category_id),
      })
    }
  }

  const { error } = await db
    .from(groupTable)
    .delete()
    .eq('id', params.groupId)
    .eq('household_id', params.householdId)

  if (error) throw new Error(error.message)
}

export async function assignDefaultPaymentGroupForCategory(
  db: DbClient,
  params: {
    householdId: string
    categoryId: number
    categoryName: string
    categoryType: PaymentSubtype | null | undefined
    legacyGroupName?: string | null
  },
) {
  const subtype = params.categoryType === 'income' || params.categoryType === 'transfer' ? params.categoryType : 'expense'
  const group = await ensurePaymentGroupByName(
    db,
    params.householdId,
    subtype,
    params.legacyGroupName?.trim() || inferPaymentGroupName({
      name: params.categoryName,
      payment_subtype: subtype,
      type: subtype,
      group_name: params.legacyGroupName ?? null,
    }),
  )

  const { error } = await db.from('payment_category_group_memberships').upsert({
    household_id: params.householdId,
    category_id: params.categoryId,
    group_id: group.id,
    sort_order: 0,
  })
  if (error) throw new Error(error.message)
  return group
}

export async function assignDefaultReceiptGroupForCategory(
  db: DbClient,
  params: {
    householdId: string
    receiptCategoryId: string
    categoryName: string
    categoryFamily?: string | null
  },
) {
  const group = await ensureReceiptGroupByName(
    db,
    params.householdId,
    inferReceiptGroupName({
      name: params.categoryName,
      category_family: params.categoryFamily ?? null,
    }),
  )

  const { error } = await db.from('receipt_category_group_memberships').upsert({
    household_id: params.householdId,
    receipt_category_id: params.receiptCategoryId,
    group_id: group.id,
    sort_order: 0,
  })
  if (error) throw new Error(error.message)
  return group
}

export async function inheritReceiptCategoryGroupMembership(
  db: DbClient,
  params: {
    householdId: string
    sourceReceiptCategoryId: string
    targetReceiptCategoryId: string
  },
) {
  const { data, error } = await db
    .from('receipt_category_group_memberships')
    .select('group_id, sort_order')
    .eq('household_id', params.householdId)
    .eq('receipt_category_id', params.sourceReceiptCategoryId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  const { error: upsertError } = await db.from('receipt_category_group_memberships').upsert({
    household_id: params.householdId,
    receipt_category_id: params.targetReceiptCategoryId,
    group_id: data.group_id,
    sort_order: data.sort_order,
  })
  if (upsertError) throw new Error(upsertError.message)
  return data.group_id
}
