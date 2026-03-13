import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import AccountsPage from '@/app/(dashboard)/accounts/page'
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

function createSupabaseClientMock(accounts: AccountRecord[]) {
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
            eq: () => ({
              order: async () => ({
                data: accounts,
              }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

interface AccountRecord {
  id: string
  account_type: string
  product_name: string
  nickname: string | null
  identifier_hint: string | null
  currency: string
  is_active: boolean
  institutions: { name: string } | null
  cards: Array<{ card_name: string; card_last4: string; total_outstanding: number | null }> | null
}

describe('AccountsPage', () => {
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
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  it('prefills the edit dialog, keeps account type read-only, and saves account updates', async () => {
    const accounts: AccountRecord[] = [
      {
        id: 'acct-1',
        account_type: 'credit_card',
        product_name: 'Altitude Visa',
        nickname: 'DBS Altitude',
        identifier_hint: '1234',
        currency: 'SGD',
        is_active: true,
        institutions: { name: 'DBS Bank Ltd' },
        cards: [{ card_name: 'Altitude Visa', card_last4: '1234', total_outstanding: 320.5 }],
      },
    ]

    mockedCreateClient.mockReturnValue(createSupabaseClientMock(accounts) as never)

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/accounts/acct-1' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body ?? '{}'))
        accounts[0] = {
          ...accounts[0],
          nickname: body.nickname,
          product_name: body.product_name,
          identifier_hint: body.identifier_hint,
          currency: body.currency,
          is_active: body.is_active,
          institutions: { name: body.institution_name },
          cards: [
            {
              ...accounts[0].cards?.[0],
              card_name: body.card_name,
              card_last4: body.card_last4,
              total_outstanding: 320.5,
            },
          ],
        }

        return createJsonResponse({ account: { id: 'acct-1' } })
      }

      throw new Error(`Unexpected fetch call ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AccountsPage />)

    expect(await screen.findByText('DBS Altitude')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Institution Name')).toHaveValue('DBS Bank Ltd')
    expect(within(dialog).getByLabelText('Product Name')).toHaveValue('Altitude Visa')
    expect(within(dialog).getByLabelText('Nickname')).toHaveValue('DBS Altitude')
    expect(within(dialog).getByLabelText('Identifier Hint')).toHaveValue('1234')
    expect(within(dialog).getByLabelText('Card Name')).toHaveValue('Altitude Visa')
    expect(within(dialog).getByLabelText('Card Last 4')).toHaveValue('1234')
    expect(within(dialog).getByLabelText('Account Type')).toHaveValue('Credit Card')
    expect(within(dialog).getByLabelText('Account Type')).toHaveAttribute('readonly')

    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Inactive' }))

    const nicknameInput = within(dialog).getByLabelText('Nickname')
    await userEvent.clear(nicknameInput)
    await userEvent.type(nicknameInput, 'Travel Card')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find((call) => String(call[0]) === '/api/accounts/acct-1')
      expect(patchCall).toBeTruthy()
      expect(patchCall?.[1]?.method).toBe('PATCH')

      const payload = JSON.parse(String(patchCall?.[1]?.body ?? '{}'))
      expect(payload).toMatchObject({
        institution_name: 'DBS Bank Ltd',
        product_name: 'Altitude Visa',
        nickname: 'Travel Card',
        identifier_hint: '1234',
        currency: 'SGD',
        is_active: false,
        card_name: 'Altitude Visa',
        card_last4: '1234',
      })
    })

    expect(await screen.findByText('Travel Card')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('Account updated.')
  })
})
