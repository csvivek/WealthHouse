/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { syncReceiptKnowledgeMarkdown, upsertReceiptItemKnowledge, upsertReceiptMerchantKnowledge } from '@/lib/receipts/knowledge'

function hasUnresolvedDuplicates(rows: Array<{ status: string }>) {
  return rows.some((row) => row.status === 'suggested')
}

function requiredFieldsMissing(staging: Record<string, unknown>) {
  const missing: string[] = []
  if (!staging.merchant_name) missing.push('merchant_name')
  if (!staging.txn_date) missing.push('txn_date')
  if (staging.transaction_total == null) missing.push('transaction_total')
  return missing
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient()
    const serviceSupabase = createServiceSupabaseClient() as any

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

    const [uploadResult, stagingResult, duplicateResult] = await Promise.all([
      serviceSupabase
        .from('receipt_uploads')
        .select('*')
        .eq('id', uploadId)
        .eq('household_id', profile.household_id)
        .single(),
      serviceSupabase
        .from('receipt_staging_transactions')
        .select('*')
        .eq('upload_id', uploadId)
        .eq('household_id', profile.household_id)
        .single(),
      serviceSupabase
        .from('receipt_duplicate_candidates')
        .select('id, status')
        .eq('upload_id', uploadId)
        .eq('household_id', profile.household_id),
    ])

    if (uploadResult.error || !uploadResult.data) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    if (stagingResult.error || !stagingResult.data) {
      return NextResponse.json({ error: 'Staging record not found' }, { status: 404 })
    }

    const staging = stagingResult.data as Record<string, unknown>

    const { data: stagingItemsData, error: stagingItemsError } = await serviceSupabase
      .from('receipt_staging_items')
      .select('*')
      .eq('staging_transaction_id', staging.id)
      .order('line_number', { ascending: true })

    if (stagingItemsError) {
      return NextResponse.json({ error: stagingItemsError.message }, { status: 500 })
    }

    const stagingItems = (stagingItemsData ?? []) as Array<Record<string, unknown>>

    const missing = requiredFieldsMissing(staging)
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: 'Required fields are missing before approval.',
          missing,
        },
        { status: 422 },
      )
    }

    const duplicates = (duplicateResult.data ?? []) as Array<{ id: string; status: string }>
    if (hasUnresolvedDuplicates(duplicates)) {
      return NextResponse.json(
        {
          error: 'Resolve duplicate candidates before approval.',
          code: 'receipt_duplicate_review_required',
        },
        { status: 409 },
      )
    }

    const confidence = Number(staging.classification_confidence ?? staging.extraction_confidence ?? 0)
    const warnings = Array.isArray(staging.confidence_warnings_json) ? staging.confidence_warnings_json : []
    const userConfirmedLowConfidence = Boolean(staging.user_confirmed_low_confidence)

    if ((confidence < 0.7 || warnings.length > 0) && !userConfirmedLowConfidence) {
      return NextResponse.json(
        {
          error: 'Low-confidence receipts require user confirmation before approval.',
          code: 'receipt_low_confidence_confirmation_required',
        },
        { status: 409 },
      )
    }

    const existingReceipt = await serviceSupabase
      .from('receipts')
      .select('id')
      .eq('source_upload_id', uploadId)
      .maybeSingle()

    let receiptId = existingReceipt.data?.id as string | undefined

    if (!receiptId) {
      const { data: receiptData, error: insertReceiptError } = await serviceSupabase
        .from('receipts')
        .insert({
          household_id: profile.household_id,
          receipt_datetime: staging.txn_date ? `${staging.txn_date}T${staging.payment_time || '00:00:00'}Z` : null,
          merchant_raw: staging.merchant_name,
          total_amount: staging.transaction_total,
          tax_amount: staging.tax_amount,
          currency: staging.currency || 'SGD',
          payment_method_raw: staging.payment_information,
          source: 'upload',
          file_url: uploadResult.data.storage_path,
          extraction_confidence: staging.extraction_confidence || 0,
          status: 'confirmed',
          receipt_hash: uploadResult.data.file_sha256,
          receipt_reference: staging.receipt_reference,
          payment_type: staging.payment_type,
          payment_breakdown_json: staging.payment_breakdown_json,
          raw_extraction_json: staging.raw_extraction_json,
          parse_warnings_json: staging.confidence_warnings_json,
          source_upload_id: uploadId,
          receipt_category_id: staging.receipt_category_id,
          classification_source: staging.classification_source,
          classification_confidence: staging.classification_confidence,
          classification_version: staging.classification_version,
          is_mixed_basket: staging.is_mixed_basket,
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (insertReceiptError || !receiptData) {
        return NextResponse.json(
          { error: insertReceiptError?.message || 'Failed to insert final receipt' },
          { status: 500 },
        )
      }

      receiptId = receiptData.id as string

      if (stagingItems.length > 0) {
        const receiptItems = stagingItems.map((item) => ({
          receipt_id: receiptId,
          item_name_raw: item.item_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total,
          line_discount: item.line_discount,
          line_metadata_json: item.metadata || {},
          receipt_category_id: item.receipt_category_id,
          classification_source: item.classification_source,
          classification_confidence: item.classification_confidence,
          updated_at: new Date().toISOString(),
        }))

        const { error: itemInsertError } = await serviceSupabase.from('receipt_items').insert(receiptItems)
        if (itemInsertError) {
          return NextResponse.json({ error: itemInsertError.message }, { status: 500 })
        }
      }
    }

    await Promise.all([
      serviceSupabase
        .from('receipt_staging_transactions')
        .update({
          review_status: 'committed',
          committed_receipt_id: receiptId,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', staging.id),
      serviceSupabase
        .from('receipt_uploads')
        .update({
          status: 'committed',
          committed_receipt_id: receiptId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', uploadId),
    ])

    if (staging.receipt_category_id && staging.merchant_name) {
      await upsertReceiptMerchantKnowledge({
        supabase: serviceSupabase,
        householdId: profile.household_id,
        merchantName: String(staging.merchant_name),
        canonicalMerchantName: String(staging.merchant_name),
        categoryId: String(staging.receipt_category_id),
        confidence: Number(staging.classification_confidence || 1),
        source: 'user',
        notes: 'Confirmed at receipt approval.',
      })
    }

    for (const item of stagingItems) {
      if (!item.item_name || !item.receipt_category_id) continue
      await upsertReceiptItemKnowledge({
        supabase: serviceSupabase,
        householdId: profile.household_id,
        itemName: String(item.item_name),
        categoryId: String(item.receipt_category_id),
        confidence: Number(item.classification_confidence || 1),
        source: 'user',
        notes: 'Confirmed at receipt approval.',
      })
    }

    await syncReceiptKnowledgeMarkdown({
      supabase: serviceSupabase,
      householdId: profile.household_id,
      reason: 'receipt_approval',
      actorUserId: user.id,
      source: 'user',
    })

    return NextResponse.json({
      success: true,
      receiptId,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to approve receipt' },
      { status: 500 },
    )
  }
}
