'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  DEFAULT_BREAKDOWN_DIMENSION,
  type BreakdownDimension,
} from '@/lib/breakdown-dimensions'
import {
  mapOverviewBreakdownRows,
  type OverviewBreakdownDto,
  type OverviewBreakdownRpcRow,
} from '@/lib/dashboard-mappers'

const OVERVIEW_BREAKDOWN_RPC = 'dashboard_overview_breakdown'

export interface UseOverviewBreakdownResult {
  loading: boolean
  error: string | null
  dimension: BreakdownDimension
  data: OverviewBreakdownDto
  setDimension: (dimension: BreakdownDimension) => void
  refetch: () => Promise<void>
}

const EMPTY_DATA: OverviewBreakdownDto = mapOverviewBreakdownRows(
  DEFAULT_BREAKDOWN_DIMENSION,
  [],
)

export function useOverviewBreakdown(
  initialDimension: BreakdownDimension = DEFAULT_BREAKDOWN_DIMENSION,
): UseOverviewBreakdownResult {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dimension, setDimension] = useState<BreakdownDimension>(initialDimension)
  const [data, setData] = useState<OverviewBreakdownDto>(EMPTY_DATA)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) throw authError
      if (!user) {
        setData(mapOverviewBreakdownRows(dimension, []))
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single()

      if (profileError) throw profileError

      const { data: rpcRows, error: rpcError } = await supabase.rpc(
        OVERVIEW_BREAKDOWN_RPC,
        {
          p_household_id: profile.household_id,
          p_dimension: dimension,
        },
      )

      if (rpcError) throw rpcError
      setData(
        mapOverviewBreakdownRows(
          dimension,
          (rpcRows as OverviewBreakdownRpcRow[] | null) ?? [],
        ),
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load overview breakdown.'
      setError(message)
      setData(mapOverviewBreakdownRows(dimension, []))
    } finally {
      setLoading(false)
    }
  }, [dimension])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  return {
    loading,
    error,
    dimension,
    data,
    setDimension,
    refetch: fetchData,
  }
}
