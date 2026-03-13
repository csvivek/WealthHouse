// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PATCH } from '@/app/api/accounts/[id]/route'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { createServerSupabaseClient } from '@/lib/supabase/server'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: vi.fn(),
}))

const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient)
const mockedCreateServiceSupabaseClient = vi.mocked(createServiceSupabaseClient)

interface AccountRecord {
  id: string
  household_id: string
  institution_id: string
  account_type: string
  product_name: string
  nickname: string | null
  identifier_hint: string | null
  currency: string
  is_active: boolean
}

interface InstitutionRecord {
  id: string
  name: string
  country_code: string
  type: string
}

interface CardRecord {
  account_id: string
  card_name: string
  card_last4: string
}

interface ExchangeAccountRecord {
  account_id: string
  exchange_name: string | null
  account_label: string | null
}

function createAuthSupabaseMock(userId: string | null, householdId: string | null = 'hh-1') {
  return {
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null } }),
    },
    from: (table: string) => {
      if (table === 'user_profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: householdId ? { household_id: householdId } : null }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected auth table ${table}`)
    },
  }
}

function createServiceDbMock(params: {
  accounts: AccountRecord[]
  institutions: InstitutionRecord[]
  cards?: CardRecord[]
  exchangeAccounts?: ExchangeAccountRecord[]
}) {
  const cards = params.cards ?? []
  const exchangeAccounts = params.exchangeAccounts ?? []

  return {
    from: (table: string) => {
      if (table === 'accounts') {
        return {
          select: () => {
            const filters = new Map<string, unknown>()
            return {
              eq(column: string, value: unknown) {
                filters.set(column, value)
                return this
              },
              async maybeSingle() {
                const account = params.accounts.find((row) =>
                  Array.from(filters.entries()).every(([column, value]) => row[column as keyof AccountRecord] === value),
                ) ?? null
                return { data: account, error: null }
              },
            }
          },
          update: (values: Partial<AccountRecord>) => ({
            eq: (firstColumn: string, firstValue: unknown) => ({
              eq: (secondColumn: string, secondValue: unknown) => ({
                select: () => ({
                  single: async () => {
                    const index = params.accounts.findIndex((row) =>
                      row[firstColumn as keyof AccountRecord] === firstValue
                      && row[secondColumn as keyof AccountRecord] === secondValue,
                    )

                    if (index === -1) {
                      return { data: null, error: { message: 'Account not found' } }
                    }

                    params.accounts[index] = {
                      ...params.accounts[index],
                      ...values,
                    }

                    return { data: params.accounts[index], error: null }
                  },
                }),
              }),
            }),
          }),
        }
      }

      if (table === 'institutions') {
        return {
          select: () => {
            let institutionId: string | null = null
            let institutionName: string | null = null
            return {
              eq(column: string, value: unknown) {
                if (column === 'id') institutionId = String(value)
                return this
              },
              ilike(column: string, value: unknown) {
                if (column === 'name') institutionName = String(value)
                return this
              },
              limit() {
                return this
              },
              async single() {
                const institution = params.institutions.find((row) => row.id === institutionId) ?? null
                return { data: institution, error: null }
              },
              async maybeSingle() {
                const institution = params.institutions.find((row) =>
                  row.name.toLowerCase() === (institutionName ?? '').toLowerCase(),
                ) ?? null
                return { data: institution, error: null }
              },
            }
          },
          insert: (values: Omit<InstitutionRecord, 'id'>) => ({
            select: () => ({
              single: async () => {
                const created = {
                  id: `institution-${params.institutions.length + 1}`,
                  ...values,
                }
                params.institutions.push(created)
                return { data: created, error: null }
              },
            }),
          }),
        }
      }

      if (table === 'cards') {
        return {
          upsert: async (values: CardRecord) => {
            const existingIndex = cards.findIndex((row) => row.account_id === values.account_id)
            if (existingIndex >= 0) {
              cards[existingIndex] = { ...cards[existingIndex], ...values }
            } else {
              cards.push(values)
            }
            return { data: values, error: null }
          },
        }
      }

      if (table === 'exchange_accounts') {
        return {
          upsert: async (values: ExchangeAccountRecord) => {
            const existingIndex = exchangeAccounts.findIndex((row) => row.account_id === values.account_id)
            if (existingIndex >= 0) {
              exchangeAccounts[existingIndex] = { ...exchangeAccounts[existingIndex], ...values }
            } else {
              exchangeAccounts.push(values)
            }
            return { data: values, error: null }
          },
        }
      }

      throw new Error(`Unexpected service table ${table}`)
    },
  }
}

describe('PATCH /api/accounts/[id]', () => {
  beforeEach(() => {
    mockedCreateServerSupabaseClient.mockReset()
    mockedCreateServiceSupabaseClient.mockReset()
  })

  it('returns 401 when the request is unauthenticated', async () => {
    mockedCreateServerSupabaseClient.mockResolvedValue(createAuthSupabaseMock(null) as never)

    const request = new NextRequest('http://localhost/api/accounts/acct-1', {
      method: 'PATCH',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    })

    const response = await PATCH(request, { params: Promise.resolve({ id: 'acct-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload.error).toBe('Unauthorized')
  })

  it('returns 404 when the account is outside the current household', async () => {
    mockedCreateServerSupabaseClient.mockResolvedValue(createAuthSupabaseMock('user-1') as never)
    mockedCreateServiceSupabaseClient.mockReturnValue(createServiceDbMock({
      accounts: [
        {
          id: 'acct-1',
          household_id: 'hh-other',
          institution_id: 'inst-1',
          account_type: 'savings',
          product_name: 'Everyday Account',
          nickname: null,
          identifier_hint: null,
          currency: 'SGD',
          is_active: true,
        },
      ],
      institutions: [{ id: 'inst-1', name: 'DBS Bank Ltd', country_code: 'SG', type: 'bank' }],
    }) as never)

    const request = new NextRequest('http://localhost/api/accounts/acct-1', {
      method: 'PATCH',
      body: JSON.stringify({
        institution_name: 'DBS Bank Ltd',
        product_name: 'Everyday Account',
        nickname: 'Daily',
        identifier_hint: null,
        currency: 'SGD',
        is_active: true,
      }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await PATCH(request, { params: Promise.resolve({ id: 'acct-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(payload.error).toBe('Account not found')
  })

  it('updates a savings account and reassigns the institution by name', async () => {
    const accounts: AccountRecord[] = [
      {
        id: 'acct-1',
        household_id: 'hh-1',
        institution_id: 'inst-1',
        account_type: 'savings',
        product_name: 'Everyday Account',
        nickname: 'Daily',
        identifier_hint: '4321',
        currency: 'SGD',
        is_active: true,
      },
    ]
    const institutions: InstitutionRecord[] = [
      { id: 'inst-1', name: 'DBS Bank Ltd', country_code: 'SG', type: 'bank' },
    ]

    mockedCreateServerSupabaseClient.mockResolvedValue(createAuthSupabaseMock('user-1') as never)
    mockedCreateServiceSupabaseClient.mockReturnValue(createServiceDbMock({
      accounts,
      institutions,
    }) as never)

    const request = new NextRequest('http://localhost/api/accounts/acct-1', {
      method: 'PATCH',
      body: JSON.stringify({
        institution_name: 'OCBC Bank',
        product_name: '360 Account',
        nickname: 'Primary Savings',
        identifier_hint: '6789',
        currency: 'usd',
        is_active: false,
      }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await PATCH(request, { params: Promise.resolve({ id: 'acct-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.account).toMatchObject({
      id: 'acct-1',
      product_name: '360 Account',
      nickname: 'Primary Savings',
      identifier_hint: '6789',
      currency: 'USD',
      is_active: false,
    })
    expect(payload.institution).toMatchObject({
      name: 'OCBC Bank',
      country_code: 'SG',
    })
    expect(accounts[0].institution_id).toBe('institution-2')
    expect(institutions).toHaveLength(2)
  })

  it('updates credit card metadata and normalizes card last4 digits', async () => {
    const accounts: AccountRecord[] = [
      {
        id: 'acct-1',
        household_id: 'hh-1',
        institution_id: 'inst-1',
        account_type: 'credit_card',
        product_name: 'Altitude Visa',
        nickname: 'Travel Card',
        identifier_hint: '1234',
        currency: 'SGD',
        is_active: true,
      },
    ]
    const cards: CardRecord[] = [
      {
        account_id: 'acct-1',
        card_name: 'Altitude Visa',
        card_last4: '1234',
      },
    ]

    mockedCreateServerSupabaseClient.mockResolvedValue(createAuthSupabaseMock('user-1') as never)
    mockedCreateServiceSupabaseClient.mockReturnValue(createServiceDbMock({
      accounts,
      institutions: [{ id: 'inst-1', name: 'DBS Bank Ltd', country_code: 'SG', type: 'bank' }],
      cards,
    }) as never)

    const request = new NextRequest('http://localhost/api/accounts/acct-1', {
      method: 'PATCH',
      body: JSON.stringify({
        institution_name: 'DBS Bank Ltd',
        product_name: 'Altitude Visa',
        nickname: 'Travel Card',
        identifier_hint: 'Card 98-76',
        currency: 'SGD',
        is_active: true,
        card_name: 'DBS Altitude World Elite',
        card_last4: '98-76',
      }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await PATCH(request, { params: Promise.resolve({ id: 'acct-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.account.id).toBe('acct-1')
    expect(cards[0]).toMatchObject({
      account_id: 'acct-1',
      card_name: 'DBS Altitude World Elite',
      card_last4: '9876',
    })
  })

  it('rejects attempts to change the account type', async () => {
    mockedCreateServerSupabaseClient.mockResolvedValue(createAuthSupabaseMock('user-1') as never)
    mockedCreateServiceSupabaseClient.mockReturnValue(createServiceDbMock({
      accounts: [
        {
          id: 'acct-1',
          household_id: 'hh-1',
          institution_id: 'inst-1',
          account_type: 'credit_card',
          product_name: 'Altitude Visa',
          nickname: 'Travel Card',
          identifier_hint: '1234',
          currency: 'SGD',
          is_active: true,
        },
      ],
      institutions: [{ id: 'inst-1', name: 'DBS Bank Ltd', country_code: 'SG', type: 'bank' }],
    }) as never)

    const request = new NextRequest('http://localhost/api/accounts/acct-1', {
      method: 'PATCH',
      body: JSON.stringify({
        institution_name: 'DBS Bank Ltd',
        product_name: 'Altitude Visa',
        nickname: 'Travel Card',
        identifier_hint: '1234',
        currency: 'SGD',
        is_active: true,
        account_type: 'loan',
      }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await PATCH(request, { params: Promise.resolve({ id: 'acct-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Account type cannot be changed.')
  })
})
