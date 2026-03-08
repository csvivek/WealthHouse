/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import {
  assertReceiptConfig,
  ensureReceiptsBucket,
  getReceiptsBucket,
  isReceiptSchemaNotReadyError,
  mapStorageErrorMessage,
  ReceiptApiError,
  receiptSchemaNotReadyResponse,
  toSafeStorageFilename,
  validateReceiptFile,
} from '@/lib/receipts/config'
import { RECEIPT_ERROR_CODES } from '@/lib/receipts/types'
import { startReceiptIngestionJob } from '@/lib/server/receipt-ingestion-jobs'

interface UserProfile {
  household_id: string
}

async function fetchProfile(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, userId: string) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('household_id')
    .eq('id', userId)
    .single()

  if (error || !data) {
    throw new ReceiptApiError(RECEIPT_ERROR_CODES.UPLOAD_FAILED, 'No profile found for user.', 404)
  }

  return data as UserProfile
}

export async function POST(request: NextRequest) {
  try {
    assertReceiptConfig()

    const supabase = await createServerSupabaseClient()
    const serviceSupabase = createServiceSupabaseClient() as any

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await fetchProfile(supabase, user.id)

    const { error: schemaProbeError } = await serviceSupabase
      .from('receipt_uploads')
      .select('id')
      .limit(1)

    if (isReceiptSchemaNotReadyError(schemaProbeError, 'receipt_uploads')) {
      return NextResponse.json(receiptSchemaNotReadyResponse('receipt_uploads'), { status: 503 })
    }

    const formData = await request.formData()
    const file = formData.get('receipt') as File | null
    if (!file) {
      throw new ReceiptApiError(RECEIPT_ERROR_CODES.INVALID_FILE, 'Receipt image or PDF is required.', 400)
    }

    validateReceiptFile(file)

    const bucket = getReceiptsBucket()

    const bucketReady = await ensureReceiptsBucket(serviceSupabase, bucket)
    if (!bucketReady.ok) {
      const mapped = mapStorageErrorMessage(bucketReady.error?.message ?? 'Bucket not accessible')
      return NextResponse.json(
        {
          error: 'Receipt storage bucket is missing or inaccessible.',
          code: mapped.code,
          action: 'Create the `receipts` bucket in Supabase storage and apply storage policies.',
          details: bucketReady.error?.message ?? null,
        },
        { status: mapped.status === 500 ? 503 : mapped.status },
      )
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')

    const existingUpload = await serviceSupabase
      .from('receipt_uploads')
      .select('id, status')
      .eq('household_id', profile.household_id)
      .eq('file_sha256', hash)
      .in('status', ['uploaded', 'parsing', 'needs_review', 'ready_for_approval', 'committed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (isReceiptSchemaNotReadyError(existingUpload.error, 'receipt_uploads')) {
      return NextResponse.json(receiptSchemaNotReadyResponse('receipt_uploads'), { status: 503 })
    }

    if (existingUpload.data?.id) {
      return NextResponse.json(
        {
          error: 'Duplicate receipt upload detected.',
          code: 'receipt_duplicate_upload',
          uploadId: existingUpload.data.id,
          status: existingUpload.data.status,
        },
        { status: 409 },
      )
    }

    const uploadId = crypto.randomUUID()
    const safeFileName = toSafeStorageFilename(file.name)
    const storagePath = `households/${profile.household_id}/receipts/${uploadId}/${safeFileName}`

    const { error: insertError } = await serviceSupabase
      .from('receipt_uploads')
      .insert({
        id: uploadId,
        household_id: profile.household_id,
        uploaded_by: user.id,
        storage_bucket: bucket,
        storage_path: storagePath,
        original_filename: file.name,
        mime_type: file.type || 'application/octet-stream',
        file_size_bytes: file.size,
        file_sha256: hash,
        status: 'uploaded',
      })

    if (insertError) {
      if (isReceiptSchemaNotReadyError(insertError, 'receipt_uploads')) {
        return NextResponse.json(receiptSchemaNotReadyResponse('receipt_uploads'), { status: 503 })
      }

      return NextResponse.json(
        {
          error: insertError.message,
          code: RECEIPT_ERROR_CODES.UPLOAD_FAILED,
        },
        { status: 500 },
      )
    }

    const { error: uploadError } = await serviceSupabase.storage
      .from(bucket)
      .upload(storagePath, bytes, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (uploadError) {
      const mapped = mapStorageErrorMessage(uploadError.message)
      await serviceSupabase
        .from('receipt_uploads')
        .update({
          status: 'failed',
          error_code: mapped.code,
          error_message: mapped.userMessage,
          parse_error: uploadError.message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', uploadId)

      return NextResponse.json(
        {
          error: mapped.userMessage,
          code: mapped.code,
          details: uploadError.message,
        },
        { status: mapped.status },
      )
    }

    const job = startReceiptIngestionJob({
      uploadId,
      userId: user.id,
      householdId: profile.household_id,
    })

    return NextResponse.json(
      {
        uploadId,
        status: 'parsing',
        job,
      },
      { status: 202 },
    )
  } catch (error) {
    if (error instanceof ReceiptApiError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status },
      )
    }

    console.error('Receipt upload error:', error)
    return NextResponse.json(
      {
        error: 'Failed to upload receipt.',
        code: RECEIPT_ERROR_CODES.UPLOAD_FAILED,
      },
      { status: 500 },
    )
  }
}
