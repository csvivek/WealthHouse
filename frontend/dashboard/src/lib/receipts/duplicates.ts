/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildItemSignature, normalizeMerchantName } from '@/lib/receipts/normalization'

interface StagingHeaderForDuplicate {
  id: string
  merchant_name: string | null
  txn_date: string | null
  transaction_total: number | null
  receipt_reference: string | null
}

interface StagingItemForDuplicate {
  item_name: string | null
}

interface CandidateReceipt {
  id: string
  merchant_raw: string
  total_amount: number
  receipt_datetime: string | null
  receipt_reference: string | null
  receipt_hash: string | null
  raw_extraction_json: Record<string, unknown> | null
}

function daysBetween(a: Date, b: Date) {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.abs(a.getTime() - b.getTime()) / msPerDay
}

function scoreCandidate(params: {
  staging: StagingHeaderForDuplicate
  candidate: CandidateReceipt
  stagingHash: string
  stagingItemSignature: string
  candidateItemSignature: string
}) {
  let score = 0
  const signals: Record<string, unknown> = {}

  if (params.candidate.receipt_hash && params.candidate.receipt_hash === params.stagingHash) {
    score += 1
    signals.fileHashMatch = true
  }

  const stagingReference = params.staging.receipt_reference?.trim().toLowerCase()
  const candidateReference = params.candidate.receipt_reference?.trim().toLowerCase()
  if (stagingReference && candidateReference && stagingReference === candidateReference) {
    score += 0.7
    signals.receiptReferenceMatch = true
  }

  const stagingMerchant = normalizeMerchantName(params.staging.merchant_name)
  const candidateMerchant = normalizeMerchantName(params.candidate.merchant_raw)
  if (stagingMerchant && candidateMerchant && stagingMerchant === candidateMerchant) {
    score += 0.35
    signals.merchantMatch = true
  }

  if (
    params.staging.transaction_total != null
    && Number(params.staging.transaction_total) === Number(params.candidate.total_amount)
  ) {
    score += 0.35
    signals.amountMatch = true
  }

  if (params.staging.txn_date && params.candidate.receipt_datetime) {
    const deltaDays = daysBetween(new Date(params.staging.txn_date), new Date(params.candidate.receipt_datetime))
    if (deltaDays <= 1) {
      score += 0.25
      signals.dateProximityDays = deltaDays
    }
  }

  if (params.stagingItemSignature && params.candidateItemSignature && params.stagingItemSignature === params.candidateItemSignature) {
    score += 0.25
    signals.itemSignatureMatch = true
  }

  return {
    score: Math.min(1, Number(score.toFixed(4))),
    signals,
  }
}

export async function generateDuplicateCandidates(params: {
  supabase: SupabaseClient<any>
  householdId: string
  uploadId: string
  staging: StagingHeaderForDuplicate
  stagingItems: StagingItemForDuplicate[]
  fileSha256: string
}) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 180)

  const { data: candidates, error } = await params.supabase
    .from('receipts')
    .select('id, merchant_raw, total_amount, receipt_datetime, receipt_reference, receipt_hash, raw_extraction_json')
    .eq('household_id', params.householdId)
    .gte('created_at', cutoff.toISOString())
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    throw new Error(`Failed to fetch receipt duplicate candidates: ${error.message}`)
  }

  const stagingItemSignature = buildItemSignature(
    params.stagingItems.map((item) => item.item_name || '').filter(Boolean),
  )

  const rows = (candidates ?? []) as CandidateReceipt[]

  const inserts: Array<Record<string, unknown>> = []

  for (const candidate of rows) {
    const rawItems = Array.isArray(candidate.raw_extraction_json?.items)
      ? (candidate.raw_extraction_json?.items as Array<Record<string, unknown>>)
      : []

    const candidateItemSignature = buildItemSignature(
      rawItems
        .map((item) => (typeof item.name === 'string' ? item.name : ''))
        .filter(Boolean),
    )

    const scored = scoreCandidate({
      staging: params.staging,
      candidate,
      stagingHash: params.fileSha256,
      stagingItemSignature,
      candidateItemSignature,
    })

    if (scored.score < 0.55) continue

    inserts.push({
      household_id: params.householdId,
      upload_id: params.uploadId,
      staging_transaction_id: params.staging.id,
      candidate_receipt_id: candidate.id,
      score: scored.score,
      signals_json: scored.signals,
      status: 'suggested',
      updated_at: new Date().toISOString(),
    })
  }

  if (inserts.length > 0) {
    await params.supabase
      .from('receipt_duplicate_candidates')
      .upsert(inserts, { onConflict: 'staging_transaction_id,candidate_receipt_id' })
  }

  return inserts.length
}
