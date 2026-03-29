import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { resolveDatePeriodRange, type DatePeriod } from '@/lib/date-periods'
import { normalizeTxnDirection } from '@/lib/transactions/txn-direction'

export interface AnalyticsTransaction {
  id: string
  txn_date: string
  merchant_normalized: string | null
  description: string | null
  amount: number
  txn_type: string
  currency: string
  account_label: string
  category_name: string | null
  category_color_token: string | null
  tags: Array<{ name: string; colorToken: string | null }>
}

export interface AnalyticsTransactionsResponse {
  transactions: AnalyticsTransaction[]
  total: number
  count: number
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
    const dimensionId = searchParams.get('dimensionId') // null string = uncategorized/untagged

    const accountIds = accountIdsParam ? accountIdsParam.split(',').filter(Boolean) : []
    const { start, end } = resolveDatePeriodRange(period)

    let accountQuery = supabase
      .from('accounts')
      .select('id, nickname, product_name, currency')
      .eq('household_id', profile.household_id)
      .eq('is_active', true)

    if (accountIds.length > 0) {
      accountQuery = accountQuery.in('id', accountIds)
    }

    const { data: accounts } = await accountQuery
    const scopedAccountIds = (accounts ?? []).map((a) => a.id)
    const accountMap = new Map((accounts ?? []).map((a) => [a.id, a.nickname ?? a.product_name]))

    if (scopedAccountIds.length === 0) {
      return NextResponse.json({ transactions: [], total: 0, count: 0 })
    }

    let txnQuery = supabase
      .from('statement_transactions')
      .select('id, txn_date, merchant_normalized, description, amount, txn_type, currency, account_id, category_id, categories(name, color_token), statement_transaction_tags(tags(name, color_token))')
      .in('account_id', scopedAccountIds)
      .order('txn_date', { ascending: false })
      .limit(200)

    if (start) txnQuery = txnQuery.gte('txn_date', start)
    if (end) txnQuery = txnQuery.lte('txn_date', end)
    // Note: direction filtering uses normalizeTxnDirection (semantic txn_type values like 'purchase', 'payment')

    if (dimension === 'category') {
      if (!dimensionId || dimensionId === 'null') {
        txnQuery = txnQuery.is('category_id', null)
      } else {
        txnQuery = txnQuery.eq('category_id', Number(dimensionId))
      }
    } else if (dimension === 'tag') {
      if (!dimensionId || dimensionId === 'null') {
        // Untagged: filter via subquery isn't possible directly — fetch all and filter client-side
        // We'll handle this after fetch
      } else {
        // Tagged with specific tag — join filter
        const { data: taggedIds } = await supabase
          .from('statement_transaction_tags')
          .select('statement_transaction_id')
          .eq('tag_id', dimensionId)
        const ids = (taggedIds ?? []).map((r) => r.statement_transaction_id)
        if (ids.length === 0) return NextResponse.json({ transactions: [], total: 0, count: 0 })
        txnQuery = txnQuery.in('id', ids)
      }
    }

    const { data: txns, error } = await txnQuery
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let rows = txns ?? []

    // Direction filter using normalizeTxnDirection (semantic txn_type values like 'purchase', 'payment')
    if (direction !== 'all') {
      rows = rows.filter((t) => normalizeTxnDirection(t.txn_type) === direction)
    }

    // Client-side filter for "untagged" tag dimension
    if (dimension === 'tag' && (!dimensionId || dimensionId === 'null')) {
      rows = rows.filter((t) => {
        const links = (t as any).statement_transaction_tags ?? []
        return links.length === 0
      })
    }

    const transactions: AnalyticsTransaction[] = rows.map((t) => {
      const cat = (t as any).categories
      const tagLinks = (t as any).statement_transaction_tags ?? []
      return {
        id: t.id,
        txn_date: t.txn_date,
        merchant_normalized: t.merchant_normalized,
        description: t.description,
        amount: Number(t.amount),
        txn_type: t.txn_type,
        currency: t.currency,
        account_label: accountMap.get(t.account_id) ?? 'Unknown',
        category_name: cat?.name ?? null,
        category_color_token: cat?.color_token ?? null,
        tags: tagLinks
          .map((l: any) => l.tags)
          .filter(Boolean)
          .map((tag: any) => ({ name: tag.name, colorToken: tag.color_token })),
      }
    })

    const total = transactions.reduce((sum, t) => sum + t.amount, 0)

    return NextResponse.json({ transactions, total, count: transactions.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load transactions' },
      { status: 500 },
    )
  }
}
