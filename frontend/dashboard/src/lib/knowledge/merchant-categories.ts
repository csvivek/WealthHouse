import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

const KNOWLEDGE_PATH = join(process.cwd(), 'knowledge', 'merchant_categories.json')

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
  // Denormalized display value only. Category linkage is ID-first.
  approved_category_name: string
  confidence: number
  decision_source: MerchantDecisionSource
  usage_count: number
  first_seen_date: string
  last_reviewed_date: string
  notes: string | null
}

type MerchantKnowledgeMap = Record<string, MerchantKnowledgeRecord>

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
        decision_source: (record.decision_source as MerchantDecisionSource) || 'manual_override',
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

export function loadMerchantKnowledgeMap() {
  if (!existsSync(KNOWLEDGE_PATH)) {
    return {}
  }

  try {
    const parsed = JSON.parse(readFileSync(KNOWLEDGE_PATH, 'utf-8')) as unknown
    return toMerchantKnowledgeMap(parsed)
  } catch {
    return {}
  }
}

function saveMerchantKnowledgeMap(map: MerchantKnowledgeMap) {
  mkdirSync(dirname(KNOWLEDGE_PATH), { recursive: true })
  writeFileSync(KNOWLEDGE_PATH, JSON.stringify(map, null, 2) + '\n', 'utf-8')
}

export function findMerchantKnowledgeMatch(merchant?: string | null, description?: string | null): MerchantKnowledgeMatch | null {
  const map = loadMerchantKnowledgeMap()
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

export function getLearnedMerchantCategoryName(merchant?: string | null, description?: string | null) {
  return findMerchantKnowledgeMatch(merchant, description)?.record.approved_category_name ?? null
}

export function backfillMerchantKnowledgeCategoryIds(candidates: MerchantCategoryBackfillCandidate[]) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { updated: 0, totalMissing: 0 }
  }

  const normalizedIdLookup = new Map<string, number>()
  for (const category of candidates) {
    if (typeof category.id !== 'number') continue
    const normalizedName = normalizeCategoryToken(category.name)
    if (!normalizedName || normalizedIdLookup.has(normalizedName)) continue
    normalizedIdLookup.set(normalizedName, category.id)
  }

  const map = loadMerchantKnowledgeMap()
  let updated = 0
  let totalMissing = 0

  for (const key of Object.keys(map)) {
    const record = map[key]
    if (typeof record.approved_category_id === 'number') continue
    totalMissing += 1

    const fallbackId = normalizedIdLookup.get(normalizeCategoryToken(record.approved_category_name))
    if (typeof fallbackId !== 'number') continue

    map[key] = {
      ...record,
      approved_category_id: fallbackId,
      last_reviewed_date: new Date().toISOString(),
    }
    updated += 1
  }

  if (updated > 0) {
    saveMerchantKnowledgeMap(map)
  }

  return { updated, totalMissing }
}

export function rememberMerchantCategory(params: RememberMerchantCategoryParams | string, categoryName?: string) {
  const input: RememberMerchantCategoryParams =
    typeof params === 'string' ? { merchant: params, categoryName: categoryName || '' } : params

  const normalized = normalizeMerchantName(input.merchant)
  const nextCategoryName = input.categoryName?.trim() || ''
  if (!normalized) {
    return null
  }

  const map = loadMerchantKnowledgeMap()
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

  map[normalized] = nextRecord
  saveMerchantKnowledgeMap(map)
  return nextRecord
}
