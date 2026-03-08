/* eslint-disable @typescript-eslint/no-explicit-any */
import { parseReceipt } from '@/lib/ai/receipt-parser'
import { classifyReceiptStaging } from '@/lib/receipts/intelligence'
import { generateDuplicateCandidates } from '@/lib/receipts/duplicates'
import { createServiceSupabaseClient } from '@/lib/supabase/service'

interface ReceiptUploadRow {
  id: string
  household_id: string
  uploaded_by: string
  storage_bucket: string
  storage_path: string
  mime_type: string
  file_sha256: string
}

export interface ReceiptIngestionResult {
  uploadId: string
  stagingTransactionId: string
  status: 'needs_review' | 'ready_for_approval'
  classificationRunId: string
  duplicateCandidates: number
}

export class ReceiptIngestionError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.status = status
    this.name = 'ReceiptIngestionError'
  }
}

function findMissingRequiredFields(parsed: {
  merchantName: string | null
  transactionDate: string | null
  transactionTotal: number | null
}) {
  const missing: string[] = []
  if (!parsed.merchantName) missing.push('merchant_name')
  if (!parsed.transactionDate) missing.push('txn_date')
  if (parsed.transactionTotal == null) missing.push('transaction_total')
  return missing
}

export async function processReceiptIngestion(params: {
  uploadId: string
}): Promise<ReceiptIngestionResult> {
  const supabase = createServiceSupabaseClient() as any

  const { data: uploadRow, error: uploadError } = await supabase
    .from('receipt_uploads')
    .select('id, household_id, uploaded_by, storage_bucket, storage_path, mime_type, file_sha256')
    .eq('id', params.uploadId)
    .single()

  if (uploadError || !uploadRow) {
    throw new ReceiptIngestionError(uploadError?.message || 'Receipt upload record not found', 404)
  }

  const upload = uploadRow as ReceiptUploadRow

  await supabase
    .from('receipt_uploads')
    .update({
      status: 'parsing',
      parse_started_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
      parse_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', upload.id)

  try {
    const { data: downloadData, error: downloadError } = await supabase.storage
      .from(upload.storage_bucket)
      .download(upload.storage_path)

    if (downloadError || !downloadData) {
      throw new ReceiptIngestionError(downloadError?.message || 'Receipt file could not be downloaded', 500)
    }

    const buffer = Buffer.from(await downloadData.arrayBuffer())
    const parsed = await parseReceipt(buffer.toString('base64'), upload.mime_type || 'image/jpeg')

    const missingRequiredFields = findMissingRequiredFields(parsed)
    const lowConfidence = parsed.extractionConfidence < 0.65
    const warnings = Array.from(new Set([...(parsed.warnings || []), ...missingRequiredFields]))

    const stagingPayload = {
      upload_id: upload.id,
      household_id: upload.household_id,
      review_status: 'pending',
      duplicate_status: 'none',
      merchant_name: parsed.merchantName,
      txn_date: parsed.transactionDate,
      payment_time: parsed.paymentTime,
      transaction_total: parsed.transactionTotal,
      payment_information: parsed.paymentInformation,
      payment_type: parsed.paymentType,
      payment_breakdown_json: parsed.paymentBreakdown,
      receipt_reference: parsed.receiptReference,
      tax_amount: parsed.taxAmount,
      currency: parsed.currency,
      notes: parsed.notes,
      raw_extraction_json: parsed.rawExtraction,
      extraction_confidence: parsed.extractionConfidence,
      confidence_warnings_json: warnings,
      requires_manual_review: lowConfidence || missingRequiredFields.length > 0,
      updated_at: new Date().toISOString(),
    }

    const { data: stagingRow, error: stagingError } = await supabase
      .from('receipt_staging_transactions')
      .upsert(stagingPayload, { onConflict: 'upload_id' })
      .select('id')
      .single()

    if (stagingError || !stagingRow) {
      throw new ReceiptIngestionError(stagingError?.message || 'Failed to write receipt staging transaction', 500)
    }

    const stagingTransactionId = stagingRow.id as string

    await supabase.from('receipt_staging_items').delete().eq('staging_transaction_id', stagingTransactionId)

    if (parsed.items.length > 0) {
      const itemRows = parsed.items.map((item, index) => ({
        staging_transaction_id: stagingTransactionId,
        line_number: index + 1,
        item_name: item.name,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        line_total: item.lineTotal,
        line_discount: item.discount,
        raw_line_json: item,
        confidence: parsed.extractionConfidence,
        metadata: item.notes ? { notes: item.notes } : {},
      }))

      const { error: itemsError } = await supabase.from('receipt_staging_items').insert(itemRows)
      if (itemsError) {
        throw new ReceiptIngestionError(itemsError.message || 'Failed to write receipt staging items', 500)
      }
    }

    const duplicateCandidates = await generateDuplicateCandidates({
      supabase,
      householdId: upload.household_id,
      uploadId: upload.id,
      staging: {
        id: stagingTransactionId,
        merchant_name: parsed.merchantName,
        txn_date: parsed.transactionDate,
        transaction_total: parsed.transactionTotal,
        receipt_reference: parsed.receiptReference,
      },
      stagingItems: parsed.items.map((item) => ({ item_name: item.name })),
      fileSha256: upload.file_sha256,
    })

    const classification = await classifyReceiptStaging({
      supabase,
      stagingTransactionId,
      actorUserId: upload.uploaded_by,
      persistKnowledge: false,
    })

    const needsReview =
      lowConfidence
      || missingRequiredFields.length > 0
      || duplicateCandidates > 0
      || classification.confidence < 0.7
      || !classification.categoryId

    const reviewStatus = needsReview ? 'needs_review' : 'ready'
    const uploadStatus = needsReview ? 'needs_review' : 'ready_for_approval'

    await supabase
      .from('receipt_staging_transactions')
      .update({
        review_status: reviewStatus,
        duplicate_status: duplicateCandidates > 0 ? 'needs_review' : 'none',
        requires_manual_review: needsReview,
        updated_at: new Date().toISOString(),
      })
      .eq('id', stagingTransactionId)

    await supabase
      .from('receipt_uploads')
      .update({
        status: uploadStatus,
        parse_completed_at: new Date().toISOString(),
        parser_version: 'receipt-parser-v2',
        updated_at: new Date().toISOString(),
      })
      .eq('id', upload.id)

    return {
      uploadId: upload.id,
      stagingTransactionId,
      status: uploadStatus,
      classificationRunId: classification.runId,
      duplicateCandidates,
    }
  } catch (error) {
    await supabase
      .from('receipt_uploads')
      .update({
        status: 'failed',
        parse_error: error instanceof Error ? error.message : 'Unknown parsing error',
        error_code: 'receipt_parse_failed',
        error_message: error instanceof Error ? error.message : 'Unknown parsing error',
        parse_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', upload.id)

    if (error instanceof ReceiptIngestionError) {
      throw error
    }

    throw new ReceiptIngestionError(error instanceof Error ? error.message : 'Failed to process receipt upload', 500)
  }
}
