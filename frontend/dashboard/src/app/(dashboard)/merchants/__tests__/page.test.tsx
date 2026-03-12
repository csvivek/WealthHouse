import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import MerchantsPage from '@/app/(dashboard)/merchants/page'

function createJsonResponse(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => payload,
  } as Response
}

describe('MerchantsPage', () => {
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
    vi.restoreAllMocks()
    cleanup()
  })

  it('shows an empty state when no merchants are returned', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => createJsonResponse({ merchants: [] })))

    render(<MerchantsPage />)

    expect(await screen.findByText('No merchants yet')).toBeInTheDocument()
  })

  it('shows schema guidance when merchant migrations are not applied', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        createJsonResponse(
          {
            error: 'Merchant management schema is not deployed in this Supabase environment.',
            action: 'Run migration `016_merchant_management.sql` so table `public.merchants` exists.',
          },
          false,
          503,
        ),
      ),
    )

    render(<MerchantsPage />)

    expect(await screen.findByText('Merchant schema not ready')).toBeInTheDocument()
    expect(screen.getByText(/016_merchant_management\.sql/)).toBeInTheDocument()
  })

  it('runs debounced search and shows aliases in the detail dialog', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/merchants?')) {
        return createJsonResponse({
          merchants: [
            {
              id: 'merchant-1',
              household_id: 'hh-1',
              name: 'Starbucks',
              normalized_name: 'starbucks',
              icon_key: 'coffee',
              color_token: 'chart-2',
              color_hex: null,
              notes: null,
              is_active: true,
              merged_into_merchant_id: null,
              created_at: '2026-03-11T00:00:00.000Z',
              updated_at: '2026-03-11T00:00:00.000Z',
              alias_count: 2,
              transaction_count: 3,
              receipt_count: 1,
              ledger_entry_count: 0,
              total_spend: 23.4,
            },
          ],
        })
      }

      return createJsonResponse({
        merchant: {
          id: 'merchant-1',
          household_id: 'hh-1',
          name: 'Starbucks',
          normalized_name: 'starbucks',
          icon_key: 'coffee',
          color_token: 'chart-2',
          color_hex: null,
          notes: null,
          is_active: true,
          merged_into_merchant_id: null,
          created_at: '2026-03-11T00:00:00.000Z',
          updated_at: '2026-03-11T00:00:00.000Z',
          alias_count: 2,
          transaction_count: 3,
          receipt_count: 1,
          ledger_entry_count: 0,
          total_spend: 23.4,
          aliases: [
            {
              id: 'alias-1',
              merchant_id: 'merchant-1',
              raw_name: 'STARBUCKS - Plaza Sing',
              normalized_raw_name: 'starbucks',
              source_type: 'statement',
              confidence: null,
              created_at: '2026-03-11T00:00:00.000Z',
              updated_at: '2026-03-11T00:00:00.000Z',
            },
          ],
        },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<MerchantsPage />)

    expect(await screen.findByText('Starbucks')).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText('Search merchants or aliases'), 'star')

    await waitFor(() => {
      const calledWithSearch = fetchMock.mock.calls.some((call) => String(call[0]).includes('search=star'))
      expect(calledWithSearch).toBe(true)
    })

    await userEvent.click(await screen.findByRole('button', { name: 'View' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('STARBUCKS - Plaza Sing')).toBeInTheDocument()
  })

  it('saves edits and supports a merge preview workflow', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/api/merchants?')) {
        return createJsonResponse({
          merchants: [
            {
              id: 'merchant-1',
              household_id: 'hh-1',
              name: 'Starbucks',
              normalized_name: 'starbucks',
              icon_key: 'coffee',
              color_token: 'chart-2',
              color_hex: null,
              notes: null,
              is_active: true,
              merged_into_merchant_id: null,
              created_at: '2026-03-11T00:00:00.000Z',
              updated_at: '2026-03-11T00:00:00.000Z',
              alias_count: 1,
              transaction_count: 2,
              receipt_count: 0,
              ledger_entry_count: 0,
              total_spend: 20,
            },
            {
              id: 'merchant-2',
              household_id: 'hh-1',
              name: 'Starbucks SG',
              normalized_name: 'starbucks sg',
              icon_key: 'coffee',
              color_token: 'chart-2',
              color_hex: null,
              notes: null,
              is_active: true,
              merged_into_merchant_id: null,
              created_at: '2026-03-11T00:00:00.000Z',
              updated_at: '2026-03-11T00:00:00.000Z',
              alias_count: 1,
              transaction_count: 1,
              receipt_count: 1,
              ledger_entry_count: 0,
              total_spend: 10,
            },
          ],
        })
      }

      if (url.includes('/api/merchants/merchant-1') && init?.method === 'PATCH') {
        return createJsonResponse({ merchant: { id: 'merchant-1' } })
      }

      if (url.includes('/api/merchants/merchant-1/merge') && init?.method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'))
        if (body.preview) {
          return createJsonResponse({
            preview: {
              survivorId: 'merchant-1',
              victimIds: ['merchant-2'],
              impact: {
                aliases: 1,
                statementTransactions: 1,
                receipts: 1,
                ledgerEntries: 0,
                receiptKnowledge: 0,
                categorizationAudits: 0,
                groceryPurchases: 0,
                total: 3,
              },
            },
          })
        }

        return createJsonResponse({ success: true, survivorId: 'merchant-1', victimIds: ['merchant-2'], results: [] })
      }

      return createJsonResponse({ merchant: { id: 'merchant-1' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<MerchantsPage />)

    expect(await screen.findByText('Starbucks')).toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    const editDialog = await screen.findByRole('dialog')
    const nameInput = within(editDialog).getByPlaceholderText("McDonald's")
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Starbucks Coffee')
    await userEvent.click(within(editDialog).getByRole('button', { name: 'Save Merchant' }))

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/api/merchants/merchant-1') && call[1]?.method === 'PATCH')
      expect(patchCall).toBeTruthy()
      expect(JSON.parse(String(patchCall?.[1]?.body ?? '{}')).name).toBe('Starbucks Coffee')
    })

    const checkboxes = screen.getAllByRole('checkbox')
    await userEvent.click(checkboxes[1])
    await userEvent.click(checkboxes[2])
    await userEvent.click(screen.getByRole('button', { name: 'Merge Selected' }))

    expect(await screen.findByText('Merge Preview')).toBeInTheDocument()

    await waitFor(() => {
      const previewCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/api/merchants/merchant-1/merge') && call[1]?.method === 'POST' && String(call[1]?.body).includes('"preview":true'))
      expect(previewCall).toBeTruthy()
    })
  })
})
