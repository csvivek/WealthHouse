import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import CategoriesPage from '@/app/(dashboard)/categories/page'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

type PaymentSubtype = 'expense' | 'income' | 'transfer'

function createJsonResponse(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => payload,
  } as Response
}

function buildPaymentCategory({
  id,
  name,
  type,
  groupId,
  groupName,
}: {
  id: number
  name: string
  type: PaymentSubtype
  groupId: number
  groupName: string
}) {
  return {
    id,
    name,
    type,
    status: 'active' as const,
    mappedCount: 2,
    icon_key: type === 'income' ? 'salary' : type === 'transfer' ? 'transfer' : 'home',
    color_token: 'chart-1',
    color_hex: null,
    household_id: null,
    source_category_id: null,
    isGlobal: false,
    created_at: '2026-01-01',
    updated_at: '2026-01-02',
    effective_group_id: groupId,
    effective_group_name: groupName,
    effective_group_sort_order: 10,
    effective_group_archived: false,
    effective_category_sort_order: id * 10,
    payment_subtype: type,
  }
}

function buildPaymentGroup({
  id,
  name,
  subtype,
  categories,
}: {
  id: number
  name: string
  subtype: PaymentSubtype
  categories: ReturnType<typeof buildPaymentCategory>[]
}) {
  return {
    id,
    name,
    sort_order: id * 10,
    is_archived: false,
    is_system_seeded: false,
    template_key: null,
    description: null,
    category_count: categories.length,
    payment_subtype: subtype,
    categories,
  }
}

function buildReceiptCategory({
  id,
  name,
  groupId,
  groupName,
}: {
  id: string
  name: string
  groupId: number
  groupName: string
}) {
  return {
    id,
    name,
    type: 'essentials',
    status: 'active' as const,
    mappedCount: 1,
    icon_key: 'shopping',
    color_token: 'chart-4',
    color_hex: null,
    household_id: 'hh-1',
    source_category_id: null,
    isGlobal: false,
    created_at: '2026-01-01',
    updated_at: '2026-01-02',
    effective_group_id: groupId,
    effective_group_name: groupName,
    effective_group_sort_order: 10,
    effective_group_archived: false,
    effective_category_sort_order: 10,
  }
}

function buildReceiptGroup({
  id,
  name,
  categories,
}: {
  id: number
  name: string
  categories: ReturnType<typeof buildReceiptCategory>[]
}) {
  return {
    id,
    name,
    sort_order: id * 10,
    is_archived: false,
    is_system_seeded: false,
    template_key: null,
    description: null,
    category_count: categories.length,
    categories,
  }
}

const expenseRent = buildPaymentCategory({
  id: 1,
  name: 'Rent',
  type: 'expense',
  groupId: 101,
  groupName: 'Housing',
})

const expenseGroceries = buildPaymentCategory({
  id: 2,
  name: 'Groceries',
  type: 'expense',
  groupId: 102,
  groupName: 'Daily Living',
})

const incomeSalary = buildPaymentCategory({
  id: 3,
  name: 'Salary',
  type: 'income',
  groupId: 201,
  groupName: 'Income Core',
})

const transferMove = buildPaymentCategory({
  id: 4,
  name: 'Internal Transfer',
  type: 'transfer',
  groupId: 301,
  groupName: 'Cash Movement',
})

const paymentPayloads: Record<PaymentSubtype, { categories: unknown[]; groups: unknown[]; ungrouped: unknown[] }> = {
  expense: {
    categories: [expenseRent, expenseGroceries],
    groups: [
      buildPaymentGroup({ id: 101, name: 'Housing', subtype: 'expense', categories: [expenseRent] }),
      buildPaymentGroup({ id: 102, name: 'Daily Living', subtype: 'expense', categories: [expenseGroceries] }),
    ],
    ungrouped: [],
  },
  income: {
    categories: [incomeSalary],
    groups: [
      buildPaymentGroup({ id: 201, name: 'Income Core', subtype: 'income', categories: [incomeSalary] }),
    ],
    ungrouped: [],
  },
  transfer: {
    categories: [transferMove],
    groups: [
      buildPaymentGroup({ id: 301, name: 'Cash Movement', subtype: 'transfer', categories: [transferMove] }),
    ],
    ungrouped: [],
  },
}

const receiptHousehold = buildReceiptCategory({
  id: 'receipt-1',
  name: 'Receipt Household',
  groupId: 401,
  groupName: 'Home',
})

const receiptPayload = {
  categories: [receiptHousehold],
  groups: [buildReceiptGroup({ id: 401, name: 'Home', categories: [receiptHousehold] })],
  ungrouped: [],
}

function getCategoryPayload(url: string) {
  if (url.includes('domain=receipt')) return receiptPayload
  const paymentSubtype = new URL(url, 'http://localhost').searchParams.get('paymentSubtype') as PaymentSubtype | null
  return paymentPayloads[paymentSubtype ?? 'expense']
}

function findCategoryRow(name: string) {
  const marker = screen.getByText(name)
  const contentColumn = marker.closest('.min-w-0')
  if (!contentColumn?.parentElement) {
    throw new Error(`Unable to locate category row for ${name}`)
  }
  return contentColumn.parentElement
}

async function openSelect(index: number) {
  await userEvent.click(screen.getAllByRole('combobox')[index])
}

describe('CategoriesPage', () => {
  beforeAll(() => {
    if (!HTMLElement.prototype.hasPointerCapture) {
      Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
        configurable: true,
        value: () => false,
      })
    }
    if (!HTMLElement.prototype.setPointerCapture) {
      Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
        configurable: true,
        value: () => undefined,
      })
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
      Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
        configurable: true,
        value: () => undefined,
      })
    }
    if (!HTMLElement.prototype.scrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: () => undefined,
      })
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    cleanup()
  })

  it('runs live search after debounce without clicking a search button', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/categories?')) {
        return createJsonResponse(getCategoryPayload(url))
      }

      return createJsonResponse({ category: expenseRent })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CategoriesPage />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    const input = screen.getByPlaceholderText('Search categories')
    await userEvent.type(input, 'rent')

    await waitFor(() => {
      const calledWithSearch = fetchMock.mock.calls.some((call) =>
        String(call[0]).includes('search=rent'),
      )
      expect(calledWithSearch).toBe(true)
    }, { timeout: 2000 })
  })

  it('defaults to the Expense tab and removes the All types payment option', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/categories?')) {
        return createJsonResponse(getCategoryPayload(url))
      }

      return createJsonResponse({ category: expenseRent })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CategoriesPage />)

    await waitFor(() => {
      expect(screen.getByText('Rent')).toBeInTheDocument()
    })

    expect(screen.getByRole('tab', { name: 'Expense' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Housing')).toBeInTheDocument()
    expect(screen.queryByText('Salary')).not.toBeInTheDocument()

    const initialLoad = fetchMock.mock.calls.find((call) => String(call[0]).includes('/api/categories?'))
    expect(String(initialLoad?.[0])).toContain('paymentSubtype=expense')

    await openSelect(1)
    expect(screen.getByRole('option', { name: 'Expense' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Income' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Transfer' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'All types' })).not.toBeInTheDocument()
  })

  it('keeps tabs and the payment type dropdown in sync', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/categories?')) {
        return createJsonResponse(getCategoryPayload(url))
      }

      return createJsonResponse({ category: incomeSalary })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CategoriesPage />)

    await waitFor(() => {
      expect(screen.getByText('Rent')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('tab', { name: 'Income' }))

    await waitFor(() => {
      expect(screen.getByText('Salary')).toBeInTheDocument()
      expect(screen.queryByText('Rent')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('tab', { name: 'Income' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('combobox')[1]).toHaveTextContent('Income')

    await openSelect(1)
    await userEvent.click(await screen.findByRole('option', { name: 'Transfer' }))

    await waitFor(() => {
      expect(screen.getByText('Internal Transfer')).toBeInTheDocument()
      expect(screen.queryByText('Salary')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('tab', { name: 'Transfer' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('combobox')[1]).toHaveTextContent('Transfer')
  })

  it('opens view, edit, and merge modal workflows from the active payment tab', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/categories?')) {
        return createJsonResponse(getCategoryPayload(url))
      }

      if (url.includes('/api/categories/payment/1')) {
        return createJsonResponse({
          category: {
            ...expenseRent,
            description: 'Housing expense',
          },
        })
      }

      return createJsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CategoriesPage />)

    await waitFor(() => {
      expect(screen.getByText('Rent')).toBeInTheDocument()
    })

    const rentRow = findCategoryRow('Rent')
    await userEvent.click(within(rentRow).getByRole('button', { name: 'View' }))
    expect(await screen.findByText('Category Details')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    await userEvent.click(within(rentRow).getByRole('button', { name: 'Edit' }))
    expect(await screen.findByText('Edit Category')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await userEvent.click(within(rentRow).getByRole('button', { name: 'Merge' }))
    expect(await screen.findByText('Merge Category')).toBeInTheDocument()
  })

  it('prefills the create group dialog with the active payment tab subtype', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/categories?')) {
        return createJsonResponse(getCategoryPayload(url))
      }

      return createJsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CategoriesPage />)

    await waitFor(() => {
      expect(screen.getByText('Rent')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('tab', { name: 'Transfer' }))

    await waitFor(() => {
      expect(screen.getByText('Internal Transfer')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: 'Create Group' }))

    expect(await screen.findByRole('heading', { name: 'Create Group' })).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getAllByRole('combobox')[0]).toHaveTextContent('Transfer')
  })

  it('keeps the receipt view non-tabbed', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/categories?')) {
        return createJsonResponse(getCategoryPayload(url))
      }

      return createJsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CategoriesPage />)

    await waitFor(() => {
      expect(screen.getByText('Rent')).toBeInTheDocument()
    })

    await openSelect(0)
    await userEvent.click(await screen.findByRole('option', { name: 'Receipt categories' }))

    await waitFor(() => {
      expect(screen.getByText('Receipt Household')).toBeInTheDocument()
    })

    expect(screen.queryByRole('tab', { name: 'Expense' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Income' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Transfer' })).not.toBeInTheDocument()
  })
})
