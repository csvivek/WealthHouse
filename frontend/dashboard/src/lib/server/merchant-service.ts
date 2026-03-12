import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  deriveMerchantDisplayName,
  normalizeMerchantAlias,
  normalizeMerchantCanonicalName,
} from '@/lib/merchants/normalization'
import { resolveMerchantStyle } from '@/lib/server/merchant-style'

// Merchant support is applied lazily through migrations, so keep DB access tolerant to drift.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any>
type MerchantRow = Database['public']['Tables']['merchants']['Row']
type MerchantAliasRow = Database['public']['Tables']['merchant_aliases']['Row']

export interface MerchantListFilters {
  householdId: string
  search?: string
  status?: 'all' | 'active' | 'inactive'
  sortBy?: 'name' | 'updated_at' | 'alias_count' | 'transaction_count' | 'receipt_count' | 'total_spend'
  sortDir?: 'asc' | 'desc'
}

export interface MerchantListRow {
  id: string
  household_id: string | null
  name: string
  normalized_name: string | null
  icon_key: string
  color_token: string
  color_hex: string | null
  notes: string | null
  is_active: boolean
  merged_into_merchant_id: string | null
  created_at: string
  updated_at: string
  alias_count: number
  transaction_count: number
  receipt_count: number
  ledger_entry_count: number
  total_spend: number
}

export interface MerchantDetail extends MerchantListRow {
  aliases: MerchantAliasSummary[]
}

export interface MerchantAliasSummary {
  id: string
  merchant_id: string
  raw_name: string | null
  normalized_raw_name: string | null
  source_type: string
  confidence: number | null
  created_at: string
  updated_at: string
}

export interface MerchantImpactSummary {
  aliases: number
  statementTransactions: number
  receipts: number
  ledgerEntries: number
  receiptKnowledge: number
  categorizationAudits: number
  groceryPurchases: number
  total: number
}

export interface MerchantBackfillResult {
  createdMerchants: number
  reusedMerchants: number
  updatedTransactions: number
  updatedReceipts: number
  updatedLedgerEntries: number
  aliasesCreated: number
}

export interface MerchantResolutionResult {
  merchant: MerchantRow
  alias: MerchantAliasRow | null
  created: boolean
  matchedBy: 'alias' | 'merchant' | 'created'
  aliasCreated: boolean
}

const MERCHANT_COLUMNS = [
  'id',
  'household_id',
  'name',
  'normalized_name',
  'icon_key',
  'color_token',
  'color_hex',
  'notes',
  'default_category_id',
  'merged_into_merchant_id',
  'is_active',
  'created_by',
  'updated_by',
  'created_at',
  'updated_at',
].join(', ')

const MERCHANT_ALIAS_COLUMNS = [
  'id',
  'household_id',
  'merchant_id',
  'raw_name',
  'normalized_raw_name',
  'source_type',
  'confidence',
  'created_at',
  'updated_at',
].join(', ')

function buildMerchantAliasInsertPayload(params: {
  householdId: string
  merchantId: string
  rawName: string
  normalizedRawName: string
  sourceType?: string | null
  confidence?: number | null
  includeLegacyColumns?: boolean
}) {
  const sourceType = params.sourceType?.trim() || 'manual'
  const confidence = params.confidence ?? null
  const payload: Record<string, unknown> = {
    household_id: params.householdId,
    merchant_id: params.merchantId,
    raw_name: params.rawName,
    normalized_raw_name: params.normalizedRawName,
    source_type: sourceType,
    confidence,
  }

  if (params.includeLegacyColumns) {
    payload.pattern = params.rawName
    payload.source = sourceType
    payload.priority =
      typeof confidence === 'number' && Number.isFinite(confidence)
        ? Math.max(0, Math.min(100, Math.round(confidence * 100)))
        : 100
  }

  return payload
}

function isLegacyMerchantAliasInsertError(error: { message?: string | null } | null) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  return (
    message.includes('null value in column "pattern" of relation "merchant_aliases" violates not-null constraint') ||
    message.includes('null value in column "source" of relation "merchant_aliases" violates not-null constraint') ||
    message.includes('null value in column "priority" of relation "merchant_aliases" violates not-null constraint')
  )
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function normalizeMerchantRow(value: unknown): MerchantRow {
  return value as MerchantRow
}

function normalizeAliasRow(value: unknown): MerchantAliasRow {
  return value as MerchantAliasRow
}

async function getHouseholdAccountIds(db: AnyDb, householdId: string) {
  const { data, error } = await db.from('accounts').select('id').eq('household_id', householdId)
  if (error) throw new Error(error.message)

  return (data ?? [])
    .map((row) => (row as { id?: string | null }).id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

async function fetchMerchant(db: AnyDb, householdId: string, merchantId: string) {
  const { data, error } = await db
    .from('merchants')
    .select(MERCHANT_COLUMNS)
    .eq('id', merchantId)
    .eq('household_id', householdId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? normalizeMerchantRow(data) : null
}

async function loadMerchantStats(db: AnyDb, householdId: string, merchantIds: string[]) {
  const aliasCounts = new Map<string, number>()
  const transactionCounts = new Map<string, number>()
  const receiptCounts = new Map<string, number>()
  const ledgerCounts = new Map<string, number>()
  const spendTotals = new Map<string, number>()

  if (merchantIds.length === 0) {
    return { aliasCounts, transactionCounts, receiptCounts, ledgerCounts, spendTotals }
  }

  const [{ data: aliasRows, error: aliasError }, accountIds] = await Promise.all([
    db.from('merchant_aliases').select('merchant_id').in('merchant_id', merchantIds),
    getHouseholdAccountIds(db, householdId),
  ])

  if (aliasError) throw new Error(aliasError.message)

  for (const row of aliasRows ?? []) {
    const merchantId = (row as { merchant_id?: string | null }).merchant_id
    if (!merchantId) continue
    aliasCounts.set(merchantId, (aliasCounts.get(merchantId) ?? 0) + 1)
  }

  const statementPromise = accountIds.length > 0
    ? db
        .from('statement_transactions')
        .select('merchant_id, amount, txn_type')
        .in('account_id', accountIds)
        .in('merchant_id', merchantIds)
    : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null })

  const receiptPromise = db
    .from('receipts')
    .select('merchant_id, total_amount')
    .eq('household_id', householdId)
    .eq('status', 'confirmed')
    .in('merchant_id', merchantIds)

  const ledgerPromise = db
    .from('ledger_entries')
    .select('merchant_id')
    .in('merchant_id', merchantIds)

  const [statementResult, receiptResult, ledgerResult] = await Promise.all([statementPromise, receiptPromise, ledgerPromise])

  if (statementResult.error) throw new Error(statementResult.error.message)
  if (receiptResult.error) throw new Error(receiptResult.error.message)
  if (ledgerResult.error) throw new Error(ledgerResult.error.message)

  for (const row of statementResult.data ?? []) {
    const merchantId = typeof row.merchant_id === 'string' ? row.merchant_id : null
    if (!merchantId) continue
    transactionCounts.set(merchantId, (transactionCounts.get(merchantId) ?? 0) + 1)
    if (row.txn_type === 'debit') {
      spendTotals.set(merchantId, (spendTotals.get(merchantId) ?? 0) + Math.abs(toNumber(row.amount)))
    }
  }

  for (const row of receiptResult.data ?? []) {
    const merchantId = typeof row.merchant_id === 'string' ? row.merchant_id : null
    if (!merchantId) continue
    receiptCounts.set(merchantId, (receiptCounts.get(merchantId) ?? 0) + 1)
    spendTotals.set(merchantId, (spendTotals.get(merchantId) ?? 0) + Math.abs(toNumber(row.total_amount)))
  }

  for (const row of ledgerResult.data ?? []) {
    const merchantId = typeof row.merchant_id === 'string' ? row.merchant_id : null
    if (!merchantId) continue
    ledgerCounts.set(merchantId, (ledgerCounts.get(merchantId) ?? 0) + 1)
  }

  return { aliasCounts, transactionCounts, receiptCounts, ledgerCounts, spendTotals }
}

function compareValues(left: MerchantListRow, right: MerchantListRow, sortBy: NonNullable<MerchantListFilters['sortBy']>, direction: 1 | -1) {
  if (sortBy === 'updated_at') {
    return left.updated_at.localeCompare(right.updated_at) * direction
  }
  if (sortBy === 'alias_count') {
    return (left.alias_count - right.alias_count) * direction || left.name.localeCompare(right.name)
  }
  if (sortBy === 'transaction_count') {
    return (left.transaction_count - right.transaction_count) * direction || left.name.localeCompare(right.name)
  }
  if (sortBy === 'receipt_count') {
    return (left.receipt_count - right.receipt_count) * direction || left.name.localeCompare(right.name)
  }
  if (sortBy === 'total_spend') {
    return (left.total_spend - right.total_spend) * direction || left.name.localeCompare(right.name)
  }
  return left.name.localeCompare(right.name) * direction
}

export async function listMerchants(db: AnyDb, filters: MerchantListFilters) {
  let query = db.from('merchants').select(MERCHANT_COLUMNS).eq('household_id', filters.householdId)

  if (filters.status === 'active') query = query.eq('is_active', true)
  if (filters.status === 'inactive') query = query.eq('is_active', false)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const merchants = ((data ?? []) as unknown[]).map(normalizeMerchantRow)
  const merchantIds = merchants.map((merchant) => merchant.id)
  const { aliasCounts, transactionCounts, receiptCounts, ledgerCounts, spendTotals } = await loadMerchantStats(
    db,
    filters.householdId,
    merchantIds,
  )

  const aliasesByMerchant = new Map<string, string[]>()
  if (merchantIds.length > 0) {
    const { data: aliasRows, error: aliasError } = await db
      .from('merchant_aliases')
      .select('merchant_id, raw_name, normalized_raw_name')
      .in('merchant_id', merchantIds)
    if (aliasError) throw new Error(aliasError.message)

    for (const row of aliasRows ?? []) {
      const merchantId = typeof row.merchant_id === 'string' ? row.merchant_id : null
      if (!merchantId) continue
      const list = aliasesByMerchant.get(merchantId) ?? []
      if (typeof row.raw_name === 'string' && row.raw_name.trim()) list.push(row.raw_name.toLowerCase())
      if (typeof row.normalized_raw_name === 'string' && row.normalized_raw_name.trim()) list.push(row.normalized_raw_name.toLowerCase())
      aliasesByMerchant.set(merchantId, list)
    }
  }

  const normalizedSearch = filters.search?.trim().toLowerCase() ?? ''
  const rows = merchants
    .map((merchant) => ({
      id: merchant.id,
      household_id: merchant.household_id,
      name: merchant.name,
      normalized_name: merchant.normalized_name,
      icon_key: merchant.icon_key,
      color_token: merchant.color_token,
      color_hex: merchant.color_hex,
      notes: merchant.notes,
      is_active: merchant.is_active,
      merged_into_merchant_id: merchant.merged_into_merchant_id,
      created_at: merchant.created_at,
      updated_at: merchant.updated_at,
      alias_count: aliasCounts.get(merchant.id) ?? 0,
      transaction_count: transactionCounts.get(merchant.id) ?? 0,
      receipt_count: receiptCounts.get(merchant.id) ?? 0,
      ledger_entry_count: ledgerCounts.get(merchant.id) ?? 0,
      total_spend: spendTotals.get(merchant.id) ?? 0,
    }))
    .filter((merchant) => {
      if (!normalizedSearch) return true
      if (merchant.name.toLowerCase().includes(normalizedSearch)) return true
      if ((merchant.normalized_name ?? '').toLowerCase().includes(normalizedSearch)) return true
      return (aliasesByMerchant.get(merchant.id) ?? []).some((alias) => alias.includes(normalizedSearch))
    })

  const sortBy = filters.sortBy ?? 'name'
  const direction = filters.sortDir === 'desc' ? -1 : 1
  rows.sort((left, right) => compareValues(left, right, sortBy, direction))

  return rows
}

export async function getMerchantDetail(db: AnyDb, householdId: string, merchantId: string): Promise<MerchantDetail | null> {
  const merchant = await fetchMerchant(db, householdId, merchantId)
  if (!merchant) return null

  const listRows = await listMerchants(db, {
    householdId,
    status: 'all',
    search: merchant.name,
  })
  const listRow = listRows.find((row) => row.id === merchantId) ?? null

  const { data: aliases, error: aliasError } = await db
    .from('merchant_aliases')
    .select(MERCHANT_ALIAS_COLUMNS)
    .eq('merchant_id', merchantId)
    .eq('household_id', householdId)
    .order('raw_name', { ascending: true })

  if (aliasError) throw new Error(aliasError.message)

  return {
    ...(listRow ?? {
      id: merchant.id,
      household_id: merchant.household_id,
      name: merchant.name,
      normalized_name: merchant.normalized_name,
      icon_key: merchant.icon_key,
      color_token: merchant.color_token,
      color_hex: merchant.color_hex,
      notes: merchant.notes,
      is_active: merchant.is_active,
      merged_into_merchant_id: merchant.merged_into_merchant_id,
      created_at: merchant.created_at,
      updated_at: merchant.updated_at,
      alias_count: 0,
      transaction_count: 0,
      receipt_count: 0,
      ledger_entry_count: 0,
      total_spend: 0,
    }),
    aliases: ((aliases ?? []) as unknown[]).map((alias) => normalizeAliasRow(alias)).map((alias) => ({
      id: alias.id,
      merchant_id: alias.merchant_id,
      raw_name: alias.raw_name,
      normalized_raw_name: alias.normalized_raw_name,
      source_type: alias.source_type,
      confidence: alias.confidence,
      created_at: alias.created_at,
      updated_at: alias.updated_at,
    })),
  }
}

export async function upsertMerchantAlias(params: {
  db: AnyDb
  householdId: string
  merchantId: string
  rawName?: string | null
  sourceType?: string | null
  confidence?: number | null
}) {
  const rawName = params.rawName?.trim() ?? ''
  if (!rawName) return { alias: null, created: false, conflictMerchantId: null as string | null }

  const normalizedRawName = normalizeMerchantAlias(rawName)
  if (!normalizedRawName) return { alias: null, created: false, conflictMerchantId: null as string | null }

  const { data: existing, error: existingError } = await params.db
    .from('merchant_aliases')
    .select(MERCHANT_ALIAS_COLUMNS)
    .eq('household_id', params.householdId)
    .eq('normalized_raw_name', normalizedRawName)
    .maybeSingle()

  if (existingError) throw new Error(existingError.message)
  if (existing) {
    const alias = normalizeAliasRow(existing)
    return {
      alias,
      created: false,
      conflictMerchantId: alias.merchant_id === params.merchantId ? null : alias.merchant_id,
    }
  }

  let { data: alias, error } = await params.db
    .from('merchant_aliases')
    .insert(
      buildMerchantAliasInsertPayload({
        householdId: params.householdId,
        merchantId: params.merchantId,
        rawName,
        normalizedRawName,
        sourceType: params.sourceType ?? null,
        confidence: params.confidence ?? null,
      }),
    )
    .select(MERCHANT_ALIAS_COLUMNS)
    .single()

  if (error && isLegacyMerchantAliasInsertError(error)) {
    const retryResult = await params.db
      .from('merchant_aliases')
      .insert(
        buildMerchantAliasInsertPayload({
          householdId: params.householdId,
          merchantId: params.merchantId,
          rawName,
          normalizedRawName,
          sourceType: params.sourceType ?? null,
          confidence: params.confidence ?? null,
          includeLegacyColumns: true,
        }),
      )
      .select(MERCHANT_ALIAS_COLUMNS)
      .single()

    alias = retryResult.data
    error = retryResult.error
  }

  if (error) throw new Error(error.message)
  return { alias: normalizeAliasRow(alias), created: true, conflictMerchantId: null }
}

export async function createMerchant(params: {
  db: AnyDb
  householdId: string
  actorUserId?: string | null
  name: string
  iconKey?: string | null
  colorToken?: string | null
  colorHex?: string | null
  notes?: string | null
  alias?: string | null
}) {
  const name = params.name.trim()
  if (!name) throw new Error('Merchant name is required')

  const normalizedName = normalizeMerchantCanonicalName(name)
  if (!normalizedName) throw new Error('Merchant name could not be normalized')

  const { data: existing, error: existingError } = await params.db
    .from('merchants')
    .select(MERCHANT_COLUMNS)
    .eq('household_id', params.householdId)
    .eq('normalized_name', normalizedName)
    .eq('is_active', true)
    .maybeSingle()

  if (existingError) throw new Error(existingError.message)
  if (existing) {
    if (params.alias?.trim()) {
      await upsertMerchantAlias({
        db: params.db,
        householdId: params.householdId,
        merchantId: normalizeMerchantRow(existing).id,
        rawName: params.alias,
        sourceType: 'manual',
      })
    }
    return normalizeMerchantRow(existing)
  }

  const style = resolveMerchantStyle({
    name,
    iconKey: params.iconKey ?? null,
    colorToken: params.colorToken ?? null,
    colorHex: params.colorHex ?? null,
  })

  const { data: merchant, error } = await params.db
    .from('merchants')
    .insert({
      household_id: params.householdId,
      name,
      normalized_name: normalizedName,
      icon_key: style.icon_key,
      color_token: style.color_token,
      color_hex: style.color_hex,
      notes: params.notes?.trim() || null,
      is_active: true,
      created_by: params.actorUserId ?? null,
      updated_by: params.actorUserId ?? null,
    })
    .select(MERCHANT_COLUMNS)
    .single()

  if (error) throw new Error(error.message)

  if (params.alias?.trim()) {
    await upsertMerchantAlias({
      db: params.db,
      householdId: params.householdId,
      merchantId: normalizeMerchantRow(merchant).id,
      rawName: params.alias,
      sourceType: 'manual',
    })
  }

  return normalizeMerchantRow(merchant)
}

export async function updateMerchant(params: {
  db: AnyDb
  householdId: string
  merchantId: string
  actorUserId?: string | null
  name?: string | null
  iconKey?: string | null
  colorToken?: string | null
  colorHex?: string | null
  notes?: string | null
  isActive?: boolean
  alias?: string | null
}) {
  const existing = await fetchMerchant(params.db, params.householdId, params.merchantId)
  if (!existing) throw new Error('Merchant not found')

  const nextName = params.name?.trim() || existing.name
  const normalizedName = normalizeMerchantCanonicalName(nextName)
  if (!normalizedName) throw new Error('Merchant name could not be normalized')

  const { data: conflict, error: conflictError } = await params.db
    .from('merchants')
    .select('id')
    .eq('household_id', params.householdId)
    .eq('normalized_name', normalizedName)
    .eq('is_active', true)
    .neq('id', params.merchantId)
    .maybeSingle()

  if (conflictError) throw new Error(conflictError.message)
  if (conflict) throw new Error('Another active merchant already uses this normalized name')

  const style = resolveMerchantStyle({
    name: nextName,
    iconKey: params.iconKey ?? existing.icon_key,
    colorToken: params.colorToken ?? existing.color_token,
    colorHex: params.colorHex ?? existing.color_hex,
  })

  const { data: merchant, error } = await params.db
    .from('merchants')
    .update({
      name: nextName,
      normalized_name: normalizedName,
      icon_key: style.icon_key,
      color_token: style.color_token,
      color_hex: style.color_hex,
      notes: params.notes !== undefined ? params.notes?.trim() || null : existing.notes,
      is_active: typeof params.isActive === 'boolean' ? params.isActive : existing.is_active,
      updated_by: params.actorUserId ?? existing.updated_by,
    })
    .eq('id', params.merchantId)
    .eq('household_id', params.householdId)
    .select(MERCHANT_COLUMNS)
    .single()

  if (error) throw new Error(error.message)

  if (params.alias?.trim()) {
    const aliasResult = await upsertMerchantAlias({
      db: params.db,
      householdId: params.householdId,
      merchantId: params.merchantId,
      rawName: params.alias,
      sourceType: 'manual',
    })

    if (aliasResult.conflictMerchantId && aliasResult.conflictMerchantId !== params.merchantId) {
      throw new Error('Alias already belongs to another merchant')
    }
  }

  return normalizeMerchantRow(merchant)
}

export async function resolveMerchantReference(params: {
  db: AnyDb
  householdId: string
  rawName?: string | null
  sourceType?: string | null
  confidence?: number | null
  actorUserId?: string | null
}) {
  const rawName = params.rawName?.trim() ?? ''
  if (!rawName) return null

  const aliasNormalized = normalizeMerchantAlias(rawName)
  const canonicalNormalized = normalizeMerchantCanonicalName(rawName) || aliasNormalized
  if (!aliasNormalized && !canonicalNormalized) return null

  if (aliasNormalized) {
    const { data: alias, error: aliasError } = await params.db
      .from('merchant_aliases')
      .select(MERCHANT_ALIAS_COLUMNS)
      .eq('household_id', params.householdId)
      .eq('normalized_raw_name', aliasNormalized)
      .maybeSingle()

    if (aliasError) throw new Error(aliasError.message)
    if (alias) {
      const merchant = await fetchMerchant(params.db, params.householdId, normalizeAliasRow(alias).merchant_id)
      if (merchant) {
        return {
          merchant,
          alias: normalizeAliasRow(alias),
          created: false,
          matchedBy: 'alias' as const,
          aliasCreated: false,
        }
      }
    }
  }

  const { data: merchantByName, error: merchantError } = await params.db
    .from('merchants')
    .select(MERCHANT_COLUMNS)
    .eq('household_id', params.householdId)
    .eq('normalized_name', canonicalNormalized)
    .eq('is_active', true)
    .maybeSingle()

  if (merchantError) throw new Error(merchantError.message)
  if (merchantByName) {
    const merchant = normalizeMerchantRow(merchantByName)
    const aliasResult = await upsertMerchantAlias({
      db: params.db,
      householdId: params.householdId,
      merchantId: merchant.id,
      rawName,
      sourceType: params.sourceType ?? 'system',
      confidence: params.confidence ?? null,
    })

    return {
      merchant,
      alias: aliasResult.alias,
      created: false,
      matchedBy: 'merchant' as const,
      aliasCreated: aliasResult.created,
    }
  }

  const merchant = await createMerchant({
    db: params.db,
    householdId: params.householdId,
    actorUserId: params.actorUserId ?? null,
    name: deriveMerchantDisplayName(rawName) || rawName,
  })

  const aliasResult = await upsertMerchantAlias({
    db: params.db,
    householdId: params.householdId,
    merchantId: merchant.id,
    rawName,
    sourceType: params.sourceType ?? 'system',
    confidence: params.confidence ?? null,
  })

  return {
    merchant,
    alias: aliasResult.alias,
    created: true,
    matchedBy: 'created' as const,
    aliasCreated: aliasResult.created,
  }
}

async function syncLedgerEntryMerchants(params: {
  db: AnyDb
  statementMerchantById: Map<string, { merchantId: string; merchantName: string }>
  receiptMerchantById: Map<string, { merchantId: string; merchantName: string }>
}) {
  let updatedLedgerEntries = 0

  const statementIds = Array.from(params.statementMerchantById.keys())
  if (statementIds.length > 0) {
    const { data: entries, error } = await params.db
      .from('ledger_entries')
      .select('id, merchant_id, statement_transaction_id')
      .in('statement_transaction_id', statementIds)
    if (error) throw new Error(error.message)

    for (const entry of entries ?? []) {
      const statementId = typeof entry.statement_transaction_id === 'string' ? entry.statement_transaction_id : null
      const target = statementId ? params.statementMerchantById.get(statementId) : null
      if (!target) continue
      if (entry.merchant_id === target.merchantId) continue

      const { error: updateError } = await params.db
        .from('ledger_entries')
        .update({
          merchant_id: target.merchantId,
          merchant_display: target.merchantName,
        })
        .eq('id', entry.id)
      if (updateError) throw new Error(updateError.message)
      updatedLedgerEntries += 1
    }
  }

  const receiptIds = Array.from(params.receiptMerchantById.keys())
  if (receiptIds.length > 0) {
    const { data: entries, error } = await params.db
      .from('ledger_entries')
      .select('id, merchant_id, receipt_id')
      .in('receipt_id', receiptIds)
    if (error) throw new Error(error.message)

    for (const entry of entries ?? []) {
      const receiptId = typeof entry.receipt_id === 'string' ? entry.receipt_id : null
      const target = receiptId ? params.receiptMerchantById.get(receiptId) : null
      if (!target) continue
      if (entry.merchant_id === target.merchantId) continue

      const { error: updateError } = await params.db
        .from('ledger_entries')
        .update({
          merchant_id: target.merchantId,
          merchant_display: target.merchantName,
        })
        .eq('id', entry.id)
      if (updateError) throw new Error(updateError.message)
      updatedLedgerEntries += 1
    }
  }

  return updatedLedgerEntries
}

export async function backfillHouseholdMerchants(db: AnyDb, householdId: string, actorUserId?: string | null): Promise<MerchantBackfillResult> {
  const accountIds = await getHouseholdAccountIds(db, householdId)
  const cache = new Map<string, MerchantResolutionResult | null>()

  let createdMerchants = 0
  let reusedMerchants = 0
  let updatedTransactions = 0
  let updatedReceipts = 0
  let aliasesCreated = 0

  const statementMerchantById = new Map<string, { merchantId: string; merchantName: string }>()
  const receiptMerchantById = new Map<string, { merchantId: string; merchantName: string }>()

  if (accountIds.length > 0) {
    const { data: statementRows, error } = await db
      .from('statement_transactions')
      .select('id, merchant_id, merchant_raw, merchant_normalized')
      .in('account_id', accountIds)
    if (error) throw new Error(error.message)

    for (const row of statementRows ?? []) {
      const rawValue =
        (typeof row.merchant_raw === 'string' && row.merchant_raw.trim()) ||
        (typeof row.merchant_normalized === 'string' && row.merchant_normalized.trim())
          ? String(row.merchant_raw ?? row.merchant_normalized)
          : ''

      if (!rawValue) continue
      const cacheKey = rawValue.toLowerCase()
      let resolution = cache.get(cacheKey)
      if (resolution === undefined) {
        resolution = await resolveMerchantReference({
          db,
          householdId,
          rawName: rawValue,
          sourceType: 'statement',
          actorUserId,
        })
        cache.set(cacheKey, resolution)
        if (resolution) {
          if (resolution.created) createdMerchants += 1
          else reusedMerchants += 1
          if (resolution.aliasCreated) aliasesCreated += 1
        }
      }
      if (!resolution) continue

      const merchantDisplayName =
        resolution.merchant.name ||
        deriveMerchantDisplayName(rawValue) ||
        normalizeMerchantCanonicalName(resolution.merchant.name)

      if (row.merchant_id !== resolution.merchant.id || row.merchant_normalized !== merchantDisplayName) {
        const { error: updateError } = await db
          .from('statement_transactions')
          .update({
            merchant_id: resolution.merchant.id,
            merchant_normalized: merchantDisplayName,
          })
          .eq('id', row.id)
        if (updateError) throw new Error(updateError.message)
        updatedTransactions += 1
      }

      statementMerchantById.set(String(row.id), {
        merchantId: resolution.merchant.id,
        merchantName: resolution.merchant.name,
      })
    }
  }

  const { data: receiptRows, error: receiptError } = await db
    .from('receipts')
    .select('id, merchant_id, merchant_raw')
    .eq('household_id', householdId)
  if (receiptError) throw new Error(receiptError.message)

  for (const row of receiptRows ?? []) {
    const rawValue = typeof row.merchant_raw === 'string' ? row.merchant_raw.trim() : ''
    if (!rawValue) continue

    const cacheKey = rawValue.toLowerCase()
    let resolution = cache.get(cacheKey)
    if (resolution === undefined) {
      resolution = await resolveMerchantReference({
        db,
        householdId,
        rawName: rawValue,
        sourceType: 'receipt',
        actorUserId,
      })
      cache.set(cacheKey, resolution)
      if (resolution) {
        if (resolution.created) createdMerchants += 1
        else reusedMerchants += 1
        if (resolution.aliasCreated) aliasesCreated += 1
      }
    }
    if (!resolution) continue

    if (row.merchant_id !== resolution.merchant.id) {
      const { error: updateError } = await db
        .from('receipts')
        .update({ merchant_id: resolution.merchant.id })
        .eq('id', row.id)
      if (updateError) throw new Error(updateError.message)
      updatedReceipts += 1
    }

    receiptMerchantById.set(String(row.id), {
      merchantId: resolution.merchant.id,
      merchantName: resolution.merchant.name,
    })
  }

  const updatedLedgerEntries = await syncLedgerEntryMerchants({
    db,
    statementMerchantById,
    receiptMerchantById,
  })

  return {
    createdMerchants,
    reusedMerchants,
    updatedTransactions,
    updatedReceipts,
    updatedLedgerEntries,
    aliasesCreated,
  }
}
