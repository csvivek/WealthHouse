/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from '@supabase/supabase-js'

type AnyDb = SupabaseClient<any>

export interface TagRow {
  id: string
  household_id: string
  name: string
  normalized_name: string
  color_token: string | null
  color_hex: string | null
  icon_key: string | null
  description: string | null
  source: 'default' | 'member' | 'custom' | 'system'
  source_member_id: string | null
  is_active: boolean
  merged_into_tag_id: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface TagListRow extends TagRow {
  statement_mapped_count: number
  receipt_mapped_count: number
  total_mapped_count: number
}

export interface TagListFilters {
  householdId: string
  search?: string
  source?: 'all' | 'default' | 'member' | 'custom' | 'system'
  status?: 'all' | 'active' | 'inactive'
  sortBy?: 'name' | 'created_at' | 'usage_count'
  sortDir?: 'asc' | 'desc'
}

export interface BulkTagMutationResult {
  added?: number
  removed?: number
  skipped_existing?: number
  affected_transactions: number
}

export interface TagTransactionSuggestion {
  tagId: string | null
  name: string
  confidence: number
  reason: string
  source: string
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}

export function normalizeTagName(name: string) {
  return normalizeName(name).toLowerCase()
}

export function dedupeTagIds(tagIds: string[]) {
  return Array.from(new Set(tagIds.filter((value) => typeof value === 'string' && value.trim().length > 0)))
}

async function mapCounts(
  db: AnyDb,
  table: 'statement_transaction_tags' | 'receipt_tags',
  householdId: string,
) {
  const { data, error } = await db
    .from(table)
    .select('tag_id')
    .eq('household_id', householdId)

  if (error) throw new Error(error.message)

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const tagId = typeof row.tag_id === 'string' ? row.tag_id : null
    if (!tagId) continue
    counts.set(tagId, (counts.get(tagId) ?? 0) + 1)
  }
  return counts
}

async function assertStatementTransactionsOwned(db: AnyDb, householdId: string, transactionIds: string[]) {
  if (transactionIds.length === 0) return
  const { data, error } = await db
    .from('statement_transactions')
    .select('id, account_id')
    .in('id', transactionIds)

  if (error) throw new Error(error.message)
  if ((data ?? []).length !== transactionIds.length) {
    throw new Error('One or more statement transactions were not found.')
  }

  const accountIds = Array.from(new Set((data ?? []).map((row) => row.account_id).filter(Boolean)))
  const { data: accounts, error: accountsError } = await db
    .from('accounts')
    .select('id, household_id')
    .in('id', accountIds)

  if (accountsError) throw new Error(accountsError.message)

  const householdByAccountId = new Map((accounts ?? []).map((row) => [row.id, row.household_id]))
  for (const row of data ?? []) {
    if (householdByAccountId.get(row.account_id) !== householdId) {
      throw new Error('Statement transaction does not belong to this household.')
    }
  }
}

async function assertReceiptsOwned(db: AnyDb, householdId: string, receiptIds: string[]) {
  if (receiptIds.length === 0) return
  const { data, error } = await db
    .from('receipts')
    .select('id, household_id')
    .in('id', receiptIds)

  if (error) throw new Error(error.message)
  if ((data ?? []).length !== receiptIds.length) {
    throw new Error('One or more receipts were not found.')
  }
  for (const row of data ?? []) {
    if (row.household_id !== householdId) {
      throw new Error('Receipt does not belong to this household.')
    }
  }
}

export async function validateTagOwnership(db: AnyDb, householdId: string, tagIds: string[]) {
  const uniqueTagIds = dedupeTagIds(tagIds)
  if (uniqueTagIds.length === 0) return [] as TagRow[]

  const { data, error } = await db
    .from('tags')
    .select('*')
    .eq('household_id', householdId)
    .eq('is_active', true)
    .in('id', uniqueTagIds)

  if (error) throw new Error(error.message)
  if ((data ?? []).length !== uniqueTagIds.length) {
    throw new Error('One or more tags do not belong to this household.')
  }

  return (data ?? []) as TagRow[]
}

export async function listTags(db: AnyDb, filters: TagListFilters): Promise<TagListRow[]> {
  let query = db
    .from('tags')
    .select('*')
    .eq('household_id', filters.householdId)

  const status = filters.status ?? 'active'
  if (status === 'active') query = query.eq('is_active', true)
  if (status === 'inactive') query = query.eq('is_active', false)
  if (filters.source && filters.source !== 'all') query = query.eq('source', filters.source)
  if (filters.search?.trim()) query = query.ilike('name', `%${filters.search.trim()}%`)

  const sortBy = filters.sortBy ?? 'name'
  const sortDir = filters.sortDir ?? 'asc'
  query = query.order(sortBy === 'usage_count' ? 'name' : sortBy, { ascending: sortDir === 'asc' })

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const [statementCounts, receiptCounts] = await Promise.all([
    mapCounts(db, 'statement_transaction_tags', filters.householdId),
    mapCounts(db, 'receipt_tags', filters.householdId),
  ])

  const rows = ((data ?? []) as TagRow[]).map((row) => {
    const statement_mapped_count = statementCounts.get(row.id) ?? 0
    const receipt_mapped_count = receiptCounts.get(row.id) ?? 0
    return {
      ...row,
      statement_mapped_count,
      receipt_mapped_count,
      total_mapped_count: statement_mapped_count + receipt_mapped_count,
    }
  })

  if (sortBy === 'usage_count') {
    rows.sort((left, right) => {
      const direction = sortDir === 'asc' ? 1 : -1
      if (left.total_mapped_count !== right.total_mapped_count) {
        return (left.total_mapped_count - right.total_mapped_count) * direction
      }
      return left.name.localeCompare(right.name) * direction
    })
  }

  return rows
}

export async function getTagById(db: AnyDb, householdId: string, tagId: string) {
  const { data, error } = await db
    .from('tags')
    .select('*')
    .eq('household_id', householdId)
    .eq('id', tagId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as TagRow | null) ?? null
}

export async function createTag(params: {
  db: AnyDb
  householdId: string
  actorUserId?: string | null
  name: string
  color_token?: string | null
  color_hex?: string | null
  icon_key?: string | null
  description?: string | null
  source?: TagRow['source']
  source_member_id?: string | null
}) {
  const name = normalizeName(params.name)
  if (!name) throw new Error('Tag name is required.')

  const { data, error } = await params.db
    .from('tags')
    .insert({
      household_id: params.householdId,
      name,
      normalized_name: normalizeTagName(name),
      color_token: params.color_token ?? 'slate',
      color_hex: params.color_hex ?? null,
      icon_key: params.icon_key ?? 'tag',
      description: params.description ?? null,
      source: params.source ?? 'custom',
      source_member_id: params.source_member_id ?? null,
      created_by: params.actorUserId ?? null,
      updated_by: params.actorUserId ?? null,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') throw new Error('A tag with this name already exists.')
    throw new Error(error.message)
  }

  return data as TagRow
}

export async function updateTag(params: {
  db: AnyDb
  householdId: string
  tagId: string
  actorUserId?: string | null
  name?: string
  color_token?: string | null
  color_hex?: string | null
  icon_key?: string | null
  description?: string | null
}) {
  const existing = await getTagById(params.db, params.householdId, params.tagId)
  if (!existing) throw new Error('Tag not found.')

  const nextName = params.name ? normalizeName(params.name) : existing.name
  if (!nextName) throw new Error('Tag name is required.')

  const { data, error } = await params.db
    .from('tags')
    .update({
      name: nextName,
      normalized_name: normalizeTagName(nextName),
      color_token: params.color_token ?? existing.color_token ?? 'slate',
      color_hex: params.color_hex === undefined ? existing.color_hex : params.color_hex,
      icon_key: params.icon_key ?? existing.icon_key ?? 'tag',
      description: params.description === undefined ? existing.description : params.description,
      updated_by: params.actorUserId ?? null,
    })
    .eq('household_id', params.householdId)
    .eq('id', params.tagId)
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') throw new Error('A tag with this name already exists.')
    throw new Error(error.message)
  }

  return data as TagRow
}

export async function deleteTag(params: {
  db: AnyDb
  householdId: string
  tagId: string
  actorUserId?: string | null
}) {
  const { data, error } = await params.db.rpc('delete_tag_safe', {
    p_household_id: params.householdId,
    p_tag_id: params.tagId,
    p_actor_user_id: params.actorUserId ?? null,
  })
  if (error) throw new Error(error.message)
  return data as { householdId: string; tagId: string; statementDetached: number; receiptDetached: number }
}

export async function mergeTags(params: {
  db: AnyDb
  householdId: string
  survivorTagId: string
  victimTagId: string
  actorUserId?: string | null
}) {
  const { data, error } = await params.db.rpc('merge_tag_safe', {
    p_household_id: params.householdId,
    p_survivor_id: params.survivorTagId,
    p_victim_id: params.victimTagId,
    p_actor_user_id: params.actorUserId ?? null,
  })
  if (error) throw new Error(error.message)
  return data as {
    householdId: string
    survivorId: string
    victimId: string
    statementAdded: number
    receiptAdded: number
    statementDetached: number
    receiptDetached: number
  }
}

async function listMappedTagIds(
  db: AnyDb,
  table: 'statement_transaction_tags' | 'receipt_tags',
  idColumn: 'statement_transaction_id' | 'receipt_id',
  transactionId: string,
) {
  const { data, error } = await db
    .from(table)
    .select('tag_id')
    .eq(idColumn, transactionId)

  if (error) throw new Error(error.message)
  return (data ?? [])
    .map((row) => (typeof row.tag_id === 'string' ? row.tag_id : null))
    .filter((value): value is string => Boolean(value))
}

export async function getStatementTransactionTags(db: AnyDb, householdId: string, transactionId: string) {
  await assertStatementTransactionsOwned(db, householdId, [transactionId])
  const { data, error } = await db
    .from('statement_transaction_tags')
    .select('tag:tags(*)')
    .eq('household_id', householdId)
    .eq('statement_transaction_id', transactionId)

  if (error) throw new Error(error.message)
  return (data ?? [])
    .map((row) => row.tag as TagRow | TagRow[] | null)
    .flatMap((tag) => (Array.isArray(tag) ? tag : tag ? [tag] : []))
    .filter((tag) => tag.is_active)
}

export async function getReceiptTags(db: AnyDb, householdId: string, receiptId: string) {
  await assertReceiptsOwned(db, householdId, [receiptId])
  const { data, error } = await db
    .from('receipt_tags')
    .select('tag:tags(*)')
    .eq('household_id', householdId)
    .eq('receipt_id', receiptId)

  if (error) throw new Error(error.message)
  return (data ?? [])
    .map((row) => row.tag as TagRow | TagRow[] | null)
    .flatMap((tag) => (Array.isArray(tag) ? tag : tag ? [tag] : []))
    .filter((tag) => tag.is_active)
}

export async function replaceTagsOnStatementTransaction(params: {
  db: AnyDb
  householdId: string
  transactionId: string
  tagIds: string[]
  actorUserId?: string | null
}) {
  await assertStatementTransactionsOwned(params.db, params.householdId, [params.transactionId])
  const nextIds = dedupeTagIds(params.tagIds)
  await validateTagOwnership(params.db, params.householdId, nextIds)
  const existingIds = await listMappedTagIds(params.db, 'statement_transaction_tags', 'statement_transaction_id', params.transactionId)

  const existingSet = new Set(existingIds)
  const nextSet = new Set(nextIds)
  const toDelete = existingIds.filter((tagId) => !nextSet.has(tagId))
  const toInsert = nextIds.filter((tagId) => !existingSet.has(tagId))

  if (toDelete.length > 0) {
    const { error } = await params.db
      .from('statement_transaction_tags')
      .delete()
      .eq('household_id', params.householdId)
      .eq('statement_transaction_id', params.transactionId)
      .in('tag_id', toDelete)
    if (error) throw new Error(error.message)
  }

  if (toInsert.length > 0) {
    const { error } = await params.db
      .from('statement_transaction_tags')
      .upsert(
        toInsert.map((tagId) => ({
          household_id: params.householdId,
          statement_transaction_id: params.transactionId,
          tag_id: tagId,
          created_by: params.actorUserId ?? null,
        })),
        { onConflict: 'statement_transaction_id,tag_id' },
      )
    if (error) throw new Error(error.message)
  }

  return {
    added: toInsert.length,
    removed: toDelete.length,
    skipped_existing: nextIds.length - toInsert.length,
    affected_transactions: 1,
  } satisfies BulkTagMutationResult
}

export async function replaceTagsOnReceiptTransaction(params: {
  db: AnyDb
  householdId: string
  receiptId: string
  tagIds: string[]
  actorUserId?: string | null
}) {
  await assertReceiptsOwned(params.db, params.householdId, [params.receiptId])
  const nextIds = dedupeTagIds(params.tagIds)
  await validateTagOwnership(params.db, params.householdId, nextIds)
  const existingIds = await listMappedTagIds(params.db, 'receipt_tags', 'receipt_id', params.receiptId)

  const existingSet = new Set(existingIds)
  const nextSet = new Set(nextIds)
  const toDelete = existingIds.filter((tagId) => !nextSet.has(tagId))
  const toInsert = nextIds.filter((tagId) => !existingSet.has(tagId))

  if (toDelete.length > 0) {
    const { error } = await params.db
      .from('receipt_tags')
      .delete()
      .eq('household_id', params.householdId)
      .eq('receipt_id', params.receiptId)
      .in('tag_id', toDelete)
    if (error) throw new Error(error.message)
  }

  if (toInsert.length > 0) {
    const { error } = await params.db
      .from('receipt_tags')
      .upsert(
        toInsert.map((tagId) => ({
          household_id: params.householdId,
          receipt_id: params.receiptId,
          tag_id: tagId,
          created_by: params.actorUserId ?? null,
        })),
        { onConflict: 'receipt_id,tag_id' },
      )
    if (error) throw new Error(error.message)
  }

  return {
    added: toInsert.length,
    removed: toDelete.length,
    skipped_existing: nextIds.length - toInsert.length,
    affected_transactions: 1,
  } satisfies BulkTagMutationResult
}

async function bulkAdd(
  db: AnyDb,
  table: 'statement_transaction_tags' | 'receipt_tags',
  householdId: string,
  idColumn: 'statement_transaction_id' | 'receipt_id',
  transactionIds: string[],
  tagIds: string[],
  actorUserId?: string | null,
) {
  const uniqueTransactionIds = dedupeTagIds(transactionIds)
  const uniqueTagIds = dedupeTagIds(tagIds)

  if (uniqueTransactionIds.length === 0 || uniqueTagIds.length === 0) {
    return { added: 0, skipped_existing: 0, affected_transactions: uniqueTransactionIds.length } satisfies BulkTagMutationResult
  }

  const { data: existing, error: existingError } = await db
    .from(table)
    .select(`${idColumn}, tag_id`)
    .eq('household_id', householdId)
    .in(idColumn, uniqueTransactionIds)
    .in('tag_id', uniqueTagIds)

  if (existingError) throw new Error(existingError.message)

  const existingSet = new Set(
    (existing ?? []).map((row) => {
      const record = row as Record<string, unknown>
      return `${String(record[idColumn])}:${String(record.tag_id)}`
    }),
  )

  const inserts = []
  for (const transactionId of uniqueTransactionIds) {
    for (const tagId of uniqueTagIds) {
      if (existingSet.has(`${transactionId}:${tagId}`)) continue
      inserts.push({
        household_id: householdId,
        [idColumn]: transactionId,
        tag_id: tagId,
        created_by: actorUserId ?? null,
      })
    }
  }

  if (inserts.length > 0) {
    const { error } = await db.from(table).upsert(inserts, { onConflict: `${idColumn},tag_id` })
    if (error) throw new Error(error.message)
  }

  return {
    added: inserts.length,
    skipped_existing: uniqueTransactionIds.length * uniqueTagIds.length - inserts.length,
    affected_transactions: uniqueTransactionIds.length,
  } satisfies BulkTagMutationResult
}

async function bulkRemove(
  db: AnyDb,
  table: 'statement_transaction_tags' | 'receipt_tags',
  householdId: string,
  idColumn: 'statement_transaction_id' | 'receipt_id',
  transactionIds: string[],
  tagIds: string[],
) {
  const uniqueTransactionIds = dedupeTagIds(transactionIds)
  const uniqueTagIds = dedupeTagIds(tagIds)
  if (uniqueTransactionIds.length === 0 || uniqueTagIds.length === 0) {
    return { removed: 0, affected_transactions: uniqueTransactionIds.length } satisfies BulkTagMutationResult
  }

  const { data: existing, error: existingError } = await db
    .from(table)
    .select(`${idColumn}, tag_id`)
    .eq('household_id', householdId)
    .in(idColumn, uniqueTransactionIds)
    .in('tag_id', uniqueTagIds)

  if (existingError) throw new Error(existingError.message)
  const removed = (existing ?? []).length

  if (removed > 0) {
    const { error } = await db
      .from(table)
      .delete()
      .eq('household_id', householdId)
      .in(idColumn, uniqueTransactionIds)
      .in('tag_id', uniqueTagIds)
    if (error) throw new Error(error.message)
  }

  return {
    removed,
    affected_transactions: uniqueTransactionIds.length,
  } satisfies BulkTagMutationResult
}

export async function addTagsToMultipleStatementTransactions(params: {
  db: AnyDb
  householdId: string
  transactionIds: string[]
  tagIds: string[]
  actorUserId?: string | null
}) {
  const transactionIds = dedupeTagIds(params.transactionIds)
  await assertStatementTransactionsOwned(params.db, params.householdId, transactionIds)
  await validateTagOwnership(params.db, params.householdId, params.tagIds)
  return bulkAdd(
    params.db,
    'statement_transaction_tags',
    params.householdId,
    'statement_transaction_id',
    transactionIds,
    params.tagIds,
    params.actorUserId,
  )
}

export async function addTagsToMultipleReceiptTransactions(params: {
  db: AnyDb
  householdId: string
  receiptIds: string[]
  tagIds: string[]
  actorUserId?: string | null
}) {
  const receiptIds = dedupeTagIds(params.receiptIds)
  await assertReceiptsOwned(params.db, params.householdId, receiptIds)
  await validateTagOwnership(params.db, params.householdId, params.tagIds)
  return bulkAdd(
    params.db,
    'receipt_tags',
    params.householdId,
    'receipt_id',
    receiptIds,
    params.tagIds,
    params.actorUserId,
  )
}

export async function removeTagsFromMultipleStatementTransactions(params: {
  db: AnyDb
  householdId: string
  transactionIds: string[]
  tagIds: string[]
}) {
  const transactionIds = dedupeTagIds(params.transactionIds)
  await assertStatementTransactionsOwned(params.db, params.householdId, transactionIds)
  return bulkRemove(
    params.db,
    'statement_transaction_tags',
    params.householdId,
    'statement_transaction_id',
    transactionIds,
    params.tagIds,
  )
}

export async function removeTagsFromMultipleReceiptTransactions(params: {
  db: AnyDb
  householdId: string
  receiptIds: string[]
  tagIds: string[]
}) {
  const receiptIds = dedupeTagIds(params.receiptIds)
  await assertReceiptsOwned(params.db, params.householdId, receiptIds)
  return bulkRemove(
    params.db,
    'receipt_tags',
    params.householdId,
    'receipt_id',
    receiptIds,
    params.tagIds,
  )
}

export async function removeTagFromStatementTransaction(params: {
  db: AnyDb
  householdId: string
  transactionId: string
  tagId: string
}) {
  await assertStatementTransactionsOwned(params.db, params.householdId, [params.transactionId])
  const { error } = await params.db
    .from('statement_transaction_tags')
    .delete()
    .eq('household_id', params.householdId)
    .eq('statement_transaction_id', params.transactionId)
    .eq('tag_id', params.tagId)
  if (error) throw new Error(error.message)
}

export async function removeTagFromReceiptTransaction(params: {
  db: AnyDb
  householdId: string
  receiptId: string
  tagId: string
}) {
  await assertReceiptsOwned(params.db, params.householdId, [params.receiptId])
  const { error } = await params.db
    .from('receipt_tags')
    .delete()
    .eq('household_id', params.householdId)
    .eq('receipt_id', params.receiptId)
    .eq('tag_id', params.tagId)
  if (error) throw new Error(error.message)
}

export async function ensureDefaultTagsForHousehold(db: AnyDb, householdId: string, actorUserId?: string | null) {
  const { error } = await db.rpc('ensure_household_default_tags', {
    p_household_id: householdId,
    p_actor_user_id: actorUserId ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function ensureMemberTagsForHousehold(db: AnyDb, householdId: string, actorUserId?: string | null) {
  const { error } = await db.rpc('ensure_household_member_tags', {
    p_household_id: householdId,
    p_actor_user_id: actorUserId ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function ensureMemberTagForMember(db: AnyDb, memberId: string, actorUserId?: string | null) {
  const { data, error } = await db.rpc('ensure_member_tag_for_member', {
    p_member_id: memberId,
    p_actor_user_id: actorUserId ?? null,
  })
  if (error) throw new Error(error.message)
  return data as string | null
}

export async function searchOrCreateInlineTag(params: {
  db: AnyDb
  householdId: string
  actorUserId?: string | null
  name: string
  color_token?: string | null
  color_hex?: string | null
  icon_key?: string | null
}) {
  const normalized = normalizeTagName(params.name)
  if (!normalized) throw new Error('Tag name is required.')

  const { data, error } = await params.db
    .from('tags')
    .select('*')
    .eq('household_id', params.householdId)
    .eq('normalized_name', normalized)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (data) {
    if (!data.is_active) throw new Error('A deleted tag with this name already exists.')
    return data as TagRow
  }

  return createTag({
    db: params.db,
    householdId: params.householdId,
    actorUserId: params.actorUserId,
    name: params.name,
    color_token: params.color_token,
    color_hex: params.color_hex,
    icon_key: params.icon_key,
    source: 'custom',
  })
}
