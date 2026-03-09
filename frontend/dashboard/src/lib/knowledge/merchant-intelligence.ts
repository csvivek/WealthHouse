import { openai } from '@/lib/ai/openai'
import { searchMerchantOnWeb } from '@/lib/ai/web-search'
import {
  backfillMerchantKnowledgeCategoryIds,
  buildMerchantFamilyName,
  findMerchantKnowledgeMatch,
  normalizeMerchantName,
  type MerchantDecisionSource,
} from '@/lib/knowledge/merchant-categories'
import {
  mapApprovedCategoryToAvailableCategory,
  resolveApprovedCategoryName,
  type AvailableCategory,
} from '@/lib/knowledge/categories'

export interface MerchantIntelligenceInput {
  merchantName: string
  description?: string | null
  amount: number
  institutionName?: string | null
  countryCode?: string | null
  availableCategories: AvailableCategory[]
}

export interface MerchantIntelligenceResult {
  categoryId: number | null
  categoryName: string | null
  categoryConfidence: number
  categoryDecisionSource: MerchantDecisionSource
  merchantCanonicalName: string
  merchantBusinessType: string | null
  similarMerchantKey: string
  merchantAliases: string[]
  searchSummary: string | null
}

interface MerchantInferenceResponse {
  canonicalMerchantName?: string
  businessType?: string | null
  category?: string | null
  confidence?: number
  aliases?: string[]
  notes?: string | null
}

function clampConfidence(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  if (value > 1) return Math.max(0, Math.min(1, value / 100))
  return Math.max(0, Math.min(1, value))
}

function sanitizeMerchantInference(
  inference: MerchantInferenceResponse,
  availableCategories: AvailableCategory[],
) {
  const canonicalCategory = resolveApprovedCategoryName(inference.category) || resolveApprovedCategoryName('Other')
  const mappedCategory = mapApprovedCategoryToAvailableCategory(availableCategories, canonicalCategory)

  return {
    canonicalMerchantName: inference.canonicalMerchantName?.trim() || null,
    businessType: inference.businessType?.trim() || null,
    aliases: (inference.aliases ?? []).map((alias) => normalizeMerchantName(alias)).filter(Boolean),
    categoryId: mappedCategory?.id ?? null,
    categoryName: mappedCategory?.name ?? canonicalCategory ?? 'Other',
    confidence: clampConfidence(inference.confidence),
    notes: inference.notes?.trim() || null,
  }
}

async function inferMerchantCategory(params: {
  merchantName: string
  description?: string | null
  amount: number
  institutionName?: string | null
  countryCode?: string | null
  availableCategories: AvailableCategory[]
  webSummary?: string | null
}) {
  const categories = params.availableCategories.map((category) => category.name).join(', ')
  const systemPrompt = `You categorize transaction merchants for WealthHouse.

Return only JSON with this shape:
{
  "canonicalMerchantName": string,
  "businessType": string | null,
  "category": string,
  "confidence": number,
  "aliases": string[],
  "notes": string | null
}

Rules:
- Pick only from these categories: ${categories}
- Confidence can be 0-1 or 0-100
- Base the category on the merchant's business, not the payment channel
- If uncertain, prefer category "Other"
- Canonicalize merchant naming for future matching
- Include aliases only when they are truly the same merchant family`

  const userPrompt = [
    `Merchant: ${params.merchantName}`,
    `Description: ${params.description || 'N/A'}`,
    `Amount: ${params.amount}`,
    `Institution: ${params.institutionName || 'Unknown'}`,
    `Country: ${params.countryCode || 'Unknown'}`,
    params.webSummary ? `Web summary: ${params.webSummary}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  })

  const parsed = JSON.parse(response.choices[0]?.message?.content || '{}') as MerchantInferenceResponse
  return sanitizeMerchantInference(parsed, params.availableCategories)
}

export async function resolveMerchantCategory(
  input: MerchantIntelligenceInput,
): Promise<MerchantIntelligenceResult> {
  backfillMerchantKnowledgeCategoryIds(input.availableCategories.map((category) => ({ id: category.id, name: category.name })))

  const knowledgeMatch = findMerchantKnowledgeMatch(input.merchantName, input.description)
  if (knowledgeMatch) {
    const byId =
      typeof knowledgeMatch.record.approved_category_id === 'number'
        ? input.availableCategories.find((category) => category.id === knowledgeMatch.record.approved_category_id) ?? null
        : null

    const canonicalCategory =
      resolveApprovedCategoryName(knowledgeMatch.record.approved_category_name) || resolveApprovedCategoryName('Other')
    const byNameFallback = mapApprovedCategoryToAvailableCategory(input.availableCategories, canonicalCategory)
    const resolvedCategory = byId ?? byNameFallback

    return {
      categoryId: resolvedCategory?.id ?? knowledgeMatch.record.approved_category_id,
      categoryName: resolvedCategory?.name ?? knowledgeMatch.record.approved_category_name ?? canonicalCategory ?? 'Other',
      categoryConfidence: 1,
      categoryDecisionSource: knowledgeMatch.matchedBy === 'exact' ? 'knowledge_base' : 'alias_resolution',
      merchantCanonicalName: knowledgeMatch.record.canonical_merchant_name,
      merchantBusinessType: knowledgeMatch.record.business_type,
      similarMerchantKey: knowledgeMatch.record.family_name,
      merchantAliases: knowledgeMatch.record.aliases,
      searchSummary: null,
    }
  }

  const inferred = await inferMerchantCategory({
    merchantName: input.merchantName,
    description: input.description,
    amount: input.amount,
    institutionName: input.institutionName,
    countryCode: input.countryCode,
    availableCategories: input.availableCategories,
  })

  if (inferred.confidence >= 0.85) {
    return {
      categoryId: inferred.categoryId,
      categoryName: inferred.categoryName,
      categoryConfidence: inferred.confidence,
      categoryDecisionSource: 'genai_suggestion',
      merchantCanonicalName: inferred.canonicalMerchantName || input.merchantName,
      merchantBusinessType: inferred.businessType,
      similarMerchantKey: buildMerchantFamilyName(inferred.canonicalMerchantName || input.merchantName),
      merchantAliases: inferred.aliases,
      searchSummary: null,
    }
  }

  let webSummary: string | null = null
  try {
    const webResult = await searchMerchantOnWeb(`${input.merchantName} business category ${input.countryCode || 'Singapore'}`)
    webSummary = webResult?.summary ?? null
  } catch {
    webSummary = null
  }

  if (!webSummary) {
    return {
      categoryId: inferred.categoryId,
      categoryName: inferred.categoryName,
      categoryConfidence: inferred.confidence,
      categoryDecisionSource: 'genai_suggestion',
      merchantCanonicalName: inferred.canonicalMerchantName || input.merchantName,
      merchantBusinessType: inferred.businessType,
      similarMerchantKey: buildMerchantFamilyName(inferred.canonicalMerchantName || input.merchantName),
      merchantAliases: inferred.aliases,
      searchSummary: null,
    }
  }

  const enriched = await inferMerchantCategory({
    merchantName: input.merchantName,
    description: input.description,
    amount: input.amount,
    institutionName: input.institutionName,
    countryCode: input.countryCode,
    availableCategories: input.availableCategories,
    webSummary,
  })

  return {
    categoryId: enriched.categoryId,
    categoryName: enriched.categoryName,
    categoryConfidence: enriched.confidence,
    categoryDecisionSource: 'web_enriched',
    merchantCanonicalName: enriched.canonicalMerchantName || inferred.canonicalMerchantName || input.merchantName,
    merchantBusinessType: enriched.businessType || inferred.businessType,
    similarMerchantKey: buildMerchantFamilyName(
      enriched.canonicalMerchantName || inferred.canonicalMerchantName || input.merchantName,
    ),
    merchantAliases: Array.from(new Set([...inferred.aliases, ...enriched.aliases])),
    searchSummary: webSummary,
  }
}
