'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface BreakdownTransaction {
  id: string
  txn_date: string
  amount: number
  merchant?: string | null
  description?: string | null
  account?: string | null
  category?: string | null
  subgroup?: string | null
  group?: string | null
}

interface BreakdownRpcRow extends BreakdownTransaction {
  total_count?: number | null
  subtotal?: number | null
  busiest_day?: string | null
  selected_period_label?: string | null
}

interface UseBreakdownTransactionsArgs {
  tab: string
  filter: string
  dimensionKey: string
  limit: number
  offset: number
}

interface BreakdownResult {
  transactions: BreakdownTransaction[]
  totalCount: number
  subtotal: number
  busiestDay: string | null
  selectedPeriodLabel: string
}

export function useBreakdownTransactions({
  tab,
  filter,
  dimensionKey,
  limit,
  offset,
}: UseBreakdownTransactionsArgs) {
  const [data, setData] = useState<BreakdownResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function run() {
      setLoading(true)
      setError(null)

      const supabase = createClient()
      const { data: rows, error: rpcError } = await supabase.rpc(
        'get_breakdown_transactions',
        {
          p_tab: tab,
          p_filter: filter,
          p_dimension_key: dimensionKey,
          p_limit: limit,
          p_offset: offset,
        },
      )

      if (!active) return

      if (rpcError) {
        setError(rpcError.message)
        setData(null)
        setLoading(false)
        return
      }

      const typedRows = (rows ?? []) as BreakdownRpcRow[]
      const totalCount = typedRows[0]?.total_count ?? typedRows.length
      const subtotal =
        typedRows[0]?.subtotal ??
        typedRows.reduce((sum, row) => sum + Math.abs(row.amount ?? 0), 0)
      const busiestDay = typedRows[0]?.busiest_day ?? null
      const selectedPeriodLabel =
        typedRows[0]?.selected_period_label ?? 'Selected period'

      setData({
        transactions: typedRows,
        totalCount,
        subtotal,
        busiestDay,
        selectedPeriodLabel,
      })
      setLoading(false)
    }

    run()

    return () => {
      active = false
    }
  }, [tab, filter, dimensionKey, limit, offset])

  return {
    data,
    loading,
    error,
  }
}
