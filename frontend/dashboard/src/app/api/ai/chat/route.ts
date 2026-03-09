import { NextRequest, NextResponse } from 'next/server'
import { getFinancialAdvice } from '@/lib/ai/advisor'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

interface ChatRequestBody {
  message?: unknown
  history?: unknown
}

interface ChatHistoryItem {
  role: 'user' | 'assistant'
  content: string
}

type AccountRow = Pick<
  Database['public']['Tables']['accounts']['Row'],
  'id' | 'product_name' | 'account_type' | 'currency'
>

type StatementTransactionRow = Pick<
  Database['public']['Tables']['statement_transactions']['Row'],
  'merchant_normalized' | 'merchant_raw' | 'amount' | 'txn_date'
>

interface AssetBalanceWithSymbol {
  balance: number
  assets: { symbol: string } | { symbol: string }[] | null
}

function parseHistory(value: unknown): ChatHistoryItem[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const candidate = item as { role?: unknown; content?: unknown }
      if ((candidate.role !== 'user' && candidate.role !== 'assistant') || typeof candidate.content !== 'string') {
        return null
      }

      return {
        role: candidate.role,
        content: candidate.content,
      }
    })
    .filter((item): item is ChatHistoryItem => item !== null)
}

function extractSymbol(value: AssetBalanceWithSymbol['assets']): string {
  if (!value) return '?'
  if (Array.isArray(value)) {
    return value[0]?.symbol ?? '?'
  }
  return value.symbol ?? '?'
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as ChatRequestBody
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const history = parseHistory(body.history)

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('household_id')
      .eq('id', user.id)
      .single()

    const householdId = profile?.household_id

    let accounts: AccountRow[] = []
    let recentTransactions: { merchant_display: string | null; amount: number; txn_date: string }[] = []
    let holdings: { symbol: string; balance: number }[] = []

    if (householdId) {
      const { data: accountRows } = await supabase
        .from('accounts')
        .select('id, product_name, account_type, currency')
        .eq('household_id', householdId)

      accounts = (accountRows as AccountRow[] | null) ?? []
      const accountIds = accounts.map((account) => account.id)

      if (accountIds.length > 0) {
        const [txnRes, balanceRes] = await Promise.all([
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

        const txnRows = (txnRes.data as StatementTransactionRow[] | null) ?? []
        recentTransactions = txnRows.map((row) => ({
          merchant_display: row.merchant_normalized ?? row.merchant_raw,
          amount: row.amount,
          txn_date: row.txn_date,
        }))

        const balanceRows = (balanceRes.data as AssetBalanceWithSymbol[] | null) ?? []
        holdings = balanceRows.map((row) => ({
          symbol: extractSymbol(row.assets),
          balance: row.balance,
        }))
      }
    }

    const context = {
      accounts: accounts.map((account) => ({
        name: account.product_name,
        type: account.account_type,
        currency: account.currency,
      })),
      recentTransactions,
      holdings,
    }

    const response = await getFinancialAdvice(message, history, context)

    return NextResponse.json({ response })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 })
  }
}
