/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from '@supabase/supabase-js'
import { openai } from '@/lib/ai/openai'
import { searchMerchantOnWeb } from '@/lib/ai/web-search'
import {
  fetchReceiptCategories,
  findReceiptCategoryByName,
  upsertReceiptItemKnowledge,
  upsertReceiptMerchantKnowledge,
} from '@/lib/receipts/knowledge'
import {
  clampConfidence,
  normalizeItemName,
  normalizeMerchantName,
  parseNumeric,
} from '@/lib/receipts/normalization'
import type {
  ReceiptClassificationItemResult,
  ReceiptClassificationResult,
  ReceiptClassificationSource,
} from '@/lib/receipts/types'

interface StagingHeader {
  id: string
  household_id: string
  merchant_name: string | null
  transaction_total: number | null
  currency: string
  payment_type: string | null
  receipt_reference: string | null
  extraction_confidence: number | null
  raw_extraction_json: Record<string, unknown> | null
}

interface StagingItem {
  id: string
  item_name: string | null
  quantity: number | null
  unit_price: number | null
  line_total: number | null
}

interface CategoryRow {
  id: string
  name: string
}

interface CategoryCandidate {
  categoryName: string
  source: ReceiptClassificationSource
  confidence: number
  rationale: string | null
}

const RECEIPT_CLASSIFICATION_VERSION = 'receipt-classifier-v1'

const MERCHANT_KEYWORD_CATEGORY: Record<string, string> = {
  fairprice: 'Groceries',
  ntuc: 'Groceries',
  sheng: 'Groceries',
  giant: 'Groceries',
  cold: 'Groceries',
  starbucks: 'Dining / Food Purchase',
  coffee: 'Dining / Food Purchase',
  toast: 'Dining / Food Purchase',
  ikea: 'Home Furnishing',
  muji: 'Home Furnishing',
  courts: 'Electronics',
  challenger: 'Electronics',
  harvey: 'Electronics',
  watsons: 'Personal Care',
  guardian: 'Medical / Pharmacy',
  unity: 'Medical / Pharmacy',
  popular: 'Kids / School',
  daiso: 'Household Supplies',
  'mr diy': 'Hardware / DIY',
  shell: 'Automotive',
  esso: 'Automotive',
  caltex: 'Automotive',
  pet: 'Pet Supplies',
}

const ITEM_KEYWORD_CATEGORY: Record<string, string> = {
  rice: 'Groceries',
  milk: 'Groceries',
  bread: 'Groceries',
  apple: 'Groceries',
  egg: 'Groceries',
  detergent: 'Household Supplies',
  sponge: 'Household Supplies',
  tissue: 'Household Supplies',
  shampoo: 'Personal Care',
  toothpaste: 'Personal Care',
  soap: 'Personal Care',
  lotion: 'Personal Care',
  notebook: 'Kids / School',
  crayon: 'Kids / School',
  ruler: 'Kids / School',
  cable: 'Electronics',
  adapter: 'Electronics',
  charger: 'Electronics',
  drill: 'Hardware / DIY',
  bit: 'Hardware / DIY',
  flower: 'Gifts / Flowers',
  bouquet: 'Gifts / Flowers',
  cat: 'Pet Supplies',
  dog: 'Pet Supplies',
}

function buildCategoryMap(categories: CategoryRow[]) {
  return categories.reduce<Record<string, CategoryRow>>((acc, category) => {
    acc[category.name.trim().toLowerCase()] = category
    return acc
  }, {})
}

function resolveCategoryByName(categories: Record<string, CategoryRow>, name?: string | null) {
  if (!name) return null
  return categories[name.trim().toLowerCase()] ?? null
}

function pickHeuristicCategory(text: string, keywordMap: Record<string, string>): string | null {
  const normalized = text.toLowerCase()
  for (const [keyword, category] of Object.entries(keywordMap)) {
    if (normalized.includes(keyword)) return category
  }
  return null
}

function parseLlmClassificationPayload(content: string) {
  try {
    const parsed = JSON.parse(content) as {
      category?: string
      confidence?: number
      rationale?: string
      itemCategories?: Array<{ itemName?: string; category?: string; confidence?: number; rationale?: string }>
    }

    return {
      category: parsed.category?.trim() || null,
      confidence: clampConfidence(parsed.confidence, 0),
      rationale: parsed.rationale?.trim() || null,
      itemCategories: Array.isArray(parsed.itemCategories) ? parsed.itemCategories : [],
    }
  } catch {
    return {
      category: null,
      confidence: 0,
      rationale: null,
      itemCategories: [] as Array<{ itemName?: string; category?: string; confidence?: number; rationale?: string }>,
    }
  }
}

async function classifyWithLlm(params: {
  merchant: string | null
  items: StagingItem[]
  categories: CategoryRow[]
  webSummary?: string | null
}) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      category: null,
      confidence: 0,
      rationale: null,
      itemCategories: [] as Array<{ itemName?: string; category?: string; confidence?: number; rationale?: string }>,
    }
  }

  const categoryNames = params.categories.map((category) => category.name).join(', ')

  const systemPrompt = `You classify shopping receipts into receipt-only categories.\nReturn JSON only:\n{\n  "category": "one value from allowed categories",\n  "confidence": number,\n  "rationale": "short reason",\n  "itemCategories": [{"itemName": string, "category": string, "confidence": number, "rationale": string}]\n}\nAllowed categories: ${categoryNames}\nUse item-level evidence. Do not use payment semantics.`

  const userPrompt = [
    `Merchant: ${params.merchant || 'unknown'}`,
    `Items: ${params.items.map((item) => item.item_name).filter(Boolean).join(', ') || 'none'}`,
    params.webSummary ? `Web Summary: ${params.webSummary}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  })

  const content = response.choices[0]?.message?.content || '{}'
  return parseLlmClassificationPayload(content)
}

function buildDominantCategoryFromItems(
  itemResults: ReceiptClassificationItemResult[],
  items: StagingItem[],
): { categoryName: string | null; categoryId: string | null; isMixedBasket: boolean } {
  const totals = new Map<string, { categoryId: string | null; total: number }>()

  for (const itemResult of itemResults) {
    if (!itemResult.categoryName) continue
    const item = items.find((candidate) => candidate.id === itemResult.stagingItemId)
    const total = parseNumeric(item?.line_total) ?? 0
    const current = totals.get(itemResult.categoryName) ?? { categoryId: itemResult.categoryId, total: 0 }
    current.total += total
    totals.set(itemResult.categoryName, current)
  }

  if (totals.size === 0) {
    return { categoryName: null, categoryId: null, isMixedBasket: false }
  }

  const sorted = Array.from(totals.entries()).sort((left, right) => right[1].total - left[1].total)
  const totalSpend = sorted.reduce((sum, [, data]) => sum + data.total, 0)
  const top = sorted[0]
  const second = sorted[1]

  const topShare = totalSpend > 0 ? top[1].total / totalSpend : 1
  const secondShare = second && totalSpend > 0 ? second[1].total / totalSpend : 0

  return {
    categoryName: top[0],
    categoryId: top[1].categoryId,
    isMixedBasket: secondShare >= 0.2 && topShare <= 0.75,
  }
}

async function loadStagingData(supabase: SupabaseClient<any>, stagingTransactionId: string) {
  const [headerResult, itemsResult] = await Promise.all([
    supabase
      .from('receipt_staging_transactions')
      .select('id, household_id, merchant_name, transaction_total, currency, payment_type, receipt_reference, extraction_confidence, raw_extraction_json')
      .eq('id', stagingTransactionId)
      .single(),
    supabase
      .from('receipt_staging_items')
      .select('id, item_name, quantity, unit_price, line_total')
      .eq('staging_transaction_id', stagingTransactionId)
      .order('line_number', { ascending: true }),
  ])

  if (headerResult.error || !headerResult.data) {
    throw new Error(headerResult.error?.message || 'Staging receipt not found')
  }

  if (itemsResult.error) {
    throw new Error(itemsResult.error.message)
  }

  return {
    header: headerResult.data as StagingHeader,
    items: (itemsResult.data ?? []) as StagingItem[],
  }
}

async function lookupKnowledgeBase(
  supabase: SupabaseClient<any>,
  householdId: string,
  merchantName: string | null,
  items: StagingItem[],
): Promise<{ merchantCategory: CategoryCandidate | null; itemCategories: Map<string, CategoryCandidate> }> {
  const normalizedMerchant = normalizeMerchantName(merchantName)
  const normalizedItems = items
    .map((item) => ({ id: item.id, normalized: normalizeItemName(item.item_name) }))
    .filter((entry) => entry.normalized)

  const [merchantResult, itemKbResult] = await Promise.all([
    normalizedMerchant
      ? supabase
          .from('receipt_merchant_kb')
          .select('receipt_categories(name), confidence')
          .eq('household_id', householdId)
          .eq('normalized_merchant_name', normalizedMerchant)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    normalizedItems.length > 0
      ? supabase
          .from('receipt_item_kb')
          .select('normalized_item_pattern, receipt_categories(name), confidence')
          .eq('household_id', householdId)
          .in('normalized_item_pattern', normalizedItems.map((entry) => entry.normalized))
      : Promise.resolve({ data: [], error: null }),
  ])

  const itemMap = new Map<string, CategoryCandidate>()

  if (itemKbResult.error) {
    throw new Error(itemKbResult.error.message)
  }

  const itemRows = (itemKbResult.data ?? []) as Array<{
    normalized_item_pattern: string
    confidence: number
    receipt_categories: { name: string } | { name: string }[] | null
  }>

  for (const item of normalizedItems) {
    const kbMatch = itemRows.find((row) => row.normalized_item_pattern === item.normalized)
    const categoryName = kbMatch ? (Array.isArray(kbMatch.receipt_categories) ? kbMatch.receipt_categories[0]?.name : kbMatch.receipt_categories?.name) : null
    if (categoryName) {
      itemMap.set(item.id, {
        categoryName,
        source: 'knowledge_base',
        confidence: clampConfidence(kbMatch?.confidence, 1),
        rationale: 'Matched receipt item knowledge base entry.',
      })
    }
  }

  const merchantData = merchantResult.data as {
    confidence: number
    receipt_categories: { name: string } | { name: string }[] | null
  } | null

  if (!normalizedMerchant || !merchantData) {
    return {
      merchantCategory: null,
      itemCategories: itemMap,
    }
  }

  const merchantCategoryName = Array.isArray(merchantData.receipt_categories)
    ? merchantData.receipt_categories[0]?.name
    : merchantData.receipt_categories?.name

  if (!merchantCategoryName) {
    return {
      merchantCategory: null,
      itemCategories: itemMap,
    }
  }

  return {
    merchantCategory: {
      categoryName: merchantCategoryName,
      source: 'knowledge_base',
      confidence: clampConfidence(merchantData.confidence, 1),
      rationale: 'Matched receipt merchant knowledge base entry.',
    },
    itemCategories: itemMap,
  }
}

function classifyWithHeuristics(params: {
  merchantName: string | null
  itemName: string | null
}): CategoryCandidate | null {
  const merchantText = params.merchantName?.toLowerCase() || ''
  const itemText = params.itemName?.toLowerCase() || ''

  const merchantCategory = merchantText ? pickHeuristicCategory(merchantText, MERCHANT_KEYWORD_CATEGORY) : null
  if (merchantCategory) {
    return {
      categoryName: merchantCategory,
      source: 'heuristic',
      confidence: 0.72,
      rationale: `Merchant keyword match: ${merchantCategory}.`,
    }
  }

  const itemCategory = itemText ? pickHeuristicCategory(itemText, ITEM_KEYWORD_CATEGORY) : null
  if (itemCategory) {
    return {
      categoryName: itemCategory,
      source: 'heuristic',
      confidence: 0.7,
      rationale: `Item keyword match: ${itemCategory}.`,
    }
  }

  return null
}

async function maybeWebCategory(merchantName: string | null) {
  if (!merchantName) return null

  try {
    const result = await searchMerchantOnWeb(`${merchantName} singapore business type`)
    if (!result?.summary) return null

    const category = pickHeuristicCategory(result.summary.toLowerCase(), {
      supermarket: 'Groceries',
      grocery: 'Groceries',
      pharmacy: 'Medical / Pharmacy',
      clinic: 'Medical / Pharmacy',
      cafe: 'Dining / Food Purchase',
      restaurant: 'Dining / Food Purchase',
      furniture: 'Home Furnishing',
      electronics: 'Electronics',
      hardware: 'Hardware / DIY',
      school: 'Kids / School',
    })

    if (!category) {
      return {
        categoryName: null,
        webSummary: result.summary,
      }
    }

    return {
      categoryName: category,
      webSummary: result.summary,
    }
  } catch {
    return null
  }
}

export async function classifyReceiptStaging(params: {
  supabase: SupabaseClient<any>
  stagingTransactionId: string
  actorUserId?: string | null
  persistKnowledge?: boolean
  force?: boolean
}): Promise<ReceiptClassificationResult & { runId: string }> {
  const { header, items } = await loadStagingData(params.supabase, params.stagingTransactionId)
  const categories = await fetchReceiptCategories(params.supabase, header.household_id)
  const categoryMap = buildCategoryMap(categories as CategoryRow[])

  const kb = await lookupKnowledgeBase(params.supabase, header.household_id, header.merchant_name, items)

  const itemResults: ReceiptClassificationItemResult[] = []

  for (const item of items) {
    const kbMatch = kb.itemCategories.get(item.id)
    if (kbMatch) {
      const category = resolveCategoryByName(categoryMap, kbMatch.categoryName)
      itemResults.push({
        stagingItemId: item.id,
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? kbMatch.categoryName,
        source: kbMatch.source,
        confidence: kbMatch.confidence,
        rationale: kbMatch.rationale,
      })
      continue
    }

    const heuristic = classifyWithHeuristics({ merchantName: null, itemName: item.item_name })
    if (heuristic) {
      const category = resolveCategoryByName(categoryMap, heuristic.categoryName)
      itemResults.push({
        stagingItemId: item.id,
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? heuristic.categoryName,
        source: heuristic.source,
        confidence: heuristic.confidence,
        rationale: heuristic.rationale,
      })
      continue
    }

    itemResults.push({
      stagingItemId: item.id,
      categoryId: null,
      categoryName: null,
      source: 'heuristic',
      confidence: 0.4,
      rationale: 'No item-level match found.',
    })
  }

  let headerCandidate: CategoryCandidate | null = kb.merchantCategory
  let webSummary: string | null = null

  if (!headerCandidate) {
    headerCandidate = classifyWithHeuristics({
      merchantName: header.merchant_name,
      itemName: items.map((item) => item.item_name).filter(Boolean).join(' '),
    })
  }

  if (!headerCandidate || headerCandidate.confidence < 0.7 || params.force) {
    const webCandidate = await maybeWebCategory(header.merchant_name)
    if (webCandidate?.webSummary) {
      webSummary = webCandidate.webSummary
    }

    if (webCandidate?.categoryName) {
      headerCandidate = {
        categoryName: webCandidate.categoryName,
        source: 'web',
        confidence: 0.76,
        rationale: 'Web business summary matched a receipt category.',
      }
    }
  }

  if (!headerCandidate || headerCandidate.confidence < 0.7 || params.force) {
    const llm = await classifyWithLlm({
      merchant: header.merchant_name,
      items,
      categories: categories as CategoryRow[],
      webSummary,
    })

    if (llm.category) {
      headerCandidate = {
        categoryName: llm.category,
        source: 'llm',
        confidence: llm.confidence,
        rationale: llm.rationale,
      }

      for (const itemSuggestion of llm.itemCategories) {
        const matching = items.find(
          (item) => normalizeItemName(item.item_name) === normalizeItemName(itemSuggestion.itemName),
        )
        if (!matching || !itemSuggestion.category) continue

        const category = resolveCategoryByName(categoryMap, itemSuggestion.category)
        itemResults.push({
          stagingItemId: matching.id,
          categoryId: category?.id ?? null,
          categoryName: category?.name ?? itemSuggestion.category,
          source: 'llm',
          confidence: clampConfidence(itemSuggestion.confidence, llm.confidence || 0.65),
          rationale: itemSuggestion.rationale || llm.rationale,
        })
      }
    }
  }

  const dedupedByItem = new Map<string, ReceiptClassificationItemResult>()
  for (const result of itemResults) {
    const current = dedupedByItem.get(result.stagingItemId)
    if (!current || result.confidence > current.confidence) {
      dedupedByItem.set(result.stagingItemId, result)
    }
  }

  const normalizedItemResults = Array.from(dedupedByItem.values())
  const dominant = buildDominantCategoryFromItems(normalizedItemResults, items)

  let resolvedCategory = dominant.categoryName
    ? resolveCategoryByName(categoryMap, dominant.categoryName)
    : null

  if (!resolvedCategory && headerCandidate?.categoryName) {
    resolvedCategory = resolveCategoryByName(categoryMap, headerCandidate.categoryName)
  }

  if (!resolvedCategory) {
    resolvedCategory = await findReceiptCategoryByName(params.supabase, header.household_id, 'Mixed Basket')
  }

  const finalSource: ReceiptClassificationSource = resolvedCategory
    ? headerCandidate?.source ?? 'heuristic'
    : 'mixed'

  const finalConfidence = Math.max(
    clampConfidence(headerCandidate?.confidence, 0.5),
    clampConfidence(header.extraction_confidence, 0.5),
  )

  const { data: runData, error: runError } = await params.supabase
    .from('receipt_classification_runs')
    .insert({
      household_id: header.household_id,
      staging_transaction_id: header.id,
      run_version: RECEIPT_CLASSIFICATION_VERSION,
      classified_by: finalSource,
      classification_confidence: finalConfidence,
      model: finalSource === 'llm' ? 'gpt-4o-mini' : finalSource,
      rationale: headerCandidate?.rationale || 'Derived from receipt classification pipeline.',
      web_summary: webSummary,
      input_snapshot: {
        merchant: header.merchant_name,
        itemNames: items.map((item) => item.item_name),
      },
      output_snapshot: {
        categoryId: resolvedCategory?.id ?? null,
        categoryName: resolvedCategory?.name ?? null,
        isMixedBasket: dominant.isMixedBasket,
      },
      created_by: params.actorUserId ?? null,
    })
    .select('id')
    .single()

  if (runError || !runData) {
    throw new Error(runError?.message || 'Failed to persist receipt classification run')
  }

  for (const itemResult of normalizedItemResults) {
    await params.supabase.from('receipt_item_classifications').insert({
      classification_run_id: runData.id,
      staging_item_id: itemResult.stagingItemId,
      receipt_category_id: itemResult.categoryId,
      classified_by: itemResult.source,
      confidence: itemResult.confidence,
      rationale: itemResult.rationale,
    })

    await params.supabase
      .from('receipt_staging_items')
      .update({
        receipt_category_id: itemResult.categoryId,
        classification_source: itemResult.source,
        classification_confidence: itemResult.confidence,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemResult.stagingItemId)
  }

  await params.supabase
    .from('receipt_staging_transactions')
    .update({
      receipt_category_id: resolvedCategory?.id ?? null,
      classification_source: finalSource,
      classification_confidence: finalConfidence,
      classification_version: RECEIPT_CLASSIFICATION_VERSION,
      is_mixed_basket: dominant.isMixedBasket,
      updated_at: new Date().toISOString(),
    })
    .eq('id', header.id)

  if (params.persistKnowledge && resolvedCategory?.id && finalConfidence >= 0.85) {
    if (header.merchant_name) {
      await upsertReceiptMerchantKnowledge({
        supabase: params.supabase,
        householdId: header.household_id,
        merchantName: header.merchant_name,
        canonicalMerchantName: header.merchant_name,
        categoryId: resolvedCategory.id,
        confidence: finalConfidence,
        source: finalSource,
        notes: 'Auto-learned from high-confidence receipt classification.',
      })
    }

    const topItems = items
      .map((item) => ({
        item,
        lineTotal: parseNumeric(item.line_total) ?? 0,
      }))
      .sort((left, right) => right.lineTotal - left.lineTotal)
      .slice(0, 3)

    for (const entry of topItems) {
      if (!entry.item.item_name) continue
      const itemClassification = normalizedItemResults.find((itemResult) => itemResult.stagingItemId === entry.item.id)
      if (!itemClassification?.categoryId || itemClassification.confidence < 0.85) continue

      await upsertReceiptItemKnowledge({
        supabase: params.supabase,
        householdId: header.household_id,
        itemName: entry.item.item_name,
        categoryId: itemClassification.categoryId,
        confidence: itemClassification.confidence,
        source: itemClassification.source,
        notes: 'Auto-learned from high-confidence receipt item classification.',
      })
    }
  }

  return {
    runId: runData.id,
    source: finalSource,
    confidence: finalConfidence,
    categoryId: resolvedCategory?.id ?? null,
    categoryName: resolvedCategory?.name ?? null,
    isMixedBasket: dominant.isMixedBasket,
    rationale: headerCandidate?.rationale || null,
    webSummary,
    version: RECEIPT_CLASSIFICATION_VERSION,
    itemResults: normalizedItemResults,
  }
}
