/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { isMerchantSchemaNotReadyError } from '@/lib/merchants/config'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { isReceiptSchemaNotReadyError, receiptSchemaNotReadyResponse } from '@/lib/receipts/config'

export async function GET() {
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

    const buildReceiptsQuery = (includeMerchantJoin: boolean) =>
      serviceSupabase
        .from('receipts')
        .select(
          includeMerchantJoin
            ? 'id, merchant_raw, total_amount, currency, created_at, approved_at, status, source_upload_id, merchant:merchants(name, icon_key, color_token, color_hex)'
            : 'id, merchant_raw, total_amount, currency, created_at, approved_at, status, source_upload_id',
        )
        .eq('household_id', profile.household_id)
        .order('created_at', { ascending: false })
        .limit(100)

    const [uploadsResult, receiptTagsResult] = await Promise.all([
      serviceSupabase
        .from('receipt_uploads')
        .select('id, status, original_filename, file_size_bytes, mime_type, created_at, parse_error, committed_receipt_id, updated_at')
        .eq('household_id', profile.household_id)
        .order('created_at', { ascending: false })
        .limit(200),
      serviceSupabase
        .from('receipt_tags')
        .select('receipt_id, tag:tags(id, name, color_token, color_hex, icon_key, source, is_active)')
        .eq('household_id', profile.household_id),
    ])

    let receiptsResult = await buildReceiptsQuery(true)
    if (isMerchantSchemaNotReadyError(receiptsResult.error, 'merchants')) {
      receiptsResult = await buildReceiptsQuery(false)
    }

    if (isReceiptSchemaNotReadyError(uploadsResult.error, 'receipt_uploads')) {
      return NextResponse.json(receiptSchemaNotReadyResponse('receipt_uploads'), { status: 503 })
    }

    if (isReceiptSchemaNotReadyError(receiptsResult.error, 'receipts')) {
      return NextResponse.json(receiptSchemaNotReadyResponse('receipts'), { status: 503 })
    }

    if (uploadsResult.error) {
      return NextResponse.json({ error: uploadsResult.error.message }, { status: 500 })
    }

    if (receiptsResult.error) {
      return NextResponse.json({ error: receiptsResult.error.message }, { status: 500 })
    }

    if (receiptTagsResult.error) {
      return NextResponse.json({ error: receiptTagsResult.error.message }, { status: 500 })
    }

    const uploads = (uploadsResult.data ?? []) as Array<Record<string, unknown>>
    const receipts = (receiptsResult.data ?? []) as Array<Record<string, unknown>>
    const tagsByReceiptId = new Map<string, Array<Record<string, unknown>>>()
    for (const row of (receiptTagsResult.data ?? []) as Array<Record<string, unknown>>) {
      const receiptId = typeof row.receipt_id === 'string' ? row.receipt_id : null
      const rawTag = row.tag
      const tags = Array.isArray(rawTag) ? rawTag : rawTag ? [rawTag] : []
      const activeTags = tags.filter((tag): tag is Record<string, unknown> => Boolean(tag) && tag.is_active !== false)
      if (!receiptId || activeTags.length === 0) continue
      tagsByReceiptId.set(receiptId, [...(tagsByReceiptId.get(receiptId) ?? []), ...activeTags])
    }

    const stats = {
      totalUploads: uploads.length,
      parsing: uploads.filter((row) => row.status === 'parsing').length,
      needsReview: uploads.filter((row) => row.status === 'needs_review').length,
      ready: uploads.filter((row) => row.status === 'ready_for_approval').length,
      committed: uploads.filter((row) => row.status === 'committed').length,
      failed: uploads.filter((row) => row.status === 'failed').length,
      finalReceipts: receipts.length,
    }

    return NextResponse.json({
      uploads,
      receipts: receipts.map((receipt) => ({
        ...receipt,
        tags: tagsByReceiptId.get(String(receipt.id)) ?? [],
      })),
      stats,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch receipt uploads',
      },
      { status: 500 },
    )
  }
}
