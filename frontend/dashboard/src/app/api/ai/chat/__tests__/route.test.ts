// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/ai/chat/route'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getFinancialAdvice } from '@/lib/ai/advisor'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/ai/advisor', () => ({
  getFinancialAdvice: vi.fn(),
}))

const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient)
const mockedGetFinancialAdvice = vi.mocked(getFinancialAdvice)

function createRequest(payload: unknown) {
  return new NextRequest('http://localhost/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
  })
}

function createSupabaseMock(params: {
  user: { id: string } | null
  householdId?: string | null
  accounts?: Array<{ id: string; product_name: string; account_type: string; currency: string }>
  transactions?: Array<{ merchant_normalized: string | null; merchant_raw: string | null; amount: number; txn_date: string; merchant?: { name: string | null } | null }>
  balances?: Array<{ balance: number; assets: { symbol: string } | null }>
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: params.user } }),
    },
    from: (table: string) => {
      if (table === 'user_profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: params.householdId ? { household_id: params.householdId } : null,
              }),
            }),
          }),
        }
      }

      if (table === 'accounts') {
        return {
          select: () => ({
            eq: async () => ({ data: params.accounts ?? [] }),
          }),
        }
      }

      if (table === 'statement_transactions') {
        return {
          select: () => ({
            in: () => ({
              order: () => ({
                limit: async () => ({ data: params.transactions ?? [] }),
              }),
            }),
          }),
        }
      }

      if (table === 'asset_balances') {
        return {
          select: () => ({
            in: async () => ({ data: params.balances ?? [] }),
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

describe('POST /api/ai/chat', () => {
  beforeEach(() => {
    mockedCreateServerSupabaseClient.mockReset()
    mockedGetFinancialAdvice.mockReset()
  })

  it('returns 401 for unauthenticated users', async () => {
    mockedCreateServerSupabaseClient.mockResolvedValueOnce(
      createSupabaseMock({ user: null }) as never,
    )

    const response = await POST(createRequest({ message: 'hi' }))
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Unauthorized' })
    expect(mockedGetFinancialAdvice).not.toHaveBeenCalled()
  })

  it('returns 400 when message is missing', async () => {
    mockedCreateServerSupabaseClient.mockResolvedValueOnce(
      createSupabaseMock({ user: { id: 'user-1' }, householdId: 'hh-1' }) as never,
    )

    const response = await POST(createRequest({ history: [] }))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Message is required' })
  })

  it('builds typed context and returns advice for valid requests', async () => {
    mockedCreateServerSupabaseClient.mockResolvedValueOnce(
      createSupabaseMock({
        user: { id: 'user-1' },
        householdId: 'hh-1',
        accounts: [
          { id: 'acc-1', product_name: 'DBS Savings', account_type: 'bank', currency: 'SGD' },
        ],
        transactions: [
          {
            merchant_normalized: 'ntuc',
            merchant_raw: null,
            amount: 34.5,
            txn_date: '2026-03-01',
          },
        ],
        balances: [{ balance: 2.5, assets: { symbol: 'BTC' } }],
      }) as never,
    )
    mockedGetFinancialAdvice.mockResolvedValueOnce('Advice output')

    const response = await POST(
      createRequest({
        message: 'How am I doing?',
        history: [{ role: 'user', content: 'hello' }, { role: 'bad', content: 10 }],
      }),
    )

    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ response: 'Advice output' })
    expect(mockedGetFinancialAdvice).toHaveBeenCalledWith(
      'How am I doing?',
      [{ role: 'user', content: 'hello' }],
      {
        accounts: [{ name: 'DBS Savings', type: 'bank', currency: 'SGD' }],
        recentTransactions: [
          { merchant_display: 'ntuc', amount: 34.5, txn_date: '2026-03-01' },
        ],
        holdings: [{ symbol: 'BTC', balance: 2.5 }],
      },
    )
  })

  it('prefers canonical merchant names over normalized/raw fallbacks in chat context', async () => {
    mockedCreateServerSupabaseClient.mockResolvedValueOnce(
      createSupabaseMock({
        user: { id: 'user-1' },
        householdId: 'hh-1',
        accounts: [
          { id: 'acc-1', product_name: 'DBS Savings', account_type: 'bank', currency: 'SGD' },
        ],
        transactions: [
          {
            merchant_normalized: 'starbucks sg',
            merchant_raw: 'STARBUCKS - Plaza Sing',
            merchant: { name: 'Starbucks' },
            amount: 8.2,
            txn_date: '2026-03-02',
          },
        ],
      }) as never,
    )
    mockedGetFinancialAdvice.mockResolvedValueOnce('Advice output')

    const response = await POST(createRequest({ message: 'Summarize spending' }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ response: 'Advice output' })
    expect(mockedGetFinancialAdvice).toHaveBeenCalledWith(
      'Summarize spending',
      [],
      {
        accounts: [{ name: 'DBS Savings', type: 'bank', currency: 'SGD' }],
        recentTransactions: [
          { merchant_display: 'Starbucks', amount: 8.2, txn_date: '2026-03-02' },
        ],
        holdings: [],
      },
    )
  })
})
