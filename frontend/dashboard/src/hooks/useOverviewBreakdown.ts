'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  const fetchIdRef = useRef(0)

  const fetchData = useCallback(async () => {
    const myId = ++fetchIdRef.current

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (fetchIdRef.current !== myId) return
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

      if (fetchIdRef.current !== myId) return
      if (profileError) throw profileError

      const { data: rpcRows, error: rpcError } = await supabase.rpc(
        OVERVIEW_BREAKDOWN_RPC,
        {
          p_household_id: profile.household_id,
          p_dimension: dimension,
        },
      )

      if (fetchIdRef.current !== myId) return
      if (rpcError) throw rpcError
      setData(
        mapOverviewBreakdownRows(
          dimension,
          (rpcRows as OverviewBreakdownRpcRow[] | null) ?? [],
        ),
      )
    } catch (err) {
      if (fetchIdRef.current !== myId) return
      const message = err instanceof Error ? err.message : 'Failed to load overview breakdown.'
      setError(message)
      setData(mapOverviewBreakdownRows(dimension, []))
    } finally {
      if (fetchIdRef.current === myId) setLoading(false)
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
