/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import {
  syncReceiptKnowledgeMarkdown,
  upsertReceiptItemKnowledge,
  upsertReceiptMerchantKnowledge,
} from '@/lib/receipts/knowledge'
import { resolveOrCreateReceiptCategory } from '@/lib/server/category-service'

interface ApplySuggestionPayload {
  action?: 'set_field' | 'set_item_category' | 'set_header_category'
  target: 'header' | 'item'
  itemId?: string
  field: string
  value: string | number | boolean | null
  targetCategoryName?: string | null
  targetCategoryId?: string | null
  createCategoryIfMissing?: boolean
  reason?: string
}

interface HouseholdContext {
  userId: string
  householdId: string
}


const ALLOWED_HEADER_FIELDS = new Set([
  'merchant_name',
  'txn_date',
  'payment_time',
  'transaction_total',
  'payment_information',
  'payment_type',
  'payment_breakdown_json',
  'receipt_reference',
  'tax_amount',
  'currency',
  'notes',
  'receipt_category_id',
  'is_mixed_basket',
  'user_confirmed_low_confidence',
])

const ALLOWED_ITEM_FIELDS = new Set([
  'item_name',
  'quantity',
  'unit_price',
  'line_total',
  'line_discount',
  'receipt_category_id',
])

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ')
}

function categoryByName(categories: CategoryRow[], name: string) {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ')
  return categories.find((category) => category.name.trim().toLowerCase().replace(/\s+/g, ' ') === normalized) ?? null
}

function categoryById(categories: CategoryRow[], id: string) {
  return categories.find((category) => category.id === id) ?? null
}

function normalizeCategoryName(raw: string) {
  const cleaned = normalizeText(raw)
  if (!cleaned) return null
  return cleaned.slice(0, 80)
}

async function getHouseholdContext(): Promise<{ ok: true; value: HouseholdContext } | { ok: false; error: NextResponse }> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('household_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return { ok: false, error: NextResponse.json({ error: 'No profile found' }, { status: 404 }) }
  }

  return {
    ok: true,
    value: {
      userId: user.id,
      householdId: profile.household_id,
    },
  }
}

async function loadVisibleCategories(db: any, householdId: string) {
  const { data, error } = await db
    .from('receipt_categories')
    .select('id, household_id, name, category_family, sort_order')
    .or(`household_id.is.null,household_id.eq.${householdId}`)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as CategoryRow[]
}

async function createCategory(params: {
  db: any
  householdId: string
  categoryName: string
  categories: CategoryRow[]
}) {
  const householdSortOrder = params.categories
    .filter((category) => category.household_id === params.householdId)
    .reduce((max, category) => Math.max(max, category.sort_order || 100), 100)

  const { data, error } = await params.db
    .from('receipt_categories')
    .insert({
      household_id: params.householdId,
      name: params.categoryName,
      category_family: 'custom',
      description: 'Created from receipt chat correction.',
      sort_order: householdSortOrder + 10,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select('id, household_id, name, category_family, sort_order')
    .single()

  if (!error && data) {
    return data as CategoryRow
  }

  if (!error) {
    throw new Error('Failed to create receipt category')
  }

  if (!/duplicate key/i.test(error.message)) {
    throw new Error(error.message)
  }

  const freshCategories = await loadVisibleCategories(params.db, params.householdId)
  const existing = categoryByName(freshCategories, params.categoryName)
  if (!existing) {
    throw new Error('Category creation failed due to conflict and could not be recovered')
  }

  return existing
}

async function resolveOrCreateCategory(params: {
  db: any
  householdId: string
  suggestion: ApplySuggestionPayload
}): Promise<{ category: CategoryRow; created: boolean; categories: CategoryRow[] }> {
  const categories = await loadVisibleCategories(params.db, params.householdId)

  const targetCategoryId = normalizeText(params.suggestion.targetCategoryId)
  const targetCategoryName = normalizeCategoryName(
    params.suggestion.targetCategoryName || (typeof params.suggestion.value === 'string' ? params.suggestion.value : ''),
  )

  if (targetCategoryId && UUID_REGEX.test(targetCategoryId)) {
    const matchedById = categoryById(categories, targetCategoryId)
    if (matchedById) {
      return { category: matchedById, created: false, categories }
    }
  }

  // Name matching is migration fallback only for older payloads that do not include IDs.
  if (targetCategoryName) {
    const matchedByName = categoryByName(categories, targetCategoryName)
    if (matchedByName) {
      return { category: matchedByName, created: false, categories }
    }

    if (!params.suggestion.createCategoryIfMissing) {
      throw new Error(`Receipt category "${targetCategoryName}" does not exist.`)
    }

    const created = await createCategory({
      db: params.db,
      householdId: params.householdId,
      categoryName: targetCategoryName,
      categories,
    })

    const refreshed = await loadVisibleCategories(params.db, params.householdId)
    return { category: created, created: true, categories: refreshed }
  }

  throw new Error('Category resolution failed: missing category id/name in suggestion payload.')
  return { ok: true, value: { userId: user.id, householdId: profile.household_id } }
}

function suggestionKind(suggestion: ApplySuggestionPayload) {
  if (suggestion.action === 'set_item_category' || suggestion.action === 'set_header_category') {
    return suggestion.action
  }

  const field = normalizeText(suggestion.field).toLowerCase()
  if (field === 'receipt_category_id' || field === 'receipt_category' || field === 'category') {
    return suggestion.target === 'item' ? 'set_item_category' : 'set_header_category'
  }

  return 'set_field'
}

async function bestEffortKnowledgeSync(params: {
  db: any
  householdId: string
  userId: string
  reason: string
  warningBag: string[]
}) {
  try {
    await syncReceiptKnowledgeMarkdown({
      supabase: params.db,
      householdId: params.householdId,
      reason: params.reason,
      actorUserId: params.userId,
      source: 'user',
    })
  } catch (error) {
    params.warningBag.push(
      error instanceof Error
        ? `Applied successfully, but markdown KB sync failed: ${error.message}`
        : 'Applied successfully, but markdown KB sync failed.',
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  try {
    const ctx = await getHouseholdContext()
    if (!ctx.ok) return ctx.error

    const { uploadId } = await params
    const body = await request.json()
    const suggestion = body?.suggestion as ApplySuggestionPayload | undefined

    if (!suggestion || typeof suggestion !== 'object') {
      return NextResponse.json({ error: 'Suggestion payload is required' }, { status: 400 })
    }

    if (suggestion.target !== 'header' && suggestion.target !== 'item') {
      return NextResponse.json({ error: 'Suggestion target must be header or item' }, { status: 400 })
    }

    const db = createServiceSupabaseClient() as any
    const warnings: string[] = []

    const { data: staging, error: stagingError } = await db
      .from('receipt_staging_transactions')
      .select('id, household_id, merchant_name')
      .eq('upload_id', uploadId)
      .eq('household_id', ctx.value.householdId)
      .single()

    if (stagingError || !staging) {
      return NextResponse.json({ error: 'Staged receipt not found' }, { status: 404 })
    }

    const kind = suggestionKind(suggestion)

    if (kind === 'set_item_category') {
      if (!suggestion.itemId) {
        return NextResponse.json({ error: 'itemId is required for item category updates' }, { status: 400 })
      }

      const { category, created, categories } = await resolveOrCreateReceiptCategory({
        db,
        householdId: ctx.value.householdId,
        targetCategoryId: suggestion.targetCategoryId,
        targetCategoryName: suggestion.targetCategoryName || (typeof suggestion.value === 'string' ? suggestion.value : null),
        createIfMissing: suggestion.createCategoryIfMissing,
      })

      const { data: stagingItem, error: stagingItemError } = await db
        .from('receipt_staging_items')
        .select('id, item_name')
        .eq('id', suggestion.itemId)
        .eq('staging_transaction_id', staging.id)
        .single()

      if (stagingItemError || !stagingItem) {
        return NextResponse.json({ error: 'Receipt item not found for this upload' }, { status: 404 })
      }

      const nowIso = new Date().toISOString()
      const { error: updateError } = await db
        .from('receipt_staging_items')
        .update({
          receipt_category_id: category.id,
          classification_source: 'user',
          classification_confidence: 1,
          is_edited: true,
          updated_at: nowIso,
        })
        .eq('id', suggestion.itemId)
        .eq('staging_transaction_id', staging.id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      if (stagingItem.item_name) {
        try {
          await upsertReceiptItemKnowledge({
            supabase: db,
            householdId: ctx.value.householdId,
            itemName: String(stagingItem.item_name),
            categoryId: category.id,
            confidence: 1,
            source: 'user',
            notes: suggestion.reason || 'User correction from receipt chat assistant.',
          })
        } catch (error) {
          warnings.push(
            error instanceof Error
              ? `Applied successfully, but item knowledge update failed: ${error.message}`
              : 'Applied successfully, but item knowledge update failed.',
          )
        }
      }

      await bestEffortKnowledgeSync({
        db,
        householdId: ctx.value.householdId,
        userId: ctx.value.userId,
        reason: 'receipt_chat_item_category_correction',
        warningBag: warnings,
      })

      const { data: updatedItem, error: updatedItemError } = await db
        .from('receipt_staging_items')
        .select('*')
        .eq('id', suggestion.itemId)
        .single()

      if (updatedItemError || !updatedItem) {
        return NextResponse.json({ error: updatedItemError?.message || 'Failed to load updated item' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        target: 'item',
        createdCategory: created,
        category: { id: category.id, name: category.name },
        item: updatedItem,
        categories,
        warnings,
      })
    }

    if (kind === 'set_header_category') {
      const { category, created, categories } = await resolveOrCreateReceiptCategory({
        db,
        householdId: ctx.value.householdId,
        targetCategoryId: suggestion.targetCategoryId,
        targetCategoryName: suggestion.targetCategoryName || (typeof suggestion.value === 'string' ? suggestion.value : null),
        createIfMissing: suggestion.createCategoryIfMissing,
      })

      const nowIso = new Date().toISOString()
      const { error: updateError } = await db
        .from('receipt_staging_transactions')
        .update({
          receipt_category_id: category.id,
          classification_source: 'user',
          classification_confidence: 1,
          updated_at: nowIso,
        })
        .eq('id', staging.id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      if (staging.merchant_name) {
        try {
          await upsertReceiptMerchantKnowledge({
            supabase: db,
            householdId: ctx.value.householdId,
            merchantName: String(staging.merchant_name),
            canonicalMerchantName: String(staging.merchant_name),
            categoryId: category.id,
            confidence: 1,
            source: 'user',
            notes: suggestion.reason || 'User correction from receipt chat assistant.',
          })
        } catch (error) {
          warnings.push(
            error instanceof Error
              ? `Applied successfully, but merchant knowledge update failed: ${error.message}`
              : 'Applied successfully, but merchant knowledge update failed.',
          )
        }
      }

      await bestEffortKnowledgeSync({
        db,
        householdId: ctx.value.householdId,
        userId: ctx.value.userId,
        reason: 'receipt_chat_header_category_correction',
        warningBag: warnings,
      })

      const { data: updatedStaging, error: updatedStagingError } = await db
        .from('receipt_staging_transactions')
        .select('*')
        .eq('id', staging.id)
        .single()

      if (updatedStagingError || !updatedStaging) {
        return NextResponse.json({ error: updatedStagingError?.message || 'Failed to load updated receipt header' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        target: 'header',
        createdCategory: created,
        category: { id: category.id, name: category.name },
        staging: updatedStaging,
        categories,
        warnings,
      })
    }

    const field = normalizeText(suggestion.field)
    if (!field) {
      return NextResponse.json({ error: 'Suggestion field is required for set_field actions' }, { status: 400 })
    }

    const nowIso = new Date().toISOString()

    if (suggestion.target === 'header') {
      if (!ALLOWED_HEADER_FIELDS.has(field)) {
        return NextResponse.json({ error: `Header field "${field}" is not editable.` }, { status: 400 })
      }

      const { error: updateError } = await db
        .from('receipt_staging_transactions')
        .update({
          [field]: suggestion.value,
          updated_at: nowIso,
        })
        .eq('id', staging.id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      const { data: updatedStaging, error: updatedStagingError } = await db
        .from('receipt_staging_transactions')
        .select('*')
        .eq('id', staging.id)
        .single()

      if (updatedStagingError || !updatedStaging) {
        return NextResponse.json({ error: updatedStagingError?.message || 'Failed to load updated receipt header' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        target: 'header',
        staging: updatedStaging,
        warnings,
      })
    }

    if (!suggestion.itemId) {
      return NextResponse.json({ error: 'itemId is required for item updates' }, { status: 400 })
    }

    if (!ALLOWED_ITEM_FIELDS.has(field)) {
      return NextResponse.json({ error: `Item field "${field}" is not editable.` }, { status: 400 })
    }

    const { error: updateError } = await db
      .from('receipt_staging_items')
      .update({
        [field]: suggestion.value,
        is_edited: true,
        updated_at: nowIso,
      })
      .eq('id', suggestion.itemId)
      .eq('staging_transaction_id', staging.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    const { data: updatedItem, error: updatedItemError } = await db
      .from('receipt_staging_items')
      .select('*')
      .eq('id', suggestion.itemId)
      .single()

    if (updatedItemError || !updatedItem) {
      return NextResponse.json({ error: updatedItemError?.message || 'Failed to load updated item' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      target: 'item',
      item: updatedItem,
      warnings,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to apply chat suggestion' },
      { status: 500 },
    )
  }
}
