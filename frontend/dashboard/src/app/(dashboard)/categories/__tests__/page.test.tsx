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
  mappedCount,
}: {
  id: number
  name: string
  type: PaymentSubtype
  groupId: number
  groupName: string
  mappedCount: number
}) {
  return {
    id,
    name,
    type,
    status: 'active' as const,
    mappedCount,
    icon_key: type === 'income' ? 'salary' : type === 'transfer' ? 'transfer' : 'home',
    color_token: type === 'income' ? 'chart-2' : type === 'transfer' ? 'chart-3' : 'chart-1',
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
  categories: Array<ReturnType<typeof buildPaymentCategory>>
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
  mappedCount,
}: {
  id: string
  name: string
  groupId: number
  groupName: string
  mappedCount: number
}) {
  return {
    id,
    name,
    type: 'essentials',
    status: 'active' as const,
    mappedCount,
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
  categories: Array<ReturnType<typeof buildReceiptCategory>>
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
  mappedCount: 2,
})

const expenseGroceries = buildPaymentCategory({
  id: 2,
  name: 'Groceries',
  type: 'expense',
  groupId: 102,
  groupName: 'Daily Living',
  mappedCount: 0,
})

const incomeSalary = buildPaymentCategory({
  id: 3,
  name: 'Salary',
  type: 'income',
  groupId: 201,
  groupName: 'Income Core',
  mappedCount: 5,
})

const transferMove = buildPaymentCategory({
  id: 4,
  name: 'Internal Transfer',
  type: 'transfer',
  groupId: 301,
  groupName: 'Cash Movement',
  mappedCount: 0,
})

const paymentPayload = {
  categories: [expenseRent, expenseGroceries, incomeSalary, transferMove],
  groups: [
    buildPaymentGroup({ id: 101, name: 'Housing', subtype: 'expense', categories: [expenseRent] }),
    buildPaymentGroup({ id: 102, name: 'Daily Living', subtype: 'expense', categories: [expenseGroceries] }),
    buildPaymentGroup({ id: 201, name: 'Income Core', subtype: 'income', categories: [incomeSalary] }),
    buildPaymentGroup({ id: 301, name: 'Cash Movement', subtype: 'transfer', categories: [transferMove] }),
  ],
  ungrouped: [],
}

const receiptHousehold = buildReceiptCategory({
  id: 'receipt-1',
  name: 'Receipt Household',
  groupId: 401,
  groupName: 'Home',
  mappedCount: 1,
})

const receiptPayload = {
  categories: [receiptHousehold],
  groups: [buildReceiptGroup({ id: 401, name: 'Home', categories: [receiptHousehold] })],
  ungrouped: [],
}

function getCategoryPayload(url: string) {
  if (url.includes('domain=receipt')) return receiptPayload
  return paymentPayload
}

async function openDomainSelect() {
  await userEvent.click(screen.getAllByRole('combobox')[0])
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
    if (!globalThis.ResizeObserver) {
      Object.defineProperty(globalThis, 'ResizeObserver', {
        configurable: true,
        value: class ResizeObserver {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      })
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  it('renders the redesigned controls and removes the old top-level filters', async () => {
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

    expect(screen.getByRole('combobox')).toHaveTextContent('Payment categories')
    expect(screen.getByRole('tab', { name: 'Expense' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Income' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Transfer' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/search categories/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Group' })).toBeInTheDocument()
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(screen.queryByText('All status')).not.toBeInTheDocument()
  })

  it('keeps summary cards scoped to the selected domain, not tabs or search', async () => {
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

    expect(screen.getByTestId('stat-total-groups-value')).toHaveTextContent('4')
    expect(screen.getByTestId('stat-total-categories-value')).toHaveTextContent('4')
    expect(screen.getByTestId('stat-mapped-value')).toHaveTextContent('2')
    expect(screen.getByTestId('stat-unmapped-value')).toHaveTextContent('2')

    await userEvent.click(screen.getByRole('tab', { name: 'Income' }))

    await waitFor(() => {
      expect(screen.getByText('Salary')).toBeInTheDocument()
      expect(screen.queryByText('Rent')).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('stat-total-groups-value')).toHaveTextContent('4')
    expect(screen.getByTestId('stat-total-categories-value')).toHaveTextContent('4')
    expect(screen.getByTestId('stat-mapped-value')).toHaveTextContent('2')
    expect(screen.getByTestId('stat-unmapped-value')).toHaveTextContent('2')

    await userEvent.type(screen.getByPlaceholderText(/search categories/i), 'sal')

    await waitFor(() => {
      expect(screen.getByText('Salary')).toBeInTheDocument()
      expect(screen.queryByText('Internal Transfer')).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('stat-total-groups-value')).toHaveTextContent('4')
    expect(screen.getByTestId('stat-total-categories-value')).toHaveTextContent('4')
    expect(screen.getByTestId('stat-mapped-value')).toHaveTextContent('2')
    expect(screen.getByTestId('stat-unmapped-value')).toHaveTextContent('2')
  })

  it('filters the visible payment list with subtype tabs and local search', async () => {
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
      expect(screen.getByText('Groceries')).toBeInTheDocument()
    })

    expect(screen.queryByText('Salary')).not.toBeInTheDocument()

    const searchInput = screen.getByPlaceholderText(/search categories/i)
    await userEvent.type(searchInput, 'rent')

    await waitFor(() => {
      expect(screen.getByText('Rent')).toBeInTheDocument()
      expect(screen.queryByText('Groceries')).not.toBeInTheDocument()
    })

    await userEvent.clear(searchInput)

    await waitFor(() => {
      expect(screen.getByText('Groceries')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('tab', { name: 'Transfer' }))

    await waitFor(() => {
      expect(screen.getByText('Internal Transfer')).toBeInTheDocument()
      expect(screen.queryByText('Rent')).not.toBeInTheDocument()
    })
  })

  it('opens the redesigned primary and overflow actions for categories and groups', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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

      if (url.includes('/api/category-groups/payment/101') && init?.method === 'PATCH') {
        return createJsonResponse({ success: true })
      }

      return createJsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CategoriesPage />)

    await waitFor(() => {
      expect(screen.getByText('Rent')).toBeInTheDocument()
    })

    const rentRow = screen.getByTestId('category-row-1')
    expect(within(rentRow).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(within(rentRow).getByRole('button', { name: 'Merge' })).toBeInTheDocument()
    expect(within(rentRow).getByRole('button', { name: 'Remove' })).toBeInTheDocument()
    expect(within(rentRow).getByRole('button', { name: 'More actions for Rent' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move' })).not.toBeInTheDocument()

    await userEvent.click(within(rentRow).getByRole('button', { name: 'Edit' }))
    expect(await screen.findByRole('heading', { name: 'Edit Category' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await userEvent.click(within(rentRow).getByRole('button', { name: 'Merge' }))
    expect(await screen.findByRole('heading', { name: 'Merge Category' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await userEvent.click(within(rentRow).getByRole('button', { name: 'More actions for Rent' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'View details' }))
    expect(await screen.findByRole('heading', { name: 'Category Details' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    await userEvent.click(within(rentRow).getByRole('button', { name: 'More actions for Rent' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Move category' }))
    expect(await screen.findByRole('heading', { name: 'Move Category' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    const housingGroup = screen.getByTestId('group-card-101')
    expect(within(housingGroup).getByRole('button', { name: 'Add' })).toBeInTheDocument()
    expect(within(housingGroup).getByRole('button', { name: 'Rename' })).toBeInTheDocument()
    expect(within(housingGroup).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(within(housingGroup).getByRole('button', { name: 'More actions for group Housing' })).toBeInTheDocument()

    await userEvent.click(within(housingGroup).getByRole('button', { name: 'Rename' }))
    expect(await screen.findByRole('heading', { name: 'Edit Group' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await userEvent.click(within(housingGroup).getByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('heading', { name: 'Create Category' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await userEvent.click(within(housingGroup).getByRole('button', { name: 'More actions for group Housing' }))
    expect(await screen.findByRole('menuitem', { name: 'Archive group' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive group' }))

    await waitFor(() => {
      const archiveCall = fetchMock.mock.calls.find((call) =>
        String(call[0]).includes('/api/category-groups/payment/101') && (call[1] as RequestInit | undefined)?.method === 'PATCH',
      )
      expect(archiveCall).toBeTruthy()
    })
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

  it('keeps receipt mode non-tabbed and updates the summary cards by domain', async () => {
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

    await openDomainSelect()
    await userEvent.click(await screen.findByRole('option', { name: 'Receipt categories' }))

    await waitFor(() => {
      expect(screen.getByText('Receipt Household')).toBeInTheDocument()
    })

    expect(screen.queryByRole('tab', { name: 'Expense' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Income' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Transfer' })).not.toBeInTheDocument()
    expect(screen.getByTestId('stat-total-groups-value')).toHaveTextContent('1')
    expect(screen.getByTestId('stat-total-categories-value')).toHaveTextContent('1')
    expect(screen.getByTestId('stat-mapped-value')).toHaveTextContent('1')
    expect(screen.getByTestId('stat-unmapped-value')).toHaveTextContent('0')
  })
})
