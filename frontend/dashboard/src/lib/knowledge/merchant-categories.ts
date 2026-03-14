import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'

const BUNDLED_KNOWLEDGE_PATH = join(process.cwd(), 'knowledge', 'merchant_categories.json')
const MERCHANT_KB_TABLE = 'statement_merchant_kb'
const seededHouseholdIds = new Set<string>()

export type MerchantDecisionSource =
  | 'knowledge_base'
  | 'alias_resolution'
  | 'genai_suggestion'
  | 'manual_override'
  | 'web_enriched'

export interface MerchantKnowledgeRecord {
  canonical_merchant_name: string
  normalized_merchant_name: string
  family_name: string
  aliases: string[]
  business_type: string | null
  approved_category_id: number | null
  approved_category_name: string
  confidence: number
  decision_source: MerchantDecisionSource
  usage_count: number
  first_seen_date: string
  last_reviewed_date: string
  notes: string | null
}

type MerchantKnowledgeMap = Record<string, MerchantKnowledgeRecord>

interface MerchantKnowledgeDbRow {
  household_id: string
  normalized_merchant_name: string
  canonical_merchant_name: string
  family_name: string
  aliases: string[] | null
  business_type: string | null
  approved_category_id: number | null
  approved_category_name: string
  confidence: number | null
  decision_source: string | null
  usage_count: number | null
  first_seen_date: string | null
  last_reviewed_date: string | null
  notes: string | null
}

interface LegacyMerchantCategoryEntry {
  merchant?: string
  category?: string
  updatedAt?: string
}

export interface MerchantKnowledgeMatch {
  record: MerchantKnowledgeRecord
  matchedBy: 'exact' | 'alias' | 'family'
}

interface RememberMerchantCategoryParams {
  merchant: string
  categoryName?: string
  categoryId?: number | null
  canonicalMerchantName?: string | null
  familyName?: string | null
  businessType?: string | null
  confidence?: number
  decisionSource?: MerchantDecisionSource
  aliases?: string[]
  notes?: string | null
}

export interface MerchantCategoryBackfillCandidate {
  id: number
  name: string
}

export function normalizeMerchantName(value?: string | null) {
  return (value ?? '')
    .toLowerCase()
    .replace(/\*/g, ' ')
    .replace(/\b(grabpay|shopback|shopback tosuta|shopback old|shopback old chang kee)\b/g, ' ')
    .replace(/\b(pte ltd|pte|ltd|llc|inc|co|company)\b/g, ' ')
    .replace(/\b(sg|singapore)\b/g, ' ')
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildMerchantFamilyName(normalizedName?: string | null) {
  const value = normalizeMerchantName(normalizedName)
  if (!value) return ''

  const family = value
    .replace(/\b(mart|market|marketplace|supermarket|restaurant|restaurants|cafe|coffee|bakery|travel|digital|store|shop|services?)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return family || value
}

function normalizeAliasList(values?: string[] | null) {
  return Array.from(new Set((values ?? []).map((value) => normalizeMerchantName(value)).filter(Boolean)))
}

function normalizeCategoryToken(value?: string | null) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function coerceLegacyRecord(key: string, entry: LegacyMerchantCategoryEntry): MerchantKnowledgeRecord | null {
  const merchant = entry.merchant?.trim() || key
  const category = entry.category?.trim()
  if (!merchant || !category) return null

  const normalized = normalizeMerchantName(key || merchant)
  if (!normalized) return null

  const updatedAt = entry.updatedAt || new Date().toISOString()

  return {
    canonical_merchant_name: merchant,
    normalized_merchant_name: normalized,
    family_name: buildMerchantFamilyName(normalized),
    aliases: [],
    business_type: null,
    approved_category_id: null,
    approved_category_name: category,
    confidence: 1,
    decision_source: 'manual_override',
    usage_count: 1,
    first_seen_date: updatedAt,
    last_reviewed_date: updatedAt,
    notes: null,
  }
}

function toMerchantKnowledgeMap(raw: unknown): MerchantKnowledgeMap {
  if (!raw || typeof raw !== 'object') {
    return {}
  }

  const map: MerchantKnowledgeMap = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue

    const record = value as Partial<MerchantKnowledgeRecord> & LegacyMerchantCategoryEntry
    const normalized = normalizeMerchantName(record.normalized_merchant_name || key)

    const hasCategoryId = typeof record.approved_category_id === 'number'
    const hasCategoryName = typeof record.approved_category_name === 'string' && Boolean(record.approved_category_name.trim())

    if ((hasCategoryId || hasCategoryName) && normalized) {
      map[normalized] = {
        canonical_merchant_name: record.canonical_merchant_name?.trim() || record.merchant?.trim() || key,
        normalized_merchant_name: normalized,
        family_name: buildMerchantFamilyName(record.family_name || normalized),
        aliases: normalizeAliasList(record.aliases),
        business_type: record.business_type?.trim() || null,
        approved_category_id:
          typeof record.approved_category_id === 'number' ? record.approved_category_id : null,
        approved_category_name: record.approved_category_name?.trim() || '',
        confidence: typeof record.confidence === 'number' ? record.confidence : 1,
        decision_source: normalizeDecisionSource(record.decision_source),
        usage_count: typeof record.usage_count === 'number' ? record.usage_count : 1,
        first_seen_date: record.first_seen_date || new Date().toISOString(),
        last_reviewed_date: record.last_reviewed_date || record.updatedAt || new Date().toISOString(),
        notes: record.notes?.trim() || null,
      }
      continue
    }

    const legacy = coerceLegacyRecord(key, record)
    if (legacy) {
      map[legacy.normalized_merchant_name] = legacy
    }
  }

  return map
}

function readBundledMerchantKnowledgeMap() {
  if (!existsSync(BUNDLED_KNOWLEDGE_PATH)) {
    return {}
  }

  try {
    const parsed = JSON.parse(readFileSync(BUNDLED_KNOWLEDGE_PATH, 'utf-8')) as unknown
    return toMerchantKnowledgeMap(parsed)
  } catch {
    return {}
  }
}

function normalizeDecisionSource(value?: string | null): MerchantDecisionSource {
  switch (value) {
    case 'knowledge_base':
    case 'alias_resolution':
    case 'genai_suggestion':
    case 'manual_override':
    case 'web_enriched':
      return value
    default:
      return 'manual_override'
  }
}

function isMerchantKnowledgeTableMissing(error: unknown) {
  const message = error instanceof Error
    ? error.message.toLowerCase()
    : typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message ?? '').toLowerCase()
      : ''

  return (
    message.includes('statement_merchant_kb')
    && (
      message.includes('does not exist')
      || message.includes('schema cache')
      || message.includes('could not find the table')
      || message.includes('relation')
    )
  )
}

function toDbRow(householdId: string, record: MerchantKnowledgeRecord): MerchantKnowledgeDbRow {
  return {
    household_id: householdId,
    normalized_merchant_name: record.normalized_merchant_name,
    canonical_merchant_name: record.canonical_merchant_name,
    family_name: record.family_name,
    aliases: record.aliases,
    business_type: record.business_type,
    approved_category_id: record.approved_category_id,
    approved_category_name: record.approved_category_name,
    confidence: record.confidence,
    decision_source: record.decision_source,
    usage_count: record.usage_count,
    first_seen_date: record.first_seen_date,
    last_reviewed_date: record.last_reviewed_date,
    notes: record.notes,
  }
}

function fromDbRow(row: MerchantKnowledgeDbRow): MerchantKnowledgeRecord {
  return {
    canonical_merchant_name: row.canonical_merchant_name,
    normalized_merchant_name: row.normalized_merchant_name,
    family_name: row.family_name,
    aliases: normalizeAliasList(row.aliases),
    business_type: row.business_type,
    approved_category_id: row.approved_category_id,
    approved_category_name: row.approved_category_name,
    confidence: typeof row.confidence === 'number' ? row.confidence : 1,
    decision_source: normalizeDecisionSource(row.decision_source),
    usage_count: typeof row.usage_count === 'number' ? row.usage_count : 1,
    first_seen_date: row.first_seen_date || new Date().toISOString(),
    last_reviewed_date: row.last_reviewed_date || new Date().toISOString(),
    notes: row.notes,
  }
}

function mapRowsToKnowledgeMap(rows: MerchantKnowledgeDbRow[]) {
  return rows.reduce<MerchantKnowledgeMap>((map, row) => {
    map[row.normalized_merchant_name] = fromDbRow(row)
    return map
  }, {})
}

async function ensureBundledMerchantKnowledgeSeeded(
  supabase: SupabaseClient<any>,
  householdId: string,
) {
  if (seededHouseholdIds.has(householdId)) {
    return
  }

  const bundledMap = readBundledMerchantKnowledgeMap()
  if (Object.keys(bundledMap).length === 0) {
    seededHouseholdIds.add(householdId)
    return
  }

  const { data: existingRows, error: existingError } = await supabase
    .from(MERCHANT_KB_TABLE)
    .select('normalized_merchant_name')
    .eq('household_id', householdId)

  if (existingError) {
    if (isMerchantKnowledgeTableMissing(existingError)) {
      return
    }

    throw new Error(existingError.message)
  }

  const existingNormalized = new Set(
    (existingRows ?? [])
      .map((row) => (typeof row.normalized_merchant_name === 'string' ? row.normalized_merchant_name : null))
      .filter((value): value is string => Boolean(value)),
  )

  const seedRows = Object.values(bundledMap)
    .filter((record) => !existingNormalized.has(record.normalized_merchant_name))
    .map((record) => toDbRow(householdId, record))

  if (seedRows.length > 0) {
    const { error: insertError } = await supabase
      .from(MERCHANT_KB_TABLE)
      .insert(seedRows)

    if (insertError) {
      if (isMerchantKnowledgeTableMissing(insertError)) {
        return
      }

      throw new Error(insertError.message)
    }
  }

  seededHouseholdIds.add(householdId)
}

async function loadMerchantKnowledgeMap(
  supabase: SupabaseClient<any>,
  householdId: string,
) {
  await ensureBundledMerchantKnowledgeSeeded(supabase, householdId)

  const { data, error } = await supabase
    .from(MERCHANT_KB_TABLE)
    .select([
      'household_id',
      'normalized_merchant_name',
      'canonical_merchant_name',
      'family_name',
      'aliases',
      'business_type',
      'approved_category_id',
      'approved_category_name',
      'confidence',
      'decision_source',
      'usage_count',
      'first_seen_date',
      'last_reviewed_date',
      'notes',
    ].join(', '))
    .eq('household_id', householdId)

  if (error) {
    if (isMerchantKnowledgeTableMissing(error)) {
      return readBundledMerchantKnowledgeMap()
    }

    throw new Error(error.message)
  }

  const rows = ((data ?? []) as unknown) as MerchantKnowledgeDbRow[]
  if (rows.length === 0) {
    return readBundledMerchantKnowledgeMap()
  }

  return mapRowsToKnowledgeMap(rows)
}

export async function findMerchantKnowledgeMatch(
  supabase: SupabaseClient<any>,
  householdId: string,
  merchant?: string | null,
  description?: string | null,
): Promise<MerchantKnowledgeMatch | null> {
  const map = await loadMerchantKnowledgeMap(supabase, householdId)
  const candidates = [merchant, description].map((value) => normalizeMerchantName(value)).filter(Boolean)

  for (const candidate of candidates) {
    const exact = map[candidate]
    if (exact) {
      return { record: exact, matchedBy: 'exact' }
    }
  }

  for (const candidate of candidates) {
    const aliasEntry = Object.values(map).find((record) => record.aliases.includes(candidate))
    if (aliasEntry) {
      return { record: aliasEntry, matchedBy: 'alias' }
    }
  }

  for (const candidate of candidates) {
    const family = buildMerchantFamilyName(candidate)
    if (!family) continue
    const familyEntry = Object.values(map).find((record) => record.family_name === family)
    if (familyEntry) {
      return { record: familyEntry, matchedBy: 'family' }
    }
  }

  return null
}

export async function getLearnedMerchantCategoryName(
  supabase: SupabaseClient<any>,
  householdId: string,
  merchant?: string | null,
  description?: string | null,
) {
  return (await findMerchantKnowledgeMatch(supabase, householdId, merchant, description))?.record.approved_category_name ?? null
}

export async function backfillMerchantKnowledgeCategoryIds(
  supabase: SupabaseClient<any>,
  householdId: string,
  candidates: MerchantCategoryBackfillCandidate[],
) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { updated: 0, totalMissing: 0 }
  }

  await ensureBundledMerchantKnowledgeSeeded(supabase, householdId)

  const normalizedIdLookup = new Map<string, number>()
  for (const category of candidates) {
    if (typeof category.id !== 'number') continue
    const normalizedName = normalizeCategoryToken(category.name)
    if (!normalizedName || normalizedIdLookup.has(normalizedName)) continue
    normalizedIdLookup.set(normalizedName, category.id)
  }

  const { data, error } = await supabase
    .from(MERCHANT_KB_TABLE)
    .select([
      'household_id',
      'normalized_merchant_name',
      'canonical_merchant_name',
      'family_name',
      'aliases',
      'business_type',
      'approved_category_id',
      'approved_category_name',
      'confidence',
      'decision_source',
      'usage_count',
      'first_seen_date',
      'last_reviewed_date',
      'notes',
    ].join(', '))
    .eq('household_id', householdId)

  if (error) {
    if (isMerchantKnowledgeTableMissing(error)) {
      return { updated: 0, totalMissing: 0 }
    }

    throw new Error(error.message)
  }

  const rows = ((data ?? []) as unknown) as MerchantKnowledgeDbRow[]
  let updated = 0
  let totalMissing = 0
  const updates: MerchantKnowledgeDbRow[] = []
  const now = new Date().toISOString()

  for (const row of rows) {
    if (typeof row.approved_category_id === 'number') continue
    totalMissing += 1

    const fallbackId = normalizedIdLookup.get(normalizeCategoryToken(row.approved_category_name))
    if (typeof fallbackId !== 'number') continue

    updates.push({
      ...row,
      approved_category_id: fallbackId,
      last_reviewed_date: now,
    })
    updated += 1
  }

  if (updates.length > 0) {
    const { error: upsertError } = await supabase
      .from(MERCHANT_KB_TABLE)
      .upsert(updates, { onConflict: 'household_id,normalized_merchant_name' })

    if (upsertError) {
      if (isMerchantKnowledgeTableMissing(upsertError)) {
        return { updated: 0, totalMissing }
      }

      throw new Error(upsertError.message)
    }
  }

  return { updated, totalMissing }
}

export async function rememberMerchantCategory(
  supabase: SupabaseClient<any>,
  householdId: string,
  params: RememberMerchantCategoryParams | string,
  categoryName?: string,
) {
  const input: RememberMerchantCategoryParams =
    typeof params === 'string' ? { merchant: params, categoryName: categoryName || '' } : params

  const normalized = normalizeMerchantName(input.merchant)
  const nextCategoryName = input.categoryName?.trim() || ''
  if (!normalized) {
    return null
  }

  const map = await loadMerchantKnowledgeMap(supabase, householdId)
  const existing = map[normalized]
  const now = new Date().toISOString()
  const aliases = normalizeAliasList([
    ...(existing?.aliases ?? []),
    ...(input.aliases ?? []),
    existing?.canonical_merchant_name || '',
    input.merchant,
  ]).filter((alias) => alias !== normalized)

  const nextCategoryId =
    typeof input.categoryId === 'number' ? input.categoryId : existing?.approved_category_id ?? null
  if (nextCategoryId === null) {
    return null
  }

  const nextRecord: MerchantKnowledgeRecord = {
    canonical_merchant_name:
      input.canonicalMerchantName?.trim() || existing?.canonical_merchant_name || input.merchant.trim(),
    normalized_merchant_name: normalized,
    family_name: buildMerchantFamilyName(input.familyName || normalized),
    aliases,
    business_type: input.businessType?.trim() || existing?.business_type || null,
    approved_category_id: nextCategoryId,
    approved_category_name: nextCategoryName || existing?.approved_category_name || '',
    confidence: input.confidence ?? 1,
    decision_source: input.decisionSource ?? 'manual_override',
    usage_count: (existing?.usage_count ?? 0) + 1,
    first_seen_date: existing?.first_seen_date || now,
    last_reviewed_date: now,
    notes: input.notes?.trim() || existing?.notes || null,
  }

  const { error } = await supabase
    .from(MERCHANT_KB_TABLE)
    .upsert(toDbRow(householdId, nextRecord), { onConflict: 'household_id,normalized_merchant_name' })

  if (error && !isMerchantKnowledgeTableMissing(error)) {
    throw new Error(error.message)
  }

  return nextRecord
}
