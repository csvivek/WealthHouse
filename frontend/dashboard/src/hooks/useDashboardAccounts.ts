'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface DashboardAccountSummary {
  id: string
  accountType: string
  accountName: string
  title: string | null
  subtitle: string | null
  institution: string | null
  currency: string
  currentBalance: number | null
  statementBalance: number | null
  pendingPrincipal: number | null
  minimumDue: number | null
  dueDate: string | null
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return value as Record<string, unknown>
}

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }

  return null
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  return null
}

function normalizeSummaryRow(row: unknown): DashboardAccountSummary {
  const record = asRecord(row)

  const accountType =
    readString(record, ['account_type', 'accountType', 'type']) ?? 'unknown'
  const accountName =
    readString(record, ['account_name', 'accountName', 'name', 'product_name']) ??
    'Untitled account'

  return {
    id:
      readString(record, ['account_id', 'accountId', 'id']) ??
      `${accountType}-${accountName}`,
    accountType,
    accountName,
    title: readString(record, ['title']),
    subtitle: readString(record, ['subtitle']),
    institution: readString(record, ['institution', 'institution_name']),
    currency: readString(record, ['currency']) ?? 'SGD',
    currentBalance: readNumber(record, [
      'current_balance',
      'currentBalance',
      'balance',
    ]),
    statementBalance: readNumber(record, [
      'statement_balance',
      'statementBalance',
      'total_outstanding',
    ]),
    pendingPrincipal: readNumber(record, [
      'pending_principal',
      'pendingPrincipal',
      'principal_balance',
    ]),
    minimumDue: readNumber(record, ['minimum_due', 'minimumDue']),
    dueDate: readString(record, ['due_date', 'dueDate']),
  }
}

async function fetchDashboardAccounts(): Promise<DashboardAccountSummary[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_account_dashboard_summary')

  if (error) {
    throw error
  }

  const rows = Array.isArray(data) ? data : []
  return rows.map(normalizeSummaryRow)
}

export function useDashboardAccounts() {
  const query = useQuery({
    queryKey: ['dashboard-accounts-summary'],
    queryFn: fetchDashboardAccounts,
  })

  return {
    accounts: query.data ?? [],
    loading: query.isLoading,
    refetch: query.refetch,
  }
}
