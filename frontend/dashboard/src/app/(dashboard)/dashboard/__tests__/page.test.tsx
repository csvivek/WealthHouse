import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardPage from '@/app/(dashboard)/dashboard/page'
import { createClient } from '@/lib/supabase/client'
import { useDashboardAccounts } from '@/hooks/useDashboardAccounts'

vi.mock('next/font/google', () => ({
  DM_Sans: () => ({ variable: 'font-dashboard-sans' }),
  DM_Mono: () => ({ variable: 'font-dashboard-mono' }),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/hooks/useDashboardAccounts', () => ({
  useDashboardAccounts: vi.fn(),
}))

const mockedCreateClient = vi.mocked(createClient)
const mockedUseDashboardAccounts = vi.mocked(useDashboardAccounts)

type QueryOptions<T> = {
  rows: T[]
  error?: { message: string } | null
}

function createThenableQuery<T extends Record<string, unknown>>(options: QueryOptions<T>) {
  const filters: Array<(row: T) => boolean> = []
  let orderBy: { column: keyof T & string; ascending: boolean } | null = null
  let limitCount: number | null = null

  const builder = {
    eq(column: keyof T & string, value: unknown) {
      filters.push((row) => row[column] === value)
      return builder
    },
    in(column: keyof T & string, values: unknown[]) {
      filters.push((row) => values.includes(row[column]))
      return builder
    },
    gte(column: keyof T & string, value: unknown) {
      filters.push((row) => String(row[column] ?? '') >= String(value))
      return builder
    },
    lte(column: keyof T & string, value: unknown) {
      filters.push((row) => String(row[column] ?? '') <= String(value))
      return builder
    },
    order(column: keyof T & string, options?: { ascending?: boolean }) {
      orderBy = { column, ascending: options?.ascending ?? true }
      return builder
    },
    limit(count: number) {
      limitCount = count
      return builder
    },
    single() {
      const rows = applyQuery() ?? []
      return Promise.resolve({ data: rows[0] ?? null, error: options.error ?? null })
    },
    then<TResult1 = { data: T[] | null; error: { message: string } | null }, TResult2 = never>(
      onfulfilled?: ((value: { data: T[] | null; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve({ data: applyQuery(), error: options.error ?? null }).then(onfulfilled, onrejected)
    },
  }

  function applyQuery() {
    if (options.error) return null

    let rows = [...options.rows]
    for (const filter of filters) {
      rows = rows.filter(filter)
    }

    if (orderBy) {
      rows.sort((left, right) => {
        const leftValue = left[orderBy!.column]
        const rightValue = right[orderBy!.column]
        if (leftValue === rightValue) return 0
        if (leftValue == null) return 1
        if (rightValue == null) return -1
        return orderBy!.ascending
          ? String(leftValue).localeCompare(String(rightValue))
          : String(rightValue).localeCompare(String(leftValue))
      })
    }

    if (typeof limitCount === 'number') {
      rows = rows.slice(0, limitCount)
    }

    return rows
  }

  return builder
}

function createSupabaseClientMock(params?: {
  accounts?: Array<Record<string, unknown>>
  statementTransactions?: Array<Record<string, unknown>>
  categories?: Array<Record<string, unknown>>
  assetBalances?: Array<Record<string, unknown>>
  advances?: Array<Record<string, unknown>>
  receiptUploads?: Array<Record<string, unknown>>
  statementTransactionsError?: { message: string } | null
}) {
  const accounts = params?.accounts ?? []
  const statementTransactions = params?.statementTransactions ?? []
  const categories = params?.categories ?? []
  const assetBalances = params?.assetBalances ?? []
  const advances = params?.advances ?? []
  const receiptUploads = params?.receiptUploads ?? []

  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
    from: (table: string) => {
      if (table === 'user_profiles') {
        return {
          select: () => createThenableQuery({ rows: [{ id: 'user-1', household_id: 'hh-1' }] }),
        }
      }

      if (table === 'accounts') {
        return {
          select: () => createThenableQuery({ rows: accounts }),
        }
      }

      if (table === 'categories') {
        return {
          select: () => createThenableQuery({ rows: categories }),
        }
      }

      if (table === 'statement_transactions') {
        return {
          select: () =>
            createThenableQuery({
              rows: statementTransactions,
              error: params?.statementTransactionsError ?? null,
            }),
        }
      }

      if (table === 'asset_balances') {
        return {
          select: () => createThenableQuery({ rows: assetBalances }),
        }
      }

      if (table === 'advances') {
        return {
          select: () => createThenableQuery({ rows: advances }),
        }
      }

      if (table === 'receipt_uploads') {
        return {
          select: () => createThenableQuery({ rows: receiptUploads }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

describe('DashboardPage', () => {
  beforeEach(() => {
    mockedCreateClient.mockReset()
    mockedUseDashboardAccounts.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  it('renders the executive dashboard with live data', async () => {
    mockedCreateClient.mockReturnValue(
      createSupabaseClientMock({
        accounts: [
          {
            id: 'acct-1',
            household_id: 'hh-1',
            account_type: 'current',
            product_name: 'DBS Current',
            nickname: 'DBS Main',
            currency: 'SGD',
          },
        ],
        statementTransactions: [
          {
            id: 'txn-1',
            txn_date: '2026-03-12',
            amount: -120,
            txn_type: 'purchase',
            merchant_normalized: 'Cold Storage',
            merchant_raw: 'Cold Storage',
            merchant: { name: 'Cold Storage' },
            category_id: 1,
            description: 'Groceries',
            currency: 'SGD',
            account_id: 'acct-1',
          },
          {
            id: 'txn-2',
            txn_date: '2026-03-10',
            amount: 4500,
            txn_type: 'salary',
            merchant_normalized: 'Employer',
            merchant_raw: 'Employer',
            merchant: { name: 'Employer' },
            category_id: 2,
            description: 'Salary',
            currency: 'SGD',
            account_id: 'acct-1',
          },
        ],
        categories: [
          {
            id: 1,
            name: 'Groceries',
            type: 'expense',
            group_id: 10,
            subgroup_id: null,
            icon_key: 'groceries',
            color_token: 'chart-2',
            color_hex: '#2DD4BF',
            domain_type: 'payment',
            payment_subtype: 'expense',
            category_group: { id: 10, name: 'Living' },
            category_subgroup: null,
          },
          {
            id: 2,
            name: 'Salary',
            type: 'income',
            group_id: 11,
            subgroup_id: null,
            icon_key: 'salary',
            color_token: 'chart-1',
            color_hex: '#C9A84C',
            domain_type: 'income',
            payment_subtype: 'income',
            category_group: { id: 11, name: 'Income' },
            category_subgroup: null,
          },
        ],
        assetBalances: [
          {
            id: 'asset-1',
            account_id: 'acct-1',
            asset_id: 'btc',
            balance: 1200,
            assets: { symbol: 'BTC', name: 'Bitcoin', asset_type: 'crypto' },
          },
        ],
        advances: [
          {
            status: 'pending',
            expected_recovery_amount: 320,
            counterparties: { name: 'Alex' },
          },
        ],
        receiptUploads: [
          { id: 'upload-1', household_id: 'hh-1', status: 'needs_review' },
          { id: 'upload-2', household_id: 'hh-1', status: 'ready_for_approval' },
        ],
      }) as never,
    )

    mockedUseDashboardAccounts.mockReturnValue({
      accounts: [
        {
          id: 'acct-1',
          accountType: 'current',
          accountName: 'DBS Current',
          title: 'DBS Current',
          subtitle: 'Primary household account',
          institution: 'DBS Bank',
          currency: 'SGD',
          currentBalance: 24800,
          statementBalance: null,
          pendingPrincipal: null,
          minimumDue: null,
          dueDate: null,
        },
      ],
      loading: false,
      refetch: vi.fn(),
    })

    render(<DashboardPage />)

    expect(await screen.findByText('Executive household overview')).toBeInTheDocument()
    expect(screen.getByText('Live household assets less liabilities.')).toBeInTheDocument()
    expect(screen.getByText('Approximation from filtered cash flow')).toBeInTheDocument()
    expect(screen.getByText('Largest balances at a glance')).toBeInTheDocument()
    expect(screen.getAllByText('Cold Storage').length).toBeGreaterThan(0)
    expect(screen.queryByText('Executive dashboard')).not.toBeInTheDocument()
    expect(screen.queryByText('Wealth House')).not.toBeInTheDocument()
  })

  it('renders the setup empty state when no accounts are available', async () => {
    mockedCreateClient.mockReturnValue(createSupabaseClientMock() as never)
    mockedUseDashboardAccounts.mockReturnValue({
      accounts: [],
      loading: false,
      refetch: vi.fn(),
    })

    render(<DashboardPage />)

    expect(await screen.findByText('Welcome to Wealth House')).toBeInTheDocument()
    expect(screen.getByText('Add your first account and import a statement to unlock the executive dashboard.')).toBeInTheDocument()
  })

  it('renders a load error when transactions fail to load', async () => {
    mockedCreateClient.mockReturnValue(
      createSupabaseClientMock({
        accounts: [
          {
            id: 'acct-1',
            household_id: 'hh-1',
            account_type: 'current',
            product_name: 'DBS Current',
            nickname: 'DBS Main',
            currency: 'SGD',
          },
        ],
        statementTransactionsError: { message: 'statement query failed' },
      }) as never,
    )
    mockedUseDashboardAccounts.mockReturnValue({
      accounts: [],
      loading: false,
      refetch: vi.fn(),
    })

    render(<DashboardPage />)

    expect(await screen.findByText('Unable to load dashboard data')).toBeInTheDocument()
    expect(screen.getByText('statement query failed')).toBeInTheDocument()
  })
})
