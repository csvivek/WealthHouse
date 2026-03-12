import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import TransactionsPage from '@/app/(dashboard)/transactions/page'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

const mockedCreateClient = vi.mocked(createClient)

function createJsonResponse(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => payload,
  } as Response
}

function createSupabaseClientMock(params?: {
  transactions?: Array<Record<string, unknown>>
  transactionLinks?: Array<Record<string, unknown>>
}) {
  const accounts = [
    {
      id: 'acct-1',
      product_name: 'Main Card',
      nickname: 'Main Card',
    },
    {
      id: 'acct-2',
      product_name: 'Savings',
      nickname: 'Savings',
    },
  ]

  const transactions = params?.transactions ?? [
    {
      id: 'txn-1',
      txn_date: '2026-03-10',
      amount: 42.5,
      txn_type: 'debit',
      merchant_normalized: 'Cafe Example',
      merchant_raw: 'Cafe Example',
      description: 'Lunch',
      category_id: null,
      account_id: 'acct-1',
      confidence: 1,
      category: null,
      statement_transaction_tags: [],
    },
    {
      id: 'txn-2',
      txn_date: '2025-01-10',
      amount: 1800,
      txn_type: 'credit',
      merchant_normalized: 'Salary Payment',
      merchant_raw: 'Salary Payment',
      description: 'Monthly salary',
      category_id: null,
      account_id: 'acct-2',
      confidence: 1,
      category: null,
      statement_transaction_tags: [],
    },
    {
      id: 'txn-3',
      txn_date: '2026-03-10',
      amount: 42.5,
      txn_type: 'credit',
      merchant_normalized: 'Transfer In',
      merchant_raw: 'Transfer In',
      description: 'Own transfer',
      category_id: null,
      account_id: 'acct-2',
      confidence: 1,
      category: null,
      statement_transaction_tags: [],
    },
  ]

  const categories = [
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
  ]

  const transactionLinks = params?.transactionLinks ?? []

  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
    from: (table: string) => {
      if (table === 'user_profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { household_id: 'hh-1' } }),
            }),
          }),
        }
      }

      if (table === 'accounts') {
        return {
          select: () => ({
            eq: async () => ({
              data: accounts,
            }),
          }),
        }
      }

      if (table === 'statement_transactions') {
        return {
          select: () => ({
            in: () => ({
              order: async () => ({
                data: transactions,
                error: null,
              }),
            }),
          }),
        }
      }

      if (table === 'categories') {
        return {
          select: async () => ({
            data: categories,
            error: null,
          }),
        }
      }

      if (table === 'transaction_links') {
        return {
          select: () => ({
            eq: (_column: string, _value: string) => ({
              eq: (_statusColumn: string, _statusValue: string) => ({
                in: async (transactionColumn: string, transactionIds: string[]) => ({
                  data: transactionLinks.filter((link) => transactionIds.includes(String(link[transactionColumn]))),
                  error: null,
                }),
              }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

describe('TransactionsPage', () => {
  beforeAll(() => {
    if (!HTMLElement.prototype.hasPointerCapture) {
      Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', { configurable: true, value: () => false })
    }
    if (!HTMLElement.prototype.setPointerCapture) {
      Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: () => undefined })
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
      Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { configurable: true, value: () => undefined })
    }
    if (!HTMLElement.prototype.scrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: () => undefined })
    }
    if (!globalThis.ResizeObserver) {
      class ResizeObserverMock {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    }
  })

  beforeEach(() => {
    mockedCreateClient.mockReset()
    mockedCreateClient.mockReturnValue(createSupabaseClientMock() as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  it('renders icon-only action buttons and shows the category tooltip', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => createJsonResponse({ tags: [] })))

    render(<TransactionsPage />)

    const [categoryButton] = await screen.findAllByRole('button', { name: 'Edit category' })
    const [tagButton] = screen.getAllByRole('button', { name: 'Edit tags' })

    expect(tagButton).toBeInTheDocument()

    await userEvent.hover(categoryButton)
    await waitFor(() => {
      const tooltipId = categoryButton.getAttribute('aria-describedby')
      expect(tooltipId).toBeTruthy()
      expect(document.getElementById(String(tooltipId))).toHaveTextContent('Edit category')
    })
  })

  it('focuses the category control when opened from the category action and the tag trigger when opened from the tag action', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => createJsonResponse({ tags: [] })))

    render(<TransactionsPage />)

    const [categoryButton] = await screen.findAllByRole('button', { name: 'Edit category' })
    await userEvent.click(categoryButton)

    let sheet = await screen.findByRole('dialog')
    let categoryTrigger = within(sheet).getByRole('combobox', { name: 'Transaction category' })
    await waitFor(() => {
      expect(categoryTrigger).toHaveFocus()
    })

    await userEvent.keyboard('{Escape}')

    const [tagButton] = screen.getAllByRole('button', { name: 'Edit tags' })
    await userEvent.click(tagButton)
    sheet = await screen.findByRole('dialog')
    const tagTrigger = within(sheet).getByRole('button', { name: 'Choose tags' })
    await waitFor(() => {
      expect(tagTrigger).toHaveFocus()
    })
  })

  it('shows both credit and debit transactions by default and allows type filtering', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => createJsonResponse({ tags: [] })))

    render(<TransactionsPage />)

    expect(await screen.findByText('Cafe Example')).toBeInTheDocument()
    expect(screen.getByText('Salary Payment')).toBeInTheDocument()

    const typeTrigger = screen.getByRole('combobox', { name: 'Transaction type' })
    await userEvent.click(typeTrigger)
    await userEvent.click(await screen.findByRole('option', { name: 'Credit' }))

    await waitFor(() => {
      expect(screen.queryByText('Cafe Example')).not.toBeInTheDocument()
      expect(screen.getByText('Salary Payment')).toBeInTheDocument()
    })
  })

  it('reveals the counterpart picker only for the Internal Transfer category', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => createJsonResponse({ tags: [] })))

    render(<TransactionsPage />)

    const [categoryButton] = await screen.findAllByRole('button', { name: 'Edit category' })
    await userEvent.click(categoryButton)

    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).queryByText('Transfer counterpart')).not.toBeInTheDocument()

    const categoryTrigger = within(sheet).getByRole('combobox', { name: 'Transaction category' })
    await userEvent.click(categoryTrigger)
    await userEvent.click(await screen.findByRole('option', { name: 'Internal Transfer' }))

    await waitFor(() => {
      expect(within(sheet).getByText('Transfer counterpart')).toBeInTheDocument()
      expect(within(sheet).getByRole('button', { name: /Transfer In/i })).toBeInTheDocument()
    })
  })

  it('updates the row hint after saving an internal transfer counterpart and keeps tags', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/api/tags?')) {
        return createJsonResponse({
          tags: [
            {
              id: 'tag-1',
              name: 'Food',
              color_token: 'chart-4',
              color_hex: null,
              icon_key: 'tag',
              source: 'custom',
              is_active: true,
            },
          ],
        })
      }

      if (url === '/api/statement-transactions/txn-1' && init?.method === 'PATCH') {
        return createJsonResponse({
          success: true,
          transaction: {
            id: 'txn-1',
            categoryId: 99,
            category: {
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
            tags: [
              {
                id: 'tag-1',
                name: 'Food',
                color_token: 'chart-4',
                color_hex: null,
                icon_key: 'tag',
                source: 'custom',
              },
            ],
            internalTransferLink: {
              counterpartTransactionId: 'txn-3',
              counterpartAccountId: 'acct-2',
              counterpartAccountName: 'Savings',
              counterpartTxnType: 'credit',
              counterpartTxnDate: '2026-03-10',
              counterpartAmount: 42.5,
              counterpartDisplayName: 'Transfer In',
              directionLabel: 'to',
            },
          },
        })
      }

      return createJsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<TransactionsPage />)

    const [categoryButton] = await screen.findAllByRole('button', { name: 'Edit category' })
    await userEvent.click(categoryButton)

    const sheet = await screen.findByRole('dialog')
    const categoryTrigger = within(sheet).getByRole('combobox', { name: 'Transaction category' })
    await userEvent.click(categoryTrigger)
    await userEvent.click(await screen.findByRole('option', { name: 'Internal Transfer' }))

    await waitFor(() => {
      expect(within(sheet).getByText('Transfer counterpart')).toBeInTheDocument()
    })
    await userEvent.click(within(sheet).getByRole('button', { name: /Transfer In/i }))

    await userEvent.click(within(sheet).getByRole('button', { name: 'Choose tags' }))
    const dialogs = await screen.findAllByRole('dialog')
    const tagDialog = dialogs[dialogs.length - 1]
    await userEvent.click(within(tagDialog).getByRole('button', { name: /Food/i }))
    await userEvent.click(within(tagDialog).getByRole('button', { name: 'Done' }))

    await userEvent.click(within(sheet).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(screen.getByText('Internal Transfer')).toBeInTheDocument()
      expect(screen.getByText('Food')).toBeInTheDocument()
      expect(screen.getByText('Transfer to Savings')).toBeInTheDocument()
    })

    const patchCall = fetchMock.mock.calls.find(([input, init]) => String(input) === '/api/statement-transactions/txn-1' && init?.method === 'PATCH')
    expect(patchCall).toBeTruthy()
    expect(JSON.parse(String((patchCall?.[1] as RequestInit).body))).toEqual({
      categoryId: 99,
      tagIds: ['tag-1'],
      internalTransferTargetId: 'txn-3',
    })
    expect(toast.success).toHaveBeenCalledWith('Transaction updated')
  })
})
