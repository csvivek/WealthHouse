/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { getAuthenticatedHouseholdContext } from '@/lib/server/household-context'
import {
  ensureReceiptsBucket,
  getReceiptsBucket,
  isReceiptCsvImportSchemaNotReadyError,
  isReceiptMerchantContactSchemaNotReadyError,
  isReceiptSchemaNotReadyError,
  mapStorageErrorMessage,
  receiptCsvImportSchemaNotReadyResponse,
  receiptSchemaNotReadyResponse,
  stripReceiptMerchantContactFields,
} from '@/lib/receipts/config'
import { parseCsvReceipts, generateCsvTemplate } from '@/lib/receipts/csv-import'

const CSV_MAX_BYTES = 5 * 1024 * 1024 // 5 MB

async function insertReceiptCsvStagingRow(
  serviceSupabase: any,
  payload: Record<string, unknown>,
) {
  const result = await serviceSupabase.from('receipt_staging_transactions').insert(payload)
  if (!isReceiptMerchantContactSchemaNotReadyError(result.error, 'receipt_staging_transactions')) {
    return result
  }

  return serviceSupabase
    .from('receipt_staging_transactions')
    .insert(stripReceiptMerchantContactFields(payload))
}

/**
 * GET /api/receipts/csv-import
 * Returns the downloadable CSV template with example rows.
 */
export async function GET() {
  const csv = generateCsvTemplate()
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="receipts_template.csv"',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}

/**
 * POST /api/receipts/csv-import
 * Accepts a CSV file (FormData key: "csv"), parses each row, and creates
 * receipt_uploads + receipt_staging_transactions records directly (no AI parsing).
 *
 * Response: { batchId, uploadIds, validCount, failedCount, errors }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthenticatedHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const serviceSupabase = createServiceSupabaseClient() as any

    // Schema probe
    const { error: schemaProbeError } = await serviceSupabase
      .from('receipt_uploads')
      .select('id, import_source, csv_batch_id')
      .limit(1)
    if (isReceiptSchemaNotReadyError(schemaProbeError, 'receipt_uploads')) {
      return NextResponse.json(receiptSchemaNotReadyResponse('receipt_uploads'), { status: 503 })
    }
    if (isReceiptCsvImportSchemaNotReadyError(schemaProbeError, 'receipt_uploads')) {
      return NextResponse.json(receiptCsvImportSchemaNotReadyResponse('receipt_uploads'), { status: 503 })
    }

    // Parse form data
    const formData = await request.formData()
    const csvFile = formData.get('csv') as File | null
    if (!csvFile) {
      return NextResponse.json({ error: 'A CSV file is required (form field: "csv").' }, { status: 400 })
    }

    const mimeType = csvFile.type || ''
    if (mimeType && !['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'].includes(mimeType)) {
      return NextResponse.json({ error: 'File must be a CSV.' }, { status: 422 })
    }

    if (csvFile.size > CSV_MAX_BYTES) {
      return NextResponse.json({ error: 'CSV file is too large. Maximum size is 5 MB.' }, { status: 422 })
    }

    const csvText = await csvFile.text()
    const { valid, errors: parseErrors } = parseCsvReceipts(csvText)

    if (valid.length === 0) {
      return NextResponse.json(
        {
          error: 'No valid rows found in the CSV.',
          validCount: 0,
          failedCount: parseErrors.length,
          errors: parseErrors,
        },
        { status: 422 },
      )
    }

    // Ensure storage bucket exists
    const bucket = getReceiptsBucket()
    const bucketReady = await ensureReceiptsBucket(serviceSupabase, bucket)
    if (!bucketReady.ok) {
      const mapped = mapStorageErrorMessage(bucketReady.error?.message ?? 'Bucket not accessible')
      return NextResponse.json(
        {
          error: 'Receipt storage bucket is missing or inaccessible.',
          action: 'Create the `receipts` bucket in Supabase storage and apply storage policies.',
          details: bucketReady.error?.message ?? null,
        },
        { status: mapped.status === 500 ? 503 : mapped.status },
      )
    }

    // Upload the CSV file once to storage
    const batchId = crypto.randomUUID()
    const csvBytes = Buffer.from(await csvFile.arrayBuffer())
    const csvStoragePath = `households/${ctx.householdId}/csv-imports/${batchId}/receipts.csv`

    const { error: storageError } = await serviceSupabase.storage.from(bucket).upload(csvStoragePath, csvBytes, {
      contentType: 'text/csv',
      upsert: false,
    })

    if (storageError) {
      const mapped = mapStorageErrorMessage(storageError.message)
      return NextResponse.json(
        { error: mapped.userMessage, details: storageError.message },
        { status: mapped.status },
      )
    }

    // Insert receipt_csv_batches row
    const { error: batchInsertError } = await serviceSupabase.from('receipt_csv_batches').insert({
      id: batchId,
      household_id: ctx.householdId,
      uploaded_by: ctx.userId,
      storage_bucket: bucket,
      storage_path: csvStoragePath,
      original_filename: csvFile.name,
      row_count: valid.length + parseErrors.length,
      valid_count: 0, // updated after processing
      failed_count: parseErrors.length,
      status: 'processing',
    })

    if (batchInsertError) {
      if (isReceiptSchemaNotReadyError(batchInsertError, 'receipt_csv_batches')) {
        return NextResponse.json(receiptSchemaNotReadyResponse('receipt_csv_batches'), { status: 503 })
      }
      if (isReceiptCsvImportSchemaNotReadyError(batchInsertError, 'receipt_csv_batches')) {
        return NextResponse.json(receiptCsvImportSchemaNotReadyResponse('receipt_csv_batches'), { status: 503 })
      }
      return NextResponse.json({ error: batchInsertError.message }, { status: 500 })
    }

    // Process each valid CSV row
    const uploadIds: string[] = []
    const rowErrors: { row: number; message: string }[] = [...parseErrors]
    let successCount = 0

    for (let i = 0; i < valid.length; i++) {
      const row = valid[i]
      const csvRowNumber = i + 2 // 1-based + header offset
      const uploadId = crypto.randomUUID()

      // Stable hash per row (batchId + index prevents cross-batch collisions)
      const hashInput = `${batchId}:${i}:${row.merchant_name}:${row.txn_date}:${row.total_amount}`
      const fileHash = crypto.createHash('sha256').update(hashInput).digest('hex')

      // Check for duplicate hash within household (across any non-failed upload)
      const { data: existingUpload } = await serviceSupabase
        .from('receipt_uploads')
        .select('id, status')
        .eq('household_id', ctx.householdId)
        .eq('file_sha256', fileHash)
        .in('status', ['needs_review', 'ready_for_approval', 'committed'])
        .limit(1)
        .maybeSingle()

      if (existingUpload?.id) {
        rowErrors.push({
          row: csvRowNumber,
          message: `Row ${csvRowNumber} (${row.merchant_name} on ${row.txn_date}) was already imported (upload ID: ${existingUpload.id}).`,
        })
        continue
      }

      const originalFilename = `Row ${csvRowNumber}: ${row.merchant_name} (${row.txn_date})`

      // Insert receipt_uploads row (status = 'needs_review', no AI parsing needed)
      const { error: uploadInsertError } = await serviceSupabase.from('receipt_uploads').insert({
        id: uploadId,
        household_id: ctx.householdId,
        uploaded_by: ctx.userId,
        storage_bucket: bucket,
        storage_path: csvStoragePath, // points to the shared CSV file
        original_filename: originalFilename,
        mime_type: 'text/csv',
        file_size_bytes: csvFile.size,
        file_sha256: fileHash,
        status: 'needs_review',
        import_source: 'csv_import',
        csv_batch_id: batchId,
        parse_started_at: new Date().toISOString(),
        parse_completed_at: new Date().toISOString(),
      })

      if (uploadInsertError) {
        rowErrors.push({ row: csvRowNumber, message: `Failed to create upload record: ${uploadInsertError.message}` })
        continue
      }

      // Insert receipt_staging_transactions row (pre-populated from CSV data)
      const stagingInsertPayload = {
        upload_id: uploadId,
        household_id: ctx.householdId,
        merchant_name: row.merchant_name,
        merchant_address: row.merchant_address,
        merchant_phone: row.merchant_phone,
        txn_date: row.txn_date,
        transaction_total: row.total_amount,
        currency: row.currency,
        payment_type: row.payment_type,
        payment_information: row.payment_information,
        receipt_reference: row.receipt_reference,
        tax_amount: row.tax_amount,
        notes: row.notes,
        extraction_confidence: 1.0, // user-provided data, full confidence
        review_status: 'pending',
        requires_manual_review: true,
        confidence_warnings_json: [],
        duplicate_status: 'none',
      }

      const { error: stagingInsertError } = await insertReceiptCsvStagingRow(serviceSupabase, stagingInsertPayload)

      if (stagingInsertError) {
        // Roll back the upload row
        await serviceSupabase.from('receipt_uploads').delete().eq('id', uploadId)
        rowErrors.push({ row: csvRowNumber, message: `Failed to create staging record: ${stagingInsertError.message}` })
        continue
      }

      // Save line items if provided in the CSV row
      if (row.items_json && row.items_json.length > 0) {
        const { data: stagingRow } = await serviceSupabase
          .from('receipt_staging_transactions')
          .select('id')
          .eq('upload_id', uploadId)
          .single()

        if (stagingRow?.id) {
          const itemRows = row.items_json.map((item, itemIndex) => ({
            staging_transaction_id: stagingRow.id,
            line_number: itemIndex + 1,
            item_name: item.name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            line_total: item.line_total,
            line_discount: item.discount,
            raw_line_json: item,
            confidence: 1.0,
            metadata: item.notes ? { notes: item.notes } : {},
          }))

          const { error: itemsError } = await serviceSupabase.from('receipt_staging_items').insert(itemRows)
          if (itemsError) {
            // ON DELETE CASCADE on receipt_uploads removes staging + items
            await serviceSupabase.from('receipt_uploads').delete().eq('id', uploadId)
            rowErrors.push({ row: csvRowNumber, message: `Failed to save line items: ${itemsError.message}` })
            continue
          }
        }
      }

      uploadIds.push(uploadId)
      successCount++
    }

    // Update batch with final counts
    await serviceSupabase
      .from('receipt_csv_batches')
      .update({
        valid_count: successCount,
        failed_count: rowErrors.length,
        status: successCount > 0 ? 'done' : 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId)

    return NextResponse.json({
      batchId,
      uploadIds,
      validCount: successCount,
      failedCount: rowErrors.length,
      errors: rowErrors,
    })
  } catch (error) {
    console.error('CSV import error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'CSV import failed.' },
      { status: 500 },
    )
  }
}
