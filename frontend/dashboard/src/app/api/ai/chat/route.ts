import { NextRequest, NextResponse } from 'next/server'
import { getFinancialAdvice } from '@/lib/ai/advisor'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message, history } = await request.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('household_id')
      .eq('id', user.id)
      .single()

    const householdId = profile?.household_id

    let accounts: { product_name: string; account_type: string; currency: string }[] = []
    let recentTransactions: { merchant_display: string | null; amount: number; txn_date: string }[] = []
    let holdings: { symbol: string; balance: number }[] = []

    if (householdId) {
      const { data: accts } = await supabase
        .from('accounts')
        .select('id, product_name, account_type, currency')
        .eq('household_id', householdId)

      accounts = accts ?? []
      const accountIds = accounts.map(a => (a as any).id)

      if (accountIds.length > 0) {
        const [txnRes, balRes] = await Promise.all([
          supabase
            .from('statement_transactions')
            .select('merchant_normalized, merchant_raw, amount, txn_date')
            .in('account_id', accountIds)
            .order('txn_date', { ascending: false })
            .limit(20),
          supabase
            .from('asset_balances')
            .select('balance, assets(symbol)')
            .in('account_id', accountIds),
        ])

        recentTransactions = (txnRes.data ?? []).map(t => ({
          merchant_display: (t as any).merchant_normalized || (t as any).merchant_raw,
          amount: (t as any).amount,
          txn_date: (t as any).txn_date,
        }))

        holdings = (balRes.data ?? []).map(b => ({
          symbol: (b as any).assets?.symbol ?? '?',
          balance: (b as any).balance,
        }))
      }
    }

    const context = {
      accounts: accounts.map(a => ({ name: (a as any).product_name, type: (a as any).account_type, currency: (a as any).currency })),
      recentTransactions,
      holdings,
    }

    const response = await getFinancialAdvice(message, history || [], context)

    return NextResponse.json({ response })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 })
  }
}
