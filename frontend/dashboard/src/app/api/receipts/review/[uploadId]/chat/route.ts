/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { openai } from '@/lib/ai/openai'

interface ChatSuggestion {
  action?: 'set_field' | 'set_item_category' | 'set_header_category'
  target: 'header' | 'item'
  itemId?: string
  field: string
  value: string | number | boolean | null
  targetCategoryName?: string | null
  targetCategoryId?: string | null
  createCategoryIfMissing?: boolean
  reason?: string
  confidence?: number
}

interface CategoryOption {
  id: string
  name: string
}

interface ItemContext {
  id: string
  line_number: number
  item_name: string | null
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const CATEGORY_FIELDS = new Set([
  'receipt_category_id',
  'receipt_category',
  'category',
  'category_name',
])

function clampConfidence(value: unknown) {
  const num = Number(value)
  if (!Number.isFinite(num)) return undefined
  return Math.max(0, Math.min(1, num))
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ')
}

function normalizeCategoryName(value: unknown) {
  const text = normalizeText(value)
  if (!text) return null
  return text
}

function isCategoryField(field: string) {
  return CATEGORY_FIELDS.has(field.trim().toLowerCase())
}

function categoryByName(categories: CategoryOption[], name: string) {
  const normalized = name.trim().toLowerCase()
  return categories.find((category) => category.name.trim().toLowerCase() === normalized) ?? null
}

function resolveItemId(raw: Record<string, unknown>, items: ItemContext[]) {
  if (typeof raw.itemId === 'string' && items.some((item) => item.id === raw.itemId)) {
    return raw.itemId
  }

  if (typeof raw.lineNumber === 'number') {
    const byLine = items.find((item) => item.line_number === raw.lineNumber)
    if (byLine) return byLine.id
  }

  const itemNameHint = normalizeText(raw.itemName)
  if (itemNameHint) {
    const normalizedHint = itemNameHint.toLowerCase()
    const byName = items.find((item) => (item.item_name || '').trim().toLowerCase() === normalizedHint)
    if (byName) return byName.id
  }

  return undefined
}

function normalizeSuggestion(
  rawSuggestion: unknown,
  categories: CategoryOption[],
  items: ItemContext[],
): ChatSuggestion | null {
  if (!rawSuggestion || typeof rawSuggestion !== 'object') return null

  const raw = rawSuggestion as Record<string, unknown>
  const target: 'header' | 'item' = raw.target === 'item' ? 'item' : 'header'
  const field = normalizeText(raw.field).toLowerCase()
  if (!field) return null

  const confidence = clampConfidence(raw.confidence)
  const reason = normalizeText(raw.reason) || undefined
  const itemId = target === 'item' ? resolveItemId(raw, items) : undefined

  let action: ChatSuggestion['action']
  if (raw.action === 'set_item_category' || raw.action === 'set_header_category' || raw.action === 'set_field') {
    action = raw.action
  } else if (target === 'item' && isCategoryField(field)) {
    action = 'set_item_category'
  } else if (target === 'header' && isCategoryField(field)) {
    action = 'set_header_category'
  } else {
    action = 'set_field'
  }

  const suggestion: ChatSuggestion = {
    action,
    target,
    field,
    value: (raw.value as string | number | boolean | null) ?? null,
    reason,
    confidence,
  }

  if (itemId) {
    suggestion.itemId = itemId
  }

  if (action === 'set_item_category' || action === 'set_header_category') {
    const explicitCategoryId = normalizeText(raw.targetCategoryId)
    const explicitCategoryName = normalizeCategoryName(raw.targetCategoryName)

    let categoryId: string | null = null
    let categoryName: string | null = null

    if (explicitCategoryId && UUID_REGEX.test(explicitCategoryId)) {
      const matchedById = categories.find((category) => category.id === explicitCategoryId)
      if (matchedById) {
        categoryId = matchedById.id
        categoryName = matchedById.name
      }
    }

    if (!categoryId && explicitCategoryName) {
      const matchedByName = categoryByName(categories, explicitCategoryName)
      if (matchedByName) {
        categoryId = matchedByName.id
        categoryName = matchedByName.name
      } else {
        categoryName = explicitCategoryName
      }
    }

    if (!categoryId && typeof raw.value === 'string') {
      const rawValue = normalizeText(raw.value)
      if (UUID_REGEX.test(rawValue)) {
        const matchedById = categories.find((category) => category.id === rawValue)
        if (matchedById) {
          categoryId = matchedById.id
          categoryName = matchedById.name
        }
      } else if (rawValue) {
        const matchedByName = categoryByName(categories, rawValue)
        if (matchedByName) {
          categoryId = matchedByName.id
          categoryName = matchedByName.name
        } else {
          categoryName = rawValue
        }
      }
    }

    suggestion.field = 'receipt_category_id'
    suggestion.value = categoryId || categoryName || null
    suggestion.targetCategoryId = categoryId
    suggestion.targetCategoryName = categoryName
    suggestion.createCategoryIfMissing = Boolean(categoryName && !categoryId)
  }

  if (suggestion.target === 'item' && !suggestion.itemId) {
    return null
  }

  return suggestion
}

function normalizeSuggestions(
  rawSuggestions: unknown,
  categories: CategoryOption[],
  items: ItemContext[],
) {
  if (!Array.isArray(rawSuggestions)) return []

  return rawSuggestions
    .map((suggestion) => normalizeSuggestion(suggestion, categories, items))
    .filter((suggestion): suggestion is ChatSuggestion => Boolean(suggestion))
}

function fallbackResponse(message: string): { assistantMessage: string; suggestions: ChatSuggestion[] } {
  const lower = message.toLowerCase()
  const suggestions: ChatSuggestion[] = []

  if (lower.includes('mixed basket')) {
    suggestions.push({
      action: 'set_field',
      target: 'header',
      field: 'is_mixed_basket',
      value: true,
      reason: 'Marked as mixed basket from user request.',
      confidence: 1,
    })
  }

  return {
    assistantMessage:
      suggestions.length > 0
        ? 'I prepared structured edits based on your request. Review and apply them.'
        : 'I can help with merchant/date/amount/category corrections. Ask me what to change and I will propose structured edits.',
    suggestions,
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient()
    const db = supabase as any

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('household_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'No profile found' }, { status: 404 })
    }

    const { uploadId } = await params
    const body = await request.json()
    const message = typeof body.message === 'string' ? body.message.trim() : ''

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const { data: staging, error: stagingError } = await db
      .from('receipt_staging_transactions')
      .select('*')
      .eq('upload_id', uploadId)
      .eq('household_id', profile.household_id)
      .single()

    if (stagingError || !staging) {
      return NextResponse.json({ error: 'Staged receipt not found' }, { status: 404 })
    }

    const { data: items, error: itemsError } = await db
      .from('receipt_staging_items')
      .select('id, line_number, item_name, quantity, unit_price, line_total, receipt_category_id')
      .eq('staging_transaction_id', staging.id)
      .order('line_number', { ascending: true })

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }

    const { data: categories, error: categoriesError } = await db
      .from('receipt_categories')
      .select('id, name')
      .or(`household_id.is.null,household_id.eq.${profile.household_id}`)
      .eq('is_active', true)

    if (categoriesError) {
      return NextResponse.json({ error: categoriesError.message }, { status: 500 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(fallbackResponse(message))
    }

    const categoryList = (categories ?? []).map((category: CategoryOption) => ({ id: category.id, name: category.name }))
    const itemContext = (items ?? []).map((item: ItemContext) => ({
      id: item.id,
      lineNumber: item.line_number,
      itemName: item.item_name,
      quantity: (item as any).quantity,
      unitPrice: (item as any).unit_price,
      lineTotal: (item as any).line_total,
      receiptCategoryId: (item as any).receipt_category_id,
    }))

    const systemPrompt = `You are a receipt review correction assistant.
Return strict JSON only with this shape:
{
  "assistantMessage": string,
  "suggestions": [
    {
      "action": "set_field" | "set_item_category" | "set_header_category",
      "target": "header" | "item",
      "itemId": "string or omitted",
      "lineNumber": number,
      "itemName": "string",
      "field": "field_name",
      "value": "new value",
      "targetCategoryId": "existing category id when available",
      "targetCategoryName": "category name",
      "createCategoryIfMissing": boolean,
      "reason": "why",
      "confidence": number
    }
  ]
}
Rules:
- Suggest structured edits only.
- Use itemId when editing an item.
- Keep confidence between 0 and 1.
- For category edits use action set_item_category or set_header_category.
- If the category does not exist in availableCategories, return targetCategoryName and set createCategoryIfMissing=true.
- Never output markdown or extra text.`

    const userPrompt = JSON.stringify(
      {
        userMessage: message,
        receiptHeader: {
          merchant_name: staging.merchant_name,
          txn_date: staging.txn_date,
          transaction_total: staging.transaction_total,
          payment_type: staging.payment_type,
          receipt_reference: staging.receipt_reference,
          receipt_category_id: staging.receipt_category_id,
        },
        items: itemContext,
        availableCategories: categoryList,
      },
      null,
      2,
    )

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })

    const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}') as {
      assistantMessage?: string
      suggestions?: unknown
    }

    const assistantMessage = parsed.assistantMessage?.trim() || 'I created structured suggestions for your review.'
    const suggestions = normalizeSuggestions(parsed.suggestions, categoryList, (items ?? []) as ItemContext[])

    return NextResponse.json({
      assistantMessage,
      suggestions,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process receipt chat correction' },
      { status: 500 },
    )
  }
}
