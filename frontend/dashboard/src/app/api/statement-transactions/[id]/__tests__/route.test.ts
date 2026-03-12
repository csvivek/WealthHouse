// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PATCH } from '@/app/api/statement-transactions/[id]/route'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { getAuthenticatedHouseholdContext } from '@/lib/server/household-context'
import { replaceTagsOnStatementTransaction, validateTagOwnership } from '@/lib/server/tag-service'

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/server/household-context', () => ({
  getAuthenticatedHouseholdContext: vi.fn(),
}))

vi.mock('@/lib/server/tag-service', () => ({
  replaceTagsOnStatementTransaction: vi.fn(),
  validateTagOwnership: vi.fn(),
}))

const mockedCreateServiceSupabaseClient = vi.mocked(createServiceSupabaseClient)
const mockedGetAuthenticatedHouseholdContext = vi.mocked(getAuthenticatedHouseholdContext)
const mockedReplaceTagsOnStatementTransaction = vi.mocked(replaceTagsOnStatementTransaction)
const mockedValidateTagOwnership = vi.mocked(validateTagOwnership)

const FOOD_TAG = {
  id: 'tag-1',
  name: 'Food',
  color_token: 'chart-4',
  color_hex: null,
  icon_key: 'tag',
  source: 'custom',
  is_active: true,
}

function createRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/statement-transactions/txn-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function createServiceDbMock(params?: {
  transactions?: Array<Record<string, unknown>>
  categories?: Array<Record<string, unknown>>
  accountHouseholds?: Record<string, string | null>
  accountMeta?: Record<string, { id: string; product_name: string; nickname: string | null }>
  links?: Array<Record<string, unknown>>
}) {
  const transactions = new Map<string, Record<string, unknown>>(
    (params?.transactions ?? [
      {
        id: 'txn-1',
        txn_type: 'debit',
        txn_date: '2026-03-10',
        amount: 42.5,
        merchant_normalized: 'Cafe Example',
        merchant_raw: 'Cafe Example',
        description: 'Lunch',
        category_id: 11,
        account_id: 'acct-1',
        confidence: 1,
        tags: [FOOD_TAG],
      },
      {
        id: 'txn-2',
        txn_type: 'credit',
        txn_date: '2026-03-10',
        amount: 42.5,
        merchant_normalized: 'Transfer In',
        merchant_raw: 'Transfer In',
        description: 'Own transfer',
        category_id: 99,
        account_id: 'acct-2',
        confidence: 1,
        tags: [],
      },
      {
        id: 'txn-same-account',
        txn_type: 'credit',
        txn_date: '2026-03-10',
        amount: 42.5,
        merchant_normalized: 'Same Account',
        merchant_raw: 'Same Account',
        description: 'Internal move',
        category_id: null,
        account_id: 'acct-1',
        confidence: 1,
        tags: [],
      },
      {
        id: 'txn-same-direction',
        txn_type: 'debit',
        txn_date: '2026-03-11',
        amount: 42.5,
        merchant_normalized: 'Debit Counterpart',
        merchant_raw: 'Debit Counterpart',
        description: 'Wrong direction',
        category_id: null,
        account_id: 'acct-3',
        confidence: 1,
        tags: [],
      },
      {
        id: 'txn-linked-elsewhere',
        txn_type: 'credit',
        txn_date: '2026-03-12',
        amount: 42.5,
        merchant_normalized: 'Already Linked',
        merchant_raw: 'Already Linked',
        description: 'Busy target',
        category_id: 99,
        account_id: 'acct-4',
        confidence: 1,
        tags: [],
      },
      {
        id: 'txn-linked-source',
        txn_type: 'debit',
        txn_date: '2026-03-12',
        amount: 42.5,
        merchant_normalized: 'Other Transfer',
        merchant_raw: 'Other Transfer',
        description: 'Linked elsewhere',
        category_id: 99,
        account_id: 'acct-5',
        confidence: 1,
        tags: [],
      },
      {
        id: 'txn-outside',
        txn_type: 'credit',
        txn_date: '2026-03-10',
        amount: 42.5,
        merchant_normalized: 'Outside Household',
        merchant_raw: 'Outside Household',
        description: 'Should 404',
        category_id: null,
        account_id: 'acct-outside',
        confidence: 1,
        tags: [],
      },
    ]).map((transaction) => [String(transaction.id), { ...transaction }]),
  )

  const categories = new Map<number, Record<string, unknown>>(
    (params?.categories ?? [
      {
        id: 22,
        name: 'Dining',
        type: 'expense',
        group_id: 3,
        subgroup_id: null,
        icon_key: 'food',
        color_token: 'chart-2',
        color_hex: null,
        domain_type: 'payment',
        payment_subtype: 'expense',
        category_group: { id: 3, name: 'Lifestyle' },
        category_subgroup: null,
      },
      {
        id: 99,
        name: 'Internal Transfer',
        type: 'transfer',
        group_id: 6,
        subgroup_id: null,
        icon_key: 'transfer',
        color_token: 'chart-5',
        color_hex: null,
        domain_type: 'payment',
        payment_subtype: 'transfer',
        category_group: { id: 6, name: 'Transfers' },
        category_subgroup: null,
      },
    ]).map((category) => [Number(category.id), { ...category }]),
  )

  const accountHouseholds: Record<string, string | null> = {
    'acct-1': 'hh-1',
    'acct-2': 'hh-1',
    'acct-3': 'hh-1',
    'acct-4': 'hh-1',
    'acct-5': 'hh-1',
    'acct-outside': 'hh-2',
    ...params?.accountHouseholds,
  }

  const accountMeta: Record<string, { id: string; product_name: string; nickname: string | null }> = {
    'acct-1': { id: 'acct-1', product_name: 'Main Card', nickname: 'Main Card' },
    'acct-2': { id: 'acct-2', product_name: 'Savings', nickname: 'Savings' },
    'acct-3': { id: 'acct-3', product_name: 'Checking', nickname: 'Checking' },
    'acct-4': { id: 'acct-4', product_name: 'Joint', nickname: 'Joint' },
    'acct-5': { id: 'acct-5', product_name: 'Reserve', nickname: 'Reserve' },
    'acct-outside': { id: 'acct-outside', product_name: 'External', nickname: 'External' },
    ...params?.accountMeta,
  }

  const links: Array<Record<string, unknown>> = [...(params?.links ?? [])].map((link, index) => ({
    id: `link-${index + 1}`,
    link_type: 'internal_transfer',
    status: 'confirmed',
    link_score: 1,
    link_reason: {},
    matched_by: 'user',
    matched_by_user_id: 'user-1',
    ...link,
  }))

  function getTransaction(transactionId: string) {
    return transactions.get(transactionId) ?? null
  }

  function getEditorResponse(transactionId: string) {
    const transaction = getTransaction(transactionId)
    if (!transaction) return null

    const categoryId = typeof transaction.category_id === 'number' ? transaction.category_id : null
    const category = categoryId != null ? categories.get(categoryId) ?? null : null
    const account = accountMeta[String(transaction.account_id)] ?? null

    return {
      id: transaction.id,
      txn_type: transaction.txn_type,
      txn_date: transaction.txn_date,
      amount: transaction.amount,
      merchant_normalized: transaction.merchant_normalized,
      merchant_raw: transaction.merchant_raw,
      description: transaction.description,
      account_id: transaction.account_id,
      account,
      category_id: categoryId,
      category,
      statement_transaction_tags: Array.isArray(transaction.tags)
        ? transaction.tags.map((tag) => ({ tag }))
        : [],
    }
  }

  function getSummaryResponse(transactionId: string) {
    const transaction = getTransaction(transactionId)
    if (!transaction) return null

    return {
      id: transaction.id,
      txn_type: transaction.txn_type,
      txn_date: transaction.txn_date,
      amount: transaction.amount,
      merchant_normalized: transaction.merchant_normalized,
      merchant_raw: transaction.merchant_raw,
      description: transaction.description,
      account_id: transaction.account_id,
      account: accountMeta[String(transaction.account_id)] ?? null,
    }
  }

  return {
    from: (table: string) => {
      if (table === 'statement_transactions') {
        return {
          select: (query: string) => ({
            eq: (_column: string, transactionId: string) => ({
              maybeSingle: async () => {
                if (query.includes('statement_transaction_tags')) {
                  return { data: getEditorResponse(transactionId), error: null }
                }

                if (query.includes('txn_date')) {
                  return { data: getSummaryResponse(transactionId), error: null }
                }

                const transaction = getTransaction(transactionId)
                return {
                  data: transaction
                    ? {
                        id: transaction.id,
                        txn_type: transaction.txn_type,
                        category_id: transaction.category_id ?? null,
                        account_id: transaction.account_id,
                      }
                    : null,
                  error: null,
                }
              },
            }),
          }),
          update: (values: Record<string, unknown>) => ({
            eq: async (_column: string, transactionId: string) => {
              const transaction = getTransaction(transactionId)
              if (transaction) transaction.category_id = values.category_id ?? null
              return { error: null }
            },
          }),
        }
      }

      if (table === 'accounts') {
        return {
          select: () => ({
            eq: (_column: string, accountId: string) => ({
              maybeSingle: async () => {
                const householdId = accountHouseholds[accountId] ?? null
                return {
                  data: householdId ? { household_id: householdId } : null,
                  error: null,
                }
              },
            }),
          }),
        }
      }

      if (table === 'categories') {
        return {
          select: () => ({
            eq: (_column: string, categoryId: number) => ({
              maybeSingle: async () => ({
                data: categories.get(categoryId) ?? null,
                error: null,
              }),
            }),
          }),
        }
      }

      if (table === 'transaction_links') {
        return {
          select: () => {
            const filters: Array<[string, unknown]> = []
            const builder = {
              eq: (column: string, value: unknown) => {
                filters.push([column, value])
                return builder
              },
              then: <TResult1 = { data: Array<Record<string, unknown>>; error: null }>(
                onfulfilled?: ((value: { data: Array<Record<string, unknown>>; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
                onrejected?: ((reason: unknown) => PromiseLike<never>) | null,
              ) => {
                const data = links.filter((link) => filters.every(([column, value]) => link[column] === value))
                return Promise.resolve({ data, error: null as null }).then(onfulfilled, onrejected)
              },
            }
            return builder
          },
          delete: () => {
            const filters: Array<[string, unknown]> = []
            const builder = {
              eq: (column: string, value: unknown) => {
                filters.push([column, value])
                return builder
              },
              then: <TResult1 = { error: null }>(
                onfulfilled?: ((value: { error: null }) => TResult1 | PromiseLike<TResult1>) | null,
                onrejected?: ((reason: unknown) => PromiseLike<never>) | null,
              ) => {
                for (let index = links.length - 1; index >= 0; index -= 1) {
                  if (filters.every(([column, value]) => links[index][column] === value)) {
                    links.splice(index, 1)
                  }
                }
                return Promise.resolve({ error: null as null }).then(onfulfilled, onrejected)
              },
            }
            return builder
          },
          insert: async (value: Record<string, unknown>) => {
            links.push({
              id: `link-${links.length + 1}`,
              link_type: 'internal_transfer',
              status: 'confirmed',
              link_score: 1,
              link_reason: {},
              matched_by: 'user',
              matched_by_user_id: 'user-1',
              ...value,
            })
            return { error: null }
          },
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

describe('PATCH /api/statement-transactions/[id]', () => {
  beforeEach(() => {
    mockedCreateServiceSupabaseClient.mockReset()
    mockedGetAuthenticatedHouseholdContext.mockReset()
    mockedReplaceTagsOnStatementTransaction.mockReset()
    mockedValidateTagOwnership.mockReset()
    mockedGetAuthenticatedHouseholdContext.mockResolvedValue({ userId: 'user-1', householdId: 'hh-1' })
    mockedValidateTagOwnership.mockResolvedValue([])
    mockedReplaceTagsOnStatementTransaction.mockResolvedValue({
      added: 1,
      removed: 0,
      skipped_existing: 0,
      affected_transactions: 1,
    })
  })

  it('returns 401 when unauthenticated', async () => {
    mockedGetAuthenticatedHouseholdContext.mockResolvedValueOnce(null)

    const response = await PATCH(createRequest({ categoryId: 22, tagIds: ['tag-1'] }), {
      params: Promise.resolve({ id: 'txn-1' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when the source transaction is outside the household', async () => {
    mockedCreateServiceSupabaseClient.mockReturnValue(createServiceDbMock({
      accountHouseholds: {
        'acct-1': 'hh-2',
      },
    }) as never)

    const response = await PATCH(createRequest({ categoryId: 22, tagIds: ['tag-1'] }), {
      params: Promise.resolve({ id: 'txn-1' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(payload.error).toMatch(/transaction not found/i)
  })

  it('returns 404 when the transfer counterpart is outside the household', async () => {
    mockedCreateServiceSupabaseClient.mockReturnValue(createServiceDbMock() as never)

    const response = await PATCH(createRequest({ categoryId: 99, tagIds: ['tag-1'], internalTransferTargetId: 'txn-outside' }), {
      params: Promise.resolve({ id: 'txn-1' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(payload.error).toMatch(/counterpart transaction not found/i)
  })

  it('returns 400 for a missing category', async () => {
    mockedCreateServiceSupabaseClient.mockReturnValue(createServiceDbMock({
      categories: [],
    }) as never)

    const response = await PATCH(createRequest({ categoryId: 999, tagIds: ['tag-1'] }), {
      params: Promise.resolve({ id: 'txn-1' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/category not found/i)
  })

  it('returns 400 when a counterpart is provided for a non-internal-transfer category', async () => {
    mockedCreateServiceSupabaseClient.mockReturnValue(createServiceDbMock() as never)

    const response = await PATCH(createRequest({ categoryId: 22, tagIds: ['tag-1'], internalTransferTargetId: 'txn-2' }), {
      params: Promise.resolve({ id: 'txn-1' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/internal transfer category/i)
  })

  it('returns 400 for self-link, same-account, and same-direction validations', async () => {
    mockedCreateServiceSupabaseClient.mockReturnValue(createServiceDbMock() as never)

    const selfResponse = await PATCH(createRequest({ categoryId: 99, tagIds: ['tag-1'], internalTransferTargetId: 'txn-1' }), {
      params: Promise.resolve({ id: 'txn-1' }),
    })
    expect(selfResponse.status).toBe(400)

    const sameAccountResponse = await PATCH(createRequest({ categoryId: 99, tagIds: ['tag-1'], internalTransferTargetId: 'txn-same-account' }), {
      params: Promise.resolve({ id: 'txn-1' }),
    })
    const sameAccountPayload = await sameAccountResponse.json()
    expect(sameAccountResponse.status).toBe(400)
    expect(sameAccountPayload.error).toMatch(/different account/i)

    const sameDirectionResponse = await PATCH(createRequest({ categoryId: 99, tagIds: ['tag-1'], internalTransferTargetId: 'txn-same-direction' }), {
      params: Promise.resolve({ id: 'txn-1' }),
    })
    const sameDirectionPayload = await sameDirectionResponse.json()
    expect(sameDirectionResponse.status).toBe(400)
    expect(sameDirectionPayload.error).toMatch(/opposite direction/i)
  })

  it('returns 400 when the counterpart is already linked elsewhere', async () => {
    mockedCreateServiceSupabaseClient.mockReturnValue(createServiceDbMock({
      links: [
        {
          from_transaction_id: 'txn-linked-source',
          to_transaction_id: 'txn-linked-elsewhere',
        },
      ],
    }) as never)

    const response = await PATCH(createRequest({ categoryId: 99, tagIds: ['tag-1'], internalTransferTargetId: 'txn-linked-elsewhere' }), {
      params: Promise.resolve({ id: 'txn-1' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/already linked/i)
  })

  it('updates category, tags, and internal transfer link together', async () => {
    const db = createServiceDbMock()
    mockedCreateServiceSupabaseClient.mockReturnValue(db as never)

    const response = await PATCH(createRequest({ categoryId: 99, tagIds: ['tag-1'], internalTransferTargetId: 'txn-2' }), {
      params: Promise.resolve({ id: 'txn-1' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.transaction).toEqual({
      id: 'txn-1',
      categoryId: 99,
      category: expect.objectContaining({ id: 99, name: 'Internal Transfer' }),
      tags: [expect.objectContaining({ id: 'tag-1', name: 'Food' })],
      internalTransferLink: expect.objectContaining({
        counterpartTransactionId: 'txn-2',
        counterpartAccountId: 'acct-2',
        counterpartAccountName: 'Savings',
        directionLabel: 'to',
      }),
    })
    expect(mockedValidateTagOwnership).toHaveBeenCalledWith(db, 'hh-1', ['tag-1'])
    expect(mockedReplaceTagsOnStatementTransaction).toHaveBeenCalledWith({
      db,
      householdId: 'hh-1',
      transactionId: 'txn-1',
      tagIds: ['tag-1'],
      actorUserId: 'user-1',
    })
  })

  it('clears the category and counterpart link when categoryId is null', async () => {
    const db = createServiceDbMock({
      links: [
        {
          from_transaction_id: 'txn-1',
          to_transaction_id: 'txn-2',
        },
      ],
    })
    mockedCreateServiceSupabaseClient.mockReturnValue(db as never)

    const response = await PATCH(createRequest({ categoryId: null, tagIds: [], internalTransferTargetId: null }), {
      params: Promise.resolve({ id: 'txn-1' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.transaction).toEqual({
      id: 'txn-1',
      categoryId: null,
      category: null,
      tags: [expect.objectContaining({ id: 'tag-1', name: 'Food' })],
      internalTransferLink: null,
    })
  })
})
