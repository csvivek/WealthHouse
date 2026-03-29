import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { resolveDatePeriodRange, type DatePeriod } from '@/lib/date-periods'
import { normalizeTxnDirection } from '@/lib/transactions/txn-direction'

export interface AnalyticsBreakdownRow {
  id: string | number | null
  label: string
  colorToken: string | null
  colorHex: string | null
  amount: number
  count: number
  share: number
}

export interface AnalyticsBreakdownResponse {
  rows: AnalyticsBreakdownRow[]
  total: number
  debitTotal: number
  creditTotal: number
  currency: string
  periodStart: string | null
  periodEnd: string | null
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('household_id')
      .eq('id', user.id)
      .single()
    if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 404 })

    const { searchParams } = new URL(request.url)
    const period = (searchParams.get('period') ?? 'this_month') as DatePeriod
    const accountIdsParam = searchParams.get('accountIds') ?? ''
    const direction = searchParams.get('direction') ?? 'all'
    const dimension = searchParams.get('dimension') ?? 'category'

    const accountIds = accountIdsParam ? accountIdsParam.split(',').filter(Boolean) : []
    const { start, end } = resolveDatePeriodRange(period)

    // Fetch accounts for this household to scope the query
    let accountQuery = supabase
      .from('accounts')
      .select('id, currency')
      .eq('household_id', profile.household_id)
      .eq('is_active', true)

    if (accountIds.length > 0) {
      accountQuery = accountQuery.in('id', accountIds)
    }

    const { data: accounts } = await accountQuery
    const scopedAccountIds = (accounts ?? []).map((a) => a.id)
    const currency = accounts?.[0]?.currency ?? 'SGD'

    if (scopedAccountIds.length === 0) {
      const empty: AnalyticsBreakdownResponse = {
        rows: [], total: 0, debitTotal: 0, creditTotal: 0, currency, periodStart: start, periodEnd: end,
      }
      return NextResponse.json(empty)
    }

    // Fetch all matching transactions
    let txnQuery = supabase
      .from('statement_transactions')
      .select(
        dimension === 'tag'
          ? 'id, amount, txn_type, statement_transaction_tags(tag_id, tags(id, name, color_token, color_hex))'
          : 'id, amount, txn_type, category_id, categories(id, name, color_token, color_hex)',
      )
      .in('account_id', scopedAccountIds)

    if (start) txnQuery = txnQuery.gte('txn_date', start)
    if (end) txnQuery = txnQuery.lte('txn_date', end)
    // Note: txn_type in statement_transactions uses semantic values ('purchase', 'payment', etc.)
    // Direction filtering is done in-memory using normalizeTxnDirection

    const { data: txns, error } = await txnQuery
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = txns ?? []

    // Aggregate by dimension
    const map = new Map<string, { id: string | number | null; label: string; colorToken: string | null; colorHex: string | null; amount: number; count: number }>()

    let debitTotal = 0
    let creditTotal = 0

    if (dimension === 'tag') {
      for (const txn of rows) {
        const amount = Number(txn.amount)
        const dir = normalizeTxnDirection(txn.txn_type)
        if (dir === 'debit') debitTotal += amount
        else creditTotal += amount

        // Skip if direction filter doesn't match
        if (direction !== 'all' && dir !== direction) continue

        const tagLinks = (txn as any).statement_transaction_tags ?? []
        if (tagLinks.length === 0) {
          const key = '__untagged__'
          const existing = map.get(key) ?? { id: null, label: 'Untagged', colorToken: null, colorHex: null, amount: 0, count: 0 }
          existing.amount += amount
          existing.count += 1
          map.set(key, existing)
        } else {
          for (const link of tagLinks) {
            const tag = link.tags
            if (!tag) continue
            const key = String(tag.id)
            const existing = map.get(key) ?? { id: tag.id, label: tag.name, colorToken: tag.color_token, colorHex: tag.color_hex, amount: 0, count: 0 }
            existing.amount += amount
            existing.count += 1
            map.set(key, existing)
          }
        }
      }
    } else {
      for (const txn of rows) {
        const amount = Number(txn.amount)
        const dir = normalizeTxnDirection(txn.txn_type)
        if (dir === 'debit') debitTotal += amount
        else creditTotal += amount

        // Skip if direction filter doesn't match
        if (direction !== 'all' && dir !== direction) continue

        const cat = (txn as any).categories
        const key = cat ? String(cat.id) : '__uncategorized__'
        const existing = map.get(key) ?? {
          id: cat?.id ?? null,
          label: cat?.name ?? 'Uncategorized',
          colorToken: cat?.color_token ?? null,
          colorHex: cat?.color_hex ?? null,
          amount: 0,
          count: 0,
        }
        existing.amount += amount
        existing.count += 1
        map.set(key, existing)
      }
    }

    const total = direction === 'credit' ? creditTotal : direction === 'debit' ? debitTotal : debitTotal + creditTotal

    const sorted = Array.from(map.values())
      .sort((a, b) => b.amount - a.amount)
      .map((r) => ({ ...r, share: total > 0 ? Math.round((r.amount / total) * 1000) / 10 : 0 }))

    const response: AnalyticsBreakdownResponse = {
      rows: sorted,
      total,
      debitTotal,
      creditTotal,
      currency,
      periodStart: start,
      periodEnd: end,
    }

    return NextResponse.json(response)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load breakdown' },
      { status: 500 },
    )
  }
}
