import { NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { getAuthenticatedHouseholdContext } from '@/lib/server/household-context'

/**
 * GET /api/advances/statement-transactions
 *
 * Returns statement_transactions that:
 *  - Have a category matching advance patterns (Advances Given / Advances Recovered / etc.)
 *  - Are NOT yet linked as an advance originator (advances.statement_transaction_id)
 *  - Are NOT yet linked as a repayment (advance_repayments.statement_transaction_id)
 *
 * Response: { given: StmtTxn[], recovered: StmtTxn[] }
 * "given"     = transactions categorised as money lent out
 * "recovered" = transactions categorised as money returned/recovered
 */
export async function GET() {
  try {
    const ctx = await getAuthenticatedHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServiceSupabaseClient()

    // ── Fetch household accounts ─────────────────────────────────────────────
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, nickname, product_name')
      .eq('household_id', ctx.householdId)
      .eq('is_active', true)

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ given: [], recovered: [] })
    }

    const accountIds = accounts.map((a) => a.id)
    const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]))

    // ── Find advance-related categories ──────────────────────────────────────
    const { data: advanceCategories } = await supabase
      .from('categories')
      .select('id, name')
      .or('name.ilike.%advance%,name.ilike.%personal loan%')
      .eq('is_active', true)

    if (!advanceCategories || advanceCategories.length === 0) {
      return NextResponse.json({ given: [], recovered: [] })
    }

    const categoryIds = advanceCategories.map((c) => c.id)
    const categoryMap = Object.fromEntries(advanceCategories.map((c) => [c.id, c]))

    // ── Fetch matching transactions ───────────────────────────────────────────
    const { data: txns, error } = await supabase
      .from('statement_transactions')
      .select('id, txn_date, amount, txn_type, merchant_normalized, merchant_raw, description, account_id, category_id')
      .in('account_id', accountIds)
      .in('category_id', categoryIds)
      .order('txn_date', { ascending: false })

    if (error) throw error
    if (!txns || txns.length === 0) {
      return NextResponse.json({ given: [], recovered: [] })
    }

    const txnIds = txns.map((t) => t.id)

    // ── Find already-linked transaction IDs ───────────────────────────────────
    const [linkedAsAdvanceRes, linkedAsRepaymentRes] = await Promise.all([
      supabase
        .from('advances')
        .select('statement_transaction_id')
        .in('statement_transaction_id', txnIds)
        .eq('household_id', ctx.householdId),
      supabase
        .from('advance_repayments')
        .select('statement_transaction_id')
        .in('statement_transaction_id', txnIds),
    ])

    const linkedIds = new Set<string>([
      ...((linkedAsAdvanceRes.data ?? [])
        .map((r) => (r as { statement_transaction_id: string | null }).statement_transaction_id)
        .filter((id): id is string => id != null)),
      ...((linkedAsRepaymentRes.data ?? [])
        .map((r) => r.statement_transaction_id)
        .filter((id): id is string => id != null)),
    ])

    // ── Separate into given vs recovered ─────────────────────────────────────
    const given: unknown[] = []
    const recovered: unknown[] = []

    for (const txn of txns) {
      if (linkedIds.has(txn.id)) continue

      const category = categoryMap[txn.category_id as number] ?? null
      const account = accountMap[txn.account_id] ?? null
      const enriched = { ...txn, category, account }

      // "Recovered" = category name contains "recover" or "received"
      // "Given"     = everything else (given, lent, personal loan, etc.)
      const catNameLower = (category?.name ?? '').toLowerCase()
      if (catNameLower.includes('recover') || catNameLower.includes('received')) {
        recovered.push(enriched)
      } else {
        given.push(enriched)
      }
    }

    return NextResponse.json({ given, recovered })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load advance transactions' },
      { status: 500 },
    )
  }
}
