'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import * as d3 from 'd3'
import { TrendingUp, DollarSign, PieChart, BarChart3, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899']

interface AssetHolding {
  id: string
  balance: number
  assets: { symbol: string; name: string | null; asset_type: string } | null
}

interface InvestmentTxn {
  id: string
  txn_time: string
  txn_type: string
  amount: number
  price_in_quote: number | null
  assets: { symbol: string } | null
}

export default function InvestmentsPage() {
  const chartRef = useRef<SVGSVGElement>(null)
  const [holdings, setHoldings] = useState<AssetHolding[]>([])
  const [recentTxns, setRecentTxns] = useState<InvestmentTxn[]>([])
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
        .in('account_type', ['investment', 'crypto_exchange'])

      const accountIds = (accts ?? []).map(a => a.id)

      if (accountIds.length === 0) { setLoading(false); return }

      const [balRes, txnRes] = await Promise.all([
        supabase
          .from('asset_balances')
          .select('id, balance, assets(symbol, name, asset_type)')
          .in('account_id', accountIds),
        supabase
          .from('investment_transactions')
          .select('id, txn_time, txn_type, amount, price_in_quote, assets!investment_transactions_asset_id_fkey(symbol)')
          .in('account_id', accountIds)
          .order('txn_time', { ascending: false })
          .limit(20),
      ])

      setHoldings((balRes.data as AssetHolding[]) ?? [])
      setRecentTxns((txnRes.data as InvestmentTxn[]) ?? [])
      setLoading(false)
    }
    fetchData()
  }, [])

  // D3 donut chart
  useEffect(() => {
    if (!chartRef.current || holdings.length === 0) return

    const svg = d3.select(chartRef.current)
    svg.selectAll('*').remove()

    const width = 300
    const height = 300
    const radius = Math.min(width, height) / 2

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`)

    const pie = d3.pie<AssetHolding>().value(d => Math.abs(d.balance)).sort(null)
    const arc = d3.arc<d3.PieArcDatum<AssetHolding>>().innerRadius(radius * 0.5).outerRadius(radius * 0.85)
    const labelArc = d3.arc<d3.PieArcDatum<AssetHolding>>().innerRadius(radius * 0.9).outerRadius(radius * 0.9)

    const color = d3.scaleOrdinal<string>().domain(holdings.map(h => h.assets?.symbol ?? h.id)).range(COLORS)

    const arcs = g.selectAll('.arc').data(pie(holdings)).enter().append('g').attr('class', 'arc')

    arcs
      .append('path')
      .attr('d', arc)
      .attr('fill', d => color(d.data.assets?.symbol ?? d.data.id))
      .attr('stroke', 'white')
      .attr('stroke-width', 2)

    arcs
      .append('text')
      .attr('transform', d => `translate(${labelArc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .attr('fill', 'currentColor')
      .text(d => d.data.assets?.symbol ?? '?')
  }, [holdings])

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (holdings.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Investments</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <PieChart className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium text-muted-foreground">
              No investment holdings tracked yet. Add an investment account to see portfolio analytics.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Investments</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              Total Holdings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{holdings.length} assets</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <BarChart3 className="h-4 w-4" />
              Recent Trades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{recentTxns.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <Card>
          <CardHeader><CardTitle>Holdings</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 font-medium">Asset</th>
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 font-medium text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map(h => (
                    <tr key={h.id} className="border-b last:border-0">
                      <td className="py-3 font-semibold">{h.assets?.symbol ?? '—'}</td>
                      <td className="py-3">
                        <Badge variant="outline">{h.assets?.asset_type ?? 'unknown'}</Badge>
                      </td>
                      <td className="py-3 text-right font-medium tabular-nums">{h.balance.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Allocation</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-center">
            <svg ref={chartRef} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
