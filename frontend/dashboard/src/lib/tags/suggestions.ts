/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface TagSuggestion {
  tagId: string | null
  name: string
  confidence: number
  reason: string
  source: string
}

interface SuggestTagsParams {
  db: SupabaseClient<any>
  householdId: string
  merchantName?: string | null
  categoryName?: string | null
  description?: string | null
  sourceText?: string | null
  receiptItems?: Array<string | null | undefined>
  domain: 'statement' | 'receipt'
}

interface TagRow {
  id: string
  name: string
  normalized_name: string
  source: string
  source_member_id: string | null
}

interface MemberRow {
  id: string
  display_name: string
}

const DEFAULT_RULES: Array<{
  tag: string
  patterns: RegExp[]
  minConfidence: number
  reason: string
}> = [
  { tag: 'Travel', patterns: [/\b(airline|airport|hotel|booking|travel|uber trip|grab ride|expedia|agoda)\b/i], minConfidence: 0.84, reason: 'Travel-related merchant or text match.' },
  { tag: 'Vacation', patterns: [/\b(vacation|holiday|resort|tour|attraction)\b/i], minConfidence: 0.78, reason: 'Vacation-related language detected.' },
  { tag: 'Medical', patterns: [/\b(clinic|hospital|pharmacy|guardian|watsons|medical|doctor|dental)\b/i], minConfidence: 0.88, reason: 'Medical or pharmacy language detected.' },
  { tag: 'Tax', patterns: [/\b(iras|tax|gst|vat|assessment|filing)\b/i], minConfidence: 0.91, reason: 'Tax-related authority or language detected.' },
  { tag: 'Subscription', patterns: [/\b(subscription|monthly|annual|membership|netflix|spotify|apple\.com\/bill|google\s*\*|adobe|notion)\b/i], minConfidence: 0.86, reason: 'Recurring subscription language detected.' },
  { tag: 'Business', patterns: [/\b(invoice|office|cowork|workspace|slack|zoom|aws|gcp|software license|vendor)\b/i], minConfidence: 0.76, reason: 'Business or office-related language detected.' },
  { tag: 'Work', patterns: [/\b(payroll|salary advance|office|client|reimburs|work)\b/i], minConfidence: 0.74, reason: 'Work-related language detected.' },
  { tag: 'Reimburse', patterns: [/\b(reimburse|reimbursement|claim back|expense claim)\b/i], minConfidence: 0.92, reason: 'Reimbursement language detected.' },
  { tag: 'Split', patterns: [/\b(splitwise|shared|split bill|owe|group dinner)\b/i], minConfidence: 0.9, reason: 'Shared expense language detected.' },
  { tag: 'Home', patterns: [/\b(home|ikea|muji|furniture|renovation|repair|household)\b/i], minConfidence: 0.72, reason: 'Home-related merchant or text match.' },
  { tag: 'Education', patterns: [/\b(school|course|tuition|class|lesson|udemy|coursera)\b/i], minConfidence: 0.83, reason: 'Education-related language detected.' },
  { tag: 'Insurance', patterns: [/\b(insurance|premium|policy|aia|prudential|great eastern)\b/i], minConfidence: 0.88, reason: 'Insurance-related language detected.' },
  { tag: 'Investment', patterns: [/\b(brokerage|investment|fund|etf|stock purchase|robo advisor)\b/i], minConfidence: 0.87, reason: 'Investment-related language detected.' },
  { tag: 'Gift', patterns: [/\b(gift|bouquet|flowers|present)\b/i], minConfidence: 0.82, reason: 'Gift-related language detected.' },
  { tag: 'Family', patterns: [/\b(family|kids|childcare|school pickup)\b/i], minConfidence: 0.72, reason: 'Family-related language detected.' },
  { tag: 'Friends', patterns: [/\b(friend|friends|hangout|party)\b/i], minConfidence: 0.68, reason: 'Friends-related language detected.' },
  { tag: 'Personal', patterns: [/\b(personal|self care|beauty|salon)\b/i], minConfidence: 0.62, reason: 'Personal-use language detected.' },
]

function normalizeText(value?: string | null) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function collectHaystack(params: SuggestTagsParams) {
  return [
    params.merchantName,
    params.categoryName,
    params.description,
    params.sourceText,
    ...(params.receiptItems ?? []),
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
}

function addSuggestion(
  map: Map<string, TagSuggestion>,
  suggestion: TagSuggestion,
) {
  const key = suggestion.tagId ?? normalizeName(suggestion.name)
  const existing = map.get(key)
  if (!existing || existing.confidence < suggestion.confidence) {
    map.set(key, suggestion)
  }
}

export async function suggestTags(params: SuggestTagsParams): Promise<TagSuggestion[]> {
  const [{ data: tagsData, error: tagsError }, { data: membersData, error: membersError }] = await Promise.all([
    params.db
      .from('tags')
      .select('id, name, normalized_name, source, source_member_id')
      .eq('household_id', params.householdId)
      .eq('is_active', true),
    params.db
      .from('household_members')
      .select('id, display_name')
      .eq('household_id', params.householdId)
      .eq('is_active', true),
  ])

  if (tagsError) throw new Error(tagsError.message)
  if (membersError) throw new Error(membersError.message)

  const tags = (tagsData ?? []) as TagRow[]
  const members = (membersData ?? []) as MemberRow[]
  const tagsByNormalized = new Map(tags.map((tag) => [tag.normalized_name, tag]))

  const haystack = collectHaystack(params)
  const normalizedHaystack = normalizeText(haystack)
  const suggestions = new Map<string, TagSuggestion>()

  for (const rule of DEFAULT_RULES) {
    if (!rule.patterns.some((pattern) => pattern.test(haystack))) continue
    const tag = tagsByNormalized.get(normalizeName(rule.tag))
    if (!tag) continue
    addSuggestion(suggestions, {
      tagId: tag.id,
      name: tag.name,
      confidence: rule.minConfidence,
      reason: rule.reason,
      source: 'rule',
    })
  }

  for (const member of members) {
    const normalizedMember = normalizeText(member.display_name)
    if (!normalizedMember) continue
    const memberTokens = normalizedMember.split(' ').filter((token) => token.length >= 3)
    if (memberTokens.length === 0) continue
    if (!memberTokens.some((token) => normalizedHaystack.includes(token))) continue
    const tag = tags.find((row) => row.source_member_id === member.id)
      ?? tagsByNormalized.get(normalizeName(member.display_name))
    if (!tag) continue
    addSuggestion(suggestions, {
      tagId: tag.id,
      name: tag.name,
      confidence: 0.81,
      reason: `Matched household member name "${member.display_name}".`,
      source: 'member_match',
    })
  }

  if (params.domain === 'receipt' && /\b(recurring|renewal|monthly)\b/i.test(haystack)) {
    const subscriptionTag = tagsByNormalized.get('subscription')
    if (subscriptionTag) {
      addSuggestion(suggestions, {
        tagId: subscriptionTag.id,
        name: subscriptionTag.name,
        confidence: 0.8,
        reason: 'Recurring receipt wording detected.',
        source: 'receipt_rule',
      })
    }
  }

  return Array.from(suggestions.values()).sort((left, right) => right.confidence - left.confidence)
}
