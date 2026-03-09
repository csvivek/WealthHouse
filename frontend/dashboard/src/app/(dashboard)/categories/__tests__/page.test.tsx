import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CategoriesPage from '@/app/(dashboard)/categories/page'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

function createJsonResponse(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => payload,
  } as Response
}

describe('CategoriesPage', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    cleanup()
  })

  it('runs live search after debounce without clicking a search button', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/categories?')) {
        return createJsonResponse({
          categories: [
            {
              id: 1,
              name: 'Salary',
              type: 'income',
              status: 'active',
              mappedCount: 3,
              icon_key: 'salary',
              color_token: 'chart-1',
              color_hex: null,
            },
          ],
        })
      }

      return createJsonResponse({ category: { id: 1, name: 'Salary', type: 'income' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CategoriesPage />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    const input = screen.getByPlaceholderText('Search categories')
    await userEvent.type(input, 'sal')

    await waitFor(() => {
      const calledWithSearch = fetchMock.mock.calls.some((call) =>
        String(call[0]).includes('search=sal'),
      )
      expect(calledWithSearch).toBe(true)
    }, { timeout: 2000 })
  })

  it('renders payment categories grouped in Income -> Expense -> Transfer order', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      createJsonResponse({
        categories: [
          { id: 11, name: 'Dining', type: 'expense', status: 'active', mappedCount: 1, icon_key: 'food', color_token: 'chart-2', color_hex: null },
          { id: 12, name: 'Salary', type: 'income', status: 'active', mappedCount: 2, icon_key: 'salary', color_token: 'chart-1', color_hex: null },
          { id: 13, name: 'Transfer Out', type: 'transfer', status: 'active', mappedCount: 0, icon_key: 'transfer', color_token: 'chart-3', color_hex: null },
        ],
      }),
    ))

    const { container } = render(<CategoriesPage />)
    await waitFor(() => {
      expect(screen.getByText('Salary')).toBeInTheDocument()
    })

    const text = container.textContent ?? ''
    const incomeIndex = text.indexOf('Income')
    const expenseIndex = text.indexOf('Expense')
    const transferIndex = text.indexOf('Transfer')

    expect(incomeIndex).toBeGreaterThan(-1)
    expect(expenseIndex).toBeGreaterThan(incomeIndex)
    expect(transferIndex).toBeGreaterThan(expenseIndex)
  })

  it('opens view, edit, and merge modal workflows', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/categories?')) {
        return createJsonResponse({
          categories: [
            {
              id: 1,
              name: 'Salary',
              type: 'income',
              status: 'active',
              mappedCount: 3,
              icon_key: 'salary',
              color_token: 'chart-1',
              color_hex: null,
              created_at: '2026-01-01',
              updated_at: '2026-01-02',
            },
          ],
        })
      }

      if (url.includes('/api/categories/payment/1')) {
        return createJsonResponse({
          category: {
            id: 1,
            name: 'Salary',
            type: 'income',
            status: 'active',
            mappedCount: 3,
            icon_key: 'salary',
            color_token: 'chart-1',
            color_hex: null,
            created_at: '2026-01-01',
            updated_at: '2026-01-02',
            description: 'Income category',
          },
        })
      }

      return createJsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CategoriesPage />)
    await waitFor(() => {
      expect(screen.getByText('Salary')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(await screen.findByText('Category Details')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(await screen.findByText('Edit Category')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await userEvent.click(screen.getByRole('button', { name: 'Merge' }))
    expect(await screen.findByText('Merge Category')).toBeInTheDocument()
  })
})
