'use client'

import { useEffect, useState } from 'react'
import { Coins, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface ExchangeAccount {
  id: string
  account_id: string
  exchange_name: string | null
  account_label: string | null
  accounts: { product_name: string; currency: string; is_active: boolean } | null
}

interface CryptoHolding {
  id: string
  balance: number
  assets: { symbol: string; name: string | null } | null
}

export default function CryptoPage() {
  const [exchanges, setExchanges] = useState<ExchangeAccount[]>([])
  const [holdings, setHoldings] = useState<CryptoHolding[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single()

      if (!profile) { setLoading(false); return }

      const { data: accts } = await supabase
        .from('accounts')
        .select('id')
        .eq('household_id', profile.household_id)
        .eq('account_type', 'crypto_exchange')

      const accountIds = (accts ?? []).map(a => a.id)

      if (accountIds.length === 0) { setLoading(false); return }

      const [exRes, balRes] = await Promise.all([
        supabase
          .from('exchange_accounts')
          .select('id, account_id, exchange_name, account_label, accounts(product_name, currency, is_active)')
          .in('account_id', accountIds),
        supabase
          .from('asset_balances')
          .select('id, balance, assets(symbol, name)')
          .in('account_id', accountIds),
      ])

      setExchanges((exRes.data as ExchangeAccount[]) ?? [])
      setHoldings((balRes.data as CryptoHolding[]) ?? [])
      setLoading(false)
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (exchanges.length === 0 && holdings.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Crypto</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Coins className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium text-muted-foreground">
              No crypto exchange accounts linked yet. Add a crypto exchange account to track your holdings.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Crypto</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">Exchange Accounts</p>
            <p className="text-2xl font-bold">{exchanges.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">Asset Positions</p>
            <p className="text-2xl font-bold">{holdings.length}</p>
          </CardContent>
        </Card>
      </div>

      {exchanges.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Exchange Accounts</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {exchanges.map(ex => (
                <div key={ex.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium">{ex.exchange_name ?? ex.account_label ?? 'Exchange'}</p>
                    <p className="text-sm text-muted-foreground">{ex.accounts?.product_name}</p>
                  </div>
                  <Badge variant={ex.accounts?.is_active ? 'default' : 'secondary'}>
                    {ex.accounts?.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {holdings.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Crypto Holdings</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 font-medium">Asset</th>
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map(h => (
                    <tr key={h.id} className="border-b last:border-0">
                      <td className="py-3 font-semibold">{h.assets?.symbol ?? '—'}</td>
                      <td className="py-3 text-muted-foreground">{h.assets?.name ?? '—'}</td>
                      <td className="py-3 text-right font-medium tabular-nums">{h.balance.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
