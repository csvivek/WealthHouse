/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { findStatementCandidatesForReceipt, type StatementMatchCandidate } from '@/lib/receipts/statement-matching'

type MappingStatus = 'needs_review' | 'confirmed' | 'rejected'

interface ExistingMappingRow {
  id: string
  statement_transaction_id: string
  status: MappingStatus
  match_score: number
  match_type: string
  match_reason: Record<string, unknown> | null
  notes: string | null
  reviewed_at: string | null
  updated_at: string | null
  created_at: string
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ receiptId: string }> },
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

    const { receiptId } = await params

    const { data: receipt, error: receiptError } = await serviceSupabase
      .from('receipts')
      .select('id, household_id, merchant_raw, receipt_datetime, total_amount, currency, created_at')
      .eq('id', receiptId)
      .single()

    if (receiptError || !receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }

    if (receipt.household_id !== profile.household_id) {
      return NextResponse.json({ error: 'Receipt does not belong to this household' }, { status: 403 })
    }

    const [accountsResult, mappingsResult] = await Promise.all([
      serviceSupabase
        .from('accounts')
        .select('id')
        .eq('household_id', profile.household_id)
        .eq('is_active', true),
      serviceSupabase
        .from('mappings')
        .select('id, statement_transaction_id, status, match_score, match_type, match_reason, notes, reviewed_at, updated_at, created_at')
        .eq('receipt_id', receiptId)
        .order('created_at', { ascending: false }),
    ])

    if (accountsResult.error) {
      return NextResponse.json({ error: accountsResult.error.message }, { status: 500 })
    }

    if (mappingsResult.error) {
      return NextResponse.json({ error: mappingsResult.error.message }, { status: 500 })
    }

    const accountIds = (accountsResult.data ?? []).map((row: { id: string }) => row.id)

    const receiptDateSource = (receipt.receipt_datetime || receipt.created_at || '').slice(0, 10)
    if (!receiptDateSource) {
      return NextResponse.json({ error: 'Receipt date is required for matching' }, { status: 422 })
    }

    const baseDate = new Date(`${receiptDateSource}T00:00:00Z`)
    if (Number.isNaN(baseDate.getTime())) {
      return NextResponse.json({ error: 'Receipt date is invalid for matching' }, { status: 422 })
    }

    const from = new Date(baseDate)
    from.setUTCDate(from.getUTCDate() - 1)

    const to = new Date(baseDate)
    to.setUTCDate(to.getUTCDate() + 2)

    const fromDate = from.toISOString().slice(0, 10)
    const toDate = to.toISOString().slice(0, 10)

    let statementRows: Array<Record<string, unknown>> = []

    if (accountIds.length > 0) {
      const { data: statementData, error: statementError } = await serviceSupabase
        .from('statement_transactions')
        .select('id, txn_date, merchant_raw, merchant_normalized, description, amount, currency, txn_type, account_id')
        .in('account_id', accountIds)
        .gte('txn_date', fromDate)
        .lte('txn_date', toDate)
        .order('txn_date', { ascending: false })
        .limit(500)

      if (statementError) {
        return NextResponse.json({ error: statementError.message }, { status: 500 })
      }

      statementRows = (statementData ?? []) as Array<Record<string, unknown>>
    }

    const scored = findStatementCandidatesForReceipt({
      receipt: {
        merchantRaw: receipt.merchant_raw,
        receiptDate: receiptDateSource,
        totalAmount: Number(receipt.total_amount || 0),
        currency: receipt.currency,
      },
      statementTransactions: statementRows.map((row) => ({
        id: String(row.id),
        txn_date: String(row.txn_date),
        merchant_raw: row.merchant_raw as string | null,
        merchant_normalized: row.merchant_normalized as string | null,
        description: row.description as string | null,
        amount: Number(row.amount || 0),
        currency: String(row.currency || receipt.currency || 'SGD'),
        txn_type: String(row.txn_type || 'unknown'),
      })),
    })

    const purchaseFirstSorted = [...scored.candidates].sort((left, right) => {
      const leftPurchase = left.txnType === 'debit' || left.txnType === 'unknown' ? 1 : 0
      const rightPurchase = right.txnType === 'debit' || right.txnType === 'unknown' ? 1 : 0
      if (rightPurchase !== leftPurchase) return rightPurchase - leftPurchase
      return right.confidence - left.confidence
    })

    const existingMappings = (mappingsResult.data ?? []) as ExistingMappingRow[]
    const mappedStatementIds = Array.from(new Set(existingMappings.map((row) => row.statement_transaction_id)))

    let mappedStatementRows: Array<Record<string, unknown>> = []
    if (mappedStatementIds.length > 0) {
      const { data, error } = await serviceSupabase
        .from('statement_transactions')
        .select('id, txn_date, merchant_raw, merchant_normalized, description, amount, currency, txn_type, account_id')
        .in('id', mappedStatementIds)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      mappedStatementRows = (data ?? []) as Array<Record<string, unknown>>
    }

    const mappedTxnById = new Map(
      mappedStatementRows
        .filter((row) => accountIds.includes(String(row.account_id)))
        .map((row) => [String(row.id), row]),
    )

    const mappingByStatementId = new Map(existingMappings.map((row) => [row.statement_transaction_id, row]))

    const hydrateCandidate = (candidate: StatementMatchCandidate) => {
      const linked = mappingByStatementId.get(candidate.statementTransactionId)
      return {
        ...candidate,
        existingMappingId: linked?.id ?? null,
        existingMappingStatus: linked?.status ?? null,
      }
    }

    const autoSuggestion = scored.autoSuggestion ? hydrateCandidate(scored.autoSuggestion) : null
    const candidates = purchaseFirstSorted.map(hydrateCandidate)

    const existingMappingsHydrated = existingMappings
      .map((mapping) => {
        const txn = mappedTxnById.get(mapping.statement_transaction_id)
        if (!txn) return null

        return {
          id: mapping.id,
          statementTransactionId: mapping.statement_transaction_id,
          status: mapping.status,
          matchScore: mapping.match_score,
          matchType: mapping.match_type,
          notes: mapping.notes,
          matchReason: mapping.match_reason,
          reviewedAt: mapping.reviewed_at,
          updatedAt: mapping.updated_at,
          createdAt: mapping.created_at,
          statementTransaction: {
            id: String(txn.id),
            txnDate: String(txn.txn_date),
            merchantRaw: (txn.merchant_raw as string | null) || (txn.merchant_normalized as string | null),
            description: txn.description as string | null,
            amount: Number(txn.amount || 0),
            currency: String(txn.currency || receipt.currency || 'SGD'),
            txnType: String(txn.txn_type || 'unknown'),
          },
        }
      })
      .filter(Boolean)

    return NextResponse.json({
      matchingWindow: {
        from: fromDate,
        to: toDate,
      },
      autoSuggestion,
      candidates,
      existingMappings: existingMappingsHydrated,
      noMatchMessage:
        candidates.length === 0
          ? 'No statement transactions in the receipt date window exceeded 50% confidence.'
          : null,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load statement match candidates' },
      { status: 500 },
    )
  }
}
