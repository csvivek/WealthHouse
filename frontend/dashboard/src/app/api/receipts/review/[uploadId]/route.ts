/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { resolveEffectiveReceiptGroups } from '@/lib/server/category-groups'
import { listTags, searchOrCreateInlineTag, validateTagOwnership } from '@/lib/server/tag-service'

async function getHouseholdContext() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('household_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return { error: NextResponse.json({ error: 'No profile found' }, { status: 404 }) }
  }

  return {
    supabase,
    user,
    householdId: profile.household_id,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  const ctx = await getHouseholdContext()
  if ('error' in ctx) return ctx.error

  try {
    const { uploadId } = await params
    const db = ctx.supabase as any

    const [uploadResult, stagingResult, duplicateResult, categoriesResult, tagsResult] = await Promise.all([
      db
        .from('receipt_uploads')
        .select('*')
        .eq('id', uploadId)
        .eq('household_id', ctx.householdId)
        .single(),
      db
        .from('receipt_staging_transactions')
        .select('*')
        .eq('upload_id', uploadId)
        .eq('household_id', ctx.householdId)
        .maybeSingle(),
      db
        .from('receipt_duplicate_candidates')
        .select('id, score, signals_json, status, candidate_receipt_id, reviewed_at, reviewed_by')
        .eq('upload_id', uploadId)
        .eq('household_id', ctx.householdId)
        .order('score', { ascending: false }),
      db
        .from('receipt_categories')
        .select('id, name, category_family, household_id, sort_order')
        .or(`household_id.is.null,household_id.eq.${ctx.householdId}`)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      listTags(db, {
        householdId: ctx.householdId,
        status: 'active',
        source: 'all',
        sortBy: 'name',
        sortDir: 'asc',
      }),
    ])

    if (uploadResult.error || !uploadResult.data) {
      return NextResponse.json({ error: 'Receipt upload not found' }, { status: 404 })
    }

    if (stagingResult.error) {
      return NextResponse.json({ error: stagingResult.error.message }, { status: 500 })
    }

    if (duplicateResult.error) {
      return NextResponse.json({ error: duplicateResult.error.message }, { status: 500 })
    }

    if (categoriesResult.error) {
      return NextResponse.json({ error: categoriesResult.error.message }, { status: 500 })
    }

    const staging = stagingResult.data ?? null

    let items = [] as Array<Record<string, unknown>>
    let classificationRuns = [] as Array<Record<string, unknown>>

    if (staging?.id) {
      const [stagingItemsResult, stagingRunResult] = await Promise.all([
        db
          .from('receipt_staging_items')
          .select('*')
          .eq('staging_transaction_id', staging.id)
          .order('line_number', { ascending: true }),
        db
          .from('receipt_classification_runs')
          .select('id, classified_by, classification_confidence, rationale, web_summary, created_at, output_snapshot')
          .eq('staging_transaction_id', staging.id)
          .order('created_at', { ascending: false })
          .limit(10),
      ])

      if (stagingItemsResult.error) {
        return NextResponse.json({ error: stagingItemsResult.error.message }, { status: 500 })
      }
      if (stagingRunResult.error) {
        return NextResponse.json({ error: stagingRunResult.error.message }, { status: 500 })
      }

      items = stagingItemsResult.data ?? []
      classificationRuns = stagingRunResult.data ?? []
    }

    const categoryRows = (categoriesResult.data ?? []).map((category: any) => ({
      id: String(category.id),
      name: String(category.name),
      category_family: typeof category.category_family === 'string' ? category.category_family : null,
      sort_order: typeof category.sort_order === 'number' ? category.sort_order : 0,
    }))
    const effectiveGroups = await resolveEffectiveReceiptGroups(db, ctx.householdId, categoryRows)

    return NextResponse.json({
      upload: uploadResult.data,
      staging,
      items,
      duplicates: duplicateResult.data ?? [],
      tags: tagsResult.map((tag) => ({
        id: tag.id,
        name: tag.name,
        color_token: tag.color_token,
        color_hex: tag.color_hex,
        icon_key: tag.icon_key,
        source: tag.source,
      })),
      categories: (categoriesResult.data ?? []).map((category: any) => ({
        ...category,
        effective_group_id: effectiveGroups.get(String(category.id))?.id ?? null,
        effective_group_name: effectiveGroups.get(String(category.id))?.name ?? null,
        effective_group_sort_order: effectiveGroups.get(String(category.id))?.sort_order ?? null,
      })),
      classificationRuns,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load receipt review data' },
      { status: 500 },
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  const ctx = await getHouseholdContext()
  if ('error' in ctx) return ctx.error

  try {
    const { uploadId } = await params
    const db = ctx.supabase as any

    const { data: staging, error: stagingError } = await db
      .from('receipt_staging_transactions')
      .select('id, household_id, tag_ids_json')
      .eq('upload_id', uploadId)
      .eq('household_id', ctx.householdId)
      .single()

    if (stagingError || !staging) {
      return NextResponse.json({ error: 'Staged receipt not found' }, { status: 404 })
    }

    const body = await request.json()

    if (body.header && typeof body.header === 'object') {
      const header = body.header as Record<string, unknown>
      const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }

      const allowedFields = [
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
        'classification_source',
        'tag_ids_json',
      ]

      for (const field of allowedFields) {
        if (Object.hasOwn(header, field)) {
          updatePayload[field] = header[field]
        }
      }

      if (typeof header.inline_tag_name === 'string' && header.inline_tag_name.trim().length > 0) {
        const createdTag = await searchOrCreateInlineTag({
          db,
          householdId: ctx.householdId,
          actorUserId: ctx.user.id,
          name: header.inline_tag_name,
        })
        const existingIds = Array.isArray(updatePayload.tag_ids_json)
          ? (updatePayload.tag_ids_json as unknown[]).filter((value): value is string => typeof value === 'string')
          : Array.isArray(staging.tag_ids_json)
            ? (staging.tag_ids_json as unknown[]).filter((value): value is string => typeof value === 'string')
            : []
        updatePayload.tag_ids_json = Array.from(new Set([...existingIds, createdTag.id]))
      }

      if (Array.isArray(updatePayload.tag_ids_json)) {
        await validateTagOwnership(db, ctx.householdId, updatePayload.tag_ids_json.filter((value): value is string => typeof value === 'string'))
      }

      if (Object.hasOwn(header, 'user_confirmed_low_confidence')) {
        updatePayload.user_confirmed_low_confidence = Boolean(header.user_confirmed_low_confidence)
      }

      await db
        .from('receipt_staging_transactions')
        .update(updatePayload)
        .eq('id', staging.id)
    }

    if (Array.isArray(body.items)) {
      for (const item of body.items as Array<Record<string, unknown>>) {
        if (!item.id || typeof item.id !== 'string') continue

        const itemUpdate: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
          is_edited: true,
        }

        const allowedItemFields = [
          'item_name',
          'quantity',
          'unit_price',
          'line_total',
          'line_discount',
          'receipt_category_id',
          'classification_source',
          'classification_confidence',
        ]

        for (const field of allowedItemFields) {
          if (Object.hasOwn(item, field)) {
            itemUpdate[field] = item[field]
          }
        }

        await db
          .from('receipt_staging_items')
          .update(itemUpdate)
          .eq('id', item.id)
          .eq('staging_transaction_id', staging.id)
      }
    }

    if (Array.isArray(body.duplicateDecisions)) {
      for (const decision of body.duplicateDecisions as Array<Record<string, unknown>>) {
        if (!decision.id || typeof decision.id !== 'string') continue

        await db
          .from('receipt_duplicate_candidates')
          .update({
            status: decision.status,
            reviewed_by: ctx.user.id,
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', decision.id)
          .eq('staging_transaction_id', staging.id)
      }
    }

    await db
      .from('receipt_uploads')
      .update({
        status: 'needs_review',
        updated_at: new Date().toISOString(),
      })
      .eq('id', uploadId)
      .eq('household_id', ctx.householdId)

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update receipt review' },
      { status: 500 },
    )
  }
}
