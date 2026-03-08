/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getReceiptsBucket } from '@/lib/receipts/config'
import { normalizeItemName, normalizeMerchantName } from '@/lib/receipts/normalization'
import type { ReceiptClassificationSource } from '@/lib/receipts/types'

interface ReceiptCategoryRow {
  id: string
  household_id: string | null
  name: string
  category_family: string | null
  sort_order: number
}

interface MerchantKbRow {
  normalized_merchant_name: string
  canonical_merchant_name: string
  aliases: string[]
  confidence: number
  source: ReceiptClassificationSource
  usage_count: number
  notes: string | null
  updated_at: string
  receipt_categories: { name: string } | { name: string }[] | null
}

interface ItemKbRow {
  normalized_item_pattern: string
  canonical_item_name: string
  confidence: number
  source: ReceiptClassificationSource
  usage_count: number
  notes: string | null
  updated_at: string
  receipt_categories: { name: string } | { name: string }[] | null
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function categoryNameFromJoin(joinValue: { name: string } | { name: string }[] | null | undefined) {
  return asArray(joinValue)[0]?.name ?? null
}

export async function fetchReceiptCategories(
  supabase: SupabaseClient<any>,
  householdId: string,
): Promise<ReceiptCategoryRow[]> {
  const { data, error } = await supabase
    .from('receipt_categories')
    .select('id, household_id, name, category_family, sort_order')
    .or(`household_id.is.null,household_id.eq.${householdId}`)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    throw new Error(`Failed to load receipt categories: ${error.message}`)
  }

  return (data ?? []) as ReceiptCategoryRow[]
}

export async function findReceiptCategoryByName(
  supabase: SupabaseClient<any>,
  householdId: string,
  categoryName: string,
): Promise<ReceiptCategoryRow | null> {
  const normalized = categoryName.trim().toLowerCase()
  if (!normalized) return null

  const categories = await fetchReceiptCategories(supabase, householdId)
  const direct = categories.find((category) => category.name.toLowerCase() === normalized)
  return direct ?? null
}

export async function upsertReceiptMerchantKnowledge(params: {
  supabase: SupabaseClient<any>
  householdId: string
  merchantName: string
  canonicalMerchantName?: string | null
  categoryId: string
  confidence: number
  source: ReceiptClassificationSource
  aliases?: string[]
  notes?: string | null
}) {
  const normalized = normalizeMerchantName(params.merchantName)
  if (!normalized) return

  const aliases = Array.from(new Set((params.aliases ?? []).map((alias) => normalizeMerchantName(alias)).filter(Boolean)))

  await params.supabase
    .from('receipt_merchant_kb')
    .upsert(
      {
        household_id: params.householdId,
        normalized_merchant_name: normalized,
        canonical_merchant_name: params.canonicalMerchantName?.trim() || params.merchantName.trim(),
        aliases,
        receipt_category_id: params.categoryId,
        confidence: params.confidence,
        source: params.source,
        usage_count: 1,
        notes: params.notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'household_id,normalized_merchant_name' },
    )
}

export async function upsertReceiptItemKnowledge(params: {
  supabase: SupabaseClient<any>
  householdId: string
  itemName: string
  categoryId: string
  confidence: number
  source: ReceiptClassificationSource
  notes?: string | null
}) {
  const normalized = normalizeItemName(params.itemName)
  if (!normalized) return

  await params.supabase
    .from('receipt_item_kb')
    .upsert(
      {
        household_id: params.householdId,
        normalized_item_pattern: normalized,
        canonical_item_name: params.itemName.trim(),
        receipt_category_id: params.categoryId,
        confidence: params.confidence,
        source: params.source,
        usage_count: 1,
        notes: params.notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'household_id,normalized_item_pattern' },
    )
}

function toCategoryMarkdown(categories: ReceiptCategoryRow[]) {
  const lines = [
    '# Receipt Categories',
    '',
    '| Category | Family | Scope |',
    '|---|---|---|',
  ]

  for (const category of categories) {
    lines.push(`| ${category.name} | ${category.category_family || 'Other'} | ${category.household_id ? 'household' : 'global'} |`)
  }

  lines.push('')
  return lines.join('\n')
}

function toMerchantMarkdown(rows: MerchantKbRow[]) {
  const lines = [
    '# Receipt Merchant Knowledge',
    '',
    '| Normalized Merchant | Canonical Merchant | Category | Source | Confidence | Usage | Updated |',
    '|---|---|---|---|---:|---:|---|',
  ]

  for (const row of rows) {
    const categoryName = categoryNameFromJoin(row.receipt_categories) || 'Unknown'
    lines.push(
      `| ${row.normalized_merchant_name} | ${row.canonical_merchant_name} | ${categoryName} | ${row.source} | ${row.confidence.toFixed(2)} | ${row.usage_count} | ${row.updated_at} |`,
    )
  }

  lines.push('')
  return lines.join('\n')
}

function toItemMarkdown(rows: ItemKbRow[]) {
  const lines = [
    '# Receipt Item Knowledge',
    '',
    '| Normalized Item Pattern | Canonical Item Name | Category | Source | Confidence | Usage | Updated |',
    '|---|---|---|---|---:|---:|---|',
  ]

  for (const row of rows) {
    const categoryName = categoryNameFromJoin(row.receipt_categories) || 'Unknown'
    lines.push(
      `| ${row.normalized_item_pattern} | ${row.canonical_item_name} | ${categoryName} | ${row.source} | ${row.confidence.toFixed(2)} | ${row.usage_count} | ${row.updated_at} |`,
    )
  }

  lines.push('')
  return lines.join('\n')
}

function toChangelogLine(params: {
  reason: string
  runId: string | null
  actorUserId: string | null
  source: ReceiptClassificationSource | 'system'
}) {
  const timestamp = new Date().toISOString()
  return `- ${timestamp} | reason=${params.reason} | run=${params.runId || 'n/a'} | actor=${params.actorUserId || 'system'} | source=${params.source}`
}

async function uploadMarkdown(
  supabase: SupabaseClient<any>,
  bucket: string,
  path: string,
  content: string,
) {
  const buffer = Buffer.from(content, 'utf-8')
  const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType: 'text/markdown; charset=utf-8',
    upsert: true,
  })

  if (error) {
    throw new Error(`Failed to upload markdown (${path}): ${error.message}`)
  }
}

async function appendChangelog(params: {
  supabase: SupabaseClient<any>
  bucket: string
  changelogPath: string
  line: string
}) {
  let previous = '# Receipt KB Changelog\n\n'

  const { data: existing, error: existingError } = await params.supabase.storage
    .from(params.bucket)
    .download(params.changelogPath)

  if (!existingError && existing) {
    previous = await existing.text()
    if (!previous.endsWith('\n')) {
      previous += '\n'
    }
  }

  previous += `${params.line}\n`
  await uploadMarkdown(params.supabase, params.bucket, params.changelogPath, previous)
}

export async function syncReceiptKnowledgeMarkdown(params: {
  supabase: SupabaseClient<any>
  householdId: string
  reason: string
  runId?: string | null
  actorUserId?: string | null
  source?: ReceiptClassificationSource | 'system'
}) {
  const bucket = getReceiptsBucket()
  const base = `households/${params.householdId}/kb/receipts`

  const [categoriesResult, merchantResult, itemResult] = await Promise.all([
    params.supabase
      .from('receipt_categories')
      .select('id, household_id, name, category_family, sort_order')
      .or(`household_id.is.null,household_id.eq.${params.householdId}`)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    params.supabase
      .from('receipt_merchant_kb')
      .select('normalized_merchant_name, canonical_merchant_name, aliases, confidence, source, usage_count, notes, updated_at, receipt_categories(name)')
      .eq('household_id', params.householdId)
      .order('updated_at', { ascending: false }),
    params.supabase
      .from('receipt_item_kb')
      .select('normalized_item_pattern, canonical_item_name, confidence, source, usage_count, notes, updated_at, receipt_categories(name)')
      .eq('household_id', params.householdId)
      .order('updated_at', { ascending: false }),
  ])

  if (categoriesResult.error) {
    throw new Error(`Failed to build receipt_categories.md: ${categoriesResult.error.message}`)
  }

  if (merchantResult.error) {
    throw new Error(`Failed to build receipt_merchant_map.md: ${merchantResult.error.message}`)
  }

  if (itemResult.error) {
    throw new Error(`Failed to build receipt_item_map.md: ${itemResult.error.message}`)
  }

  const categories = (categoriesResult.data ?? []) as ReceiptCategoryRow[]
  const merchantRows = (merchantResult.data ?? []) as MerchantKbRow[]
  const itemRows = (itemResult.data ?? []) as ItemKbRow[]

  const categoryContent = toCategoryMarkdown(categories)
  const merchantContent = toMerchantMarkdown(merchantRows)
  const itemContent = toItemMarkdown(itemRows)

  const version = new Date().toISOString().replace(/[:.]/g, '-')

  await Promise.all([
    uploadMarkdown(params.supabase, bucket, `${base}/versions/${version}_receipt_categories.md`, categoryContent),
    uploadMarkdown(params.supabase, bucket, `${base}/versions/${version}_receipt_merchant_map.md`, merchantContent),
    uploadMarkdown(params.supabase, bucket, `${base}/versions/${version}_receipt_item_map.md`, itemContent),
  ])

  await Promise.all([
    uploadMarkdown(params.supabase, bucket, `${base}/receipt_categories.md`, categoryContent),
    uploadMarkdown(params.supabase, bucket, `${base}/receipt_merchant_map.md`, merchantContent),
    uploadMarkdown(params.supabase, bucket, `${base}/receipt_item_map.md`, itemContent),
  ])

  await appendChangelog({
    supabase: params.supabase,
    bucket,
    changelogPath: `${base}/receipt_kb_changelog.md`,
    line: toChangelogLine({
      reason: params.reason,
      runId: params.runId ?? null,
      actorUserId: params.actorUserId ?? null,
      source: params.source ?? 'system',
    }),
  })
}
