import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import ReviewPage from '@/app/(dashboard)/statements/review/[importId]/page'
import { toast } from 'sonner'

const mockedRouterPush = vi.fn()

vi.mock('next/navigation', () => ({
  useParams: () => ({ importId: 'import-1' }),
  useRouter: () => ({ push: mockedRouterPush }),
}))

vi.mock('@/lib/statement-commit-jobs', () => ({
  useStatementCommitJobs: () => ({
    jobs: [],
    trackJob: vi.fn(),
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/components/ui/select', () => {
  const SelectItem = Object.assign(
    ({ children }: { value: string; children: React.ReactNode }) => <>{children}</>,
    { __mockSelectItem: true },
  )

  function readText(node: React.ReactNode): string {
    if (node == null || typeof node === 'boolean') return ''
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(readText).join('')
    if (!React.isValidElement(node)) return ''
    return readText((node.props as { children?: React.ReactNode }).children)
  }

  function collectItems(children: React.ReactNode): Array<{ value: string; label: string }> {
    const items: Array<{ value: string; label: string }> = []

    const visit = (node: React.ReactNode) => {
      if (!node) return
      if (Array.isArray(node)) {
        node.forEach(visit)
        return
      }
      if (!React.isValidElement(node)) return

      const element = node as React.ReactElement<{ value?: string; children?: React.ReactNode }>
      const type = element.type as { __mockSelectItem?: boolean }
      if (type.__mockSelectItem) {
        items.push({ value: String(element.props.value), label: readText(element.props.children) })
        return
      }

      visit(element.props.children)
    }

    visit(children)
    return items
  }

  function Select({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (value: string) => void
    children: React.ReactNode
  }) {
    const items = collectItems(children)

    return (
      <select role="combobox" value={value} onChange={(event) => onValueChange(event.target.value)}>
        {items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    )
  }

  return {
    Select,
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectItem,
    SelectGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectLabel: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectSeparator: () => null,
  }
})

function createJsonResponse(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => payload,
  } as Response
}

function createReviewPayload() {
  return {
    import: {
      id: 'import-1',
      status: 'in_review',
      fileName: 'dbs-march.pdf',
      institutionCode: 'dbs',
      institutionName: 'DBS Bank',
      parsedAccountType: 'credit_card',
      parsedProductName: 'Altitude Card',
      parsedIdentifierHint: null,
      parsedCardName: 'Altitude Card',
      parsedCardLast4: '4242',
      matchedAccountLabel: 'DBS Altitude',
      statementDate: '2026-03-01',
      period: { start: '2026-02-01', end: '2026-02-28' },
      summary: null,
      cardInfo: null,
      currency: 'SGD',
      createdAt: '2026-03-15T00:00:00.000Z',
      uploadedBy: {
        id: 'user-1',
        displayName: 'VP',
        email: 'vp@example.com',
      },
      hasCommittedVersion: false,
      isRevision: false,
      canReopen: false,
    },
    accounts: [
      {
        id: 'acct-1',
        label: 'DBS Altitude',
        accountType: 'credit_card',
        institutionName: 'DBS Bank',
        productName: 'Altitude Card',
        nickname: null,
      },
    ],
    categories: [
      { id: 1, name: 'Groceries', type: 'expense', group_name: 'Living' },
      { id: 2, name: 'Dining', type: 'expense', group_name: 'Lifestyle' },
      { id: 3, name: 'Investments', type: 'income', group_name: 'Income' },
      { id: 4, name: 'Travel', type: 'expense', group_name: 'Lifestyle' },
    ],
    stats: {
      total: 4,
      pending: 3,
      approved: 1,
      rejected: 0,
      committed: 0,
      alreadyImported: 0,
      duplicates: 0,
      debitTotal: 114.7,
      creditTotal: 1800,
    },
    tags: [],
    rows: [
      {
        id: 'row-1',
        rowIndex: 0,
        reviewStatus: 'pending',
        duplicateStatus: 'none',
        flagStatus: 'none',
        duplicateTransactionId: null,
        committedTransactionId: null,
        isEdited: false,
        txnDate: '2026-03-10',
        postingDate: null,
        merchantRaw: 'Cold Storage',
        description: null,
        amount: 62.4,
        txnType: 'debit',
        currency: 'SGD',
        reference: null,
        originalAmount: null,
        originalCurrency: null,
        originalData: {},
        reviewNote: null,
        accountLabel: 'DBS Altitude',
        categoryId: 1,
        categoryName: 'Groceries',
        categoryConfidence: 0.96,
        categoryDecisionSource: 'manual_override',
        tagIds: [],
        tagSuggestions: [],
        merchantCanonicalName: null,
        merchantBusinessType: null,
        merchantAliases: [],
        similarMerchantKey: null,
        similarMerchantCount: 0,
        similarMerchantExamples: [],
        searchSummary: null,
        links: [],
      },
      {
        id: 'row-2',
        rowIndex: 1,
        reviewStatus: 'pending',
        duplicateStatus: 'none',
        flagStatus: 'none',
        duplicateTransactionId: null,
        committedTransactionId: null,
        isEdited: false,
        txnDate: '2026-03-11',
        postingDate: null,
        merchantRaw: 'Tim Ho Wan',
        description: null,
        amount: 18.9,
        txnType: 'debit',
        currency: 'SGD',
        reference: null,
        originalAmount: null,
        originalCurrency: null,
        originalData: {},
        reviewNote: null,
        accountLabel: 'DBS Altitude',
        categoryId: 2,
        categoryName: 'Dining',
        categoryConfidence: 0.88,
        categoryDecisionSource: 'manual_override',
        tagIds: [],
        tagSuggestions: [],
        merchantCanonicalName: null,
        merchantBusinessType: null,
        merchantAliases: [],
        similarMerchantKey: null,
        similarMerchantCount: 0,
        similarMerchantExamples: [],
        searchSummary: null,
        links: [],
      },
      {
        id: 'row-3',
        rowIndex: 2,
        reviewStatus: 'approved',
        duplicateStatus: 'none',
        flagStatus: 'none',
        duplicateTransactionId: null,
        committedTransactionId: null,
        isEdited: false,
        txnDate: '2026-03-12',
        postingDate: null,
        merchantRaw: 'Bonus Brokerage',
        description: null,
        amount: 1800,
        txnType: 'credit',
        currency: 'SGD',
        reference: null,
        originalAmount: null,
        originalCurrency: null,
        originalData: {},
        reviewNote: null,
        accountLabel: 'DBS Altitude',
        categoryId: 3,
        categoryName: 'Investments',
        categoryConfidence: 0.91,
        categoryDecisionSource: 'manual_override',
        tagIds: [],
        tagSuggestions: [],
        merchantCanonicalName: null,
        merchantBusinessType: null,
        merchantAliases: [],
        similarMerchantKey: null,
        similarMerchantCount: 0,
        similarMerchantExamples: [],
        searchSummary: null,
        links: [],
      },
      {
        id: 'row-4',
        rowIndex: 3,
        reviewStatus: 'pending',
        duplicateStatus: 'none',
        flagStatus: 'none',
        duplicateTransactionId: null,
        committedTransactionId: null,
        isEdited: false,
        txnDate: '2026-03-13',
        postingDate: null,
        merchantRaw: 'Mystery Charge',
        description: null,
        amount: 33.4,
        txnType: 'debit',
        currency: 'SGD',
        reference: null,
        originalAmount: null,
        originalCurrency: null,
        originalData: {},
        reviewNote: null,
        accountLabel: 'DBS Altitude',
        categoryId: null,
        categoryName: null,
        categoryConfidence: null,
        categoryDecisionSource: null,
        tagIds: [],
        tagSuggestions: [],
        merchantCanonicalName: null,
        merchantBusinessType: null,
        merchantAliases: [],
        similarMerchantKey: null,
        similarMerchantCount: 0,
        similarMerchantExamples: [],
        searchSummary: null,
        links: [],
      },
    ],
  }
}

describe('Statement review category filter', () => {
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
  })

  afterEach(() => {
    mockedRouterPush.mockReset()
    vi.restoreAllMocks()
    cleanup()
  })

  it('renders dataset-scoped category options and filters the visible rows', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/ai/statement/import-1') {
        return createJsonResponse(createReviewPayload())
      }

      throw new Error(`Unexpected fetch: ${String(input)}`)
    }))

    render(<ReviewPage />)

    expect(await screen.findByText('Cold Storage')).toBeInTheDocument()

    const [, categorySelect] = screen.getAllByRole('combobox')

    expect(within(categorySelect).getByRole('option', { name: 'All Categories' })).toBeInTheDocument()
    expect(within(categorySelect).getByRole('option', { name: 'Uncategorized' })).toBeInTheDocument()
    expect(within(categorySelect).getByRole('option', { name: 'Dining' })).toBeInTheDocument()
    expect(within(categorySelect).getByRole('option', { name: 'Groceries' })).toBeInTheDocument()
    expect(within(categorySelect).getByRole('option', { name: 'Investments' })).toBeInTheDocument()
    expect(within(categorySelect).queryByRole('option', { name: 'Travel' })).not.toBeInTheDocument()

    fireEvent.change(categorySelect, { target: { value: '1' } })

    expect(screen.getByText('Cold Storage')).toBeInTheDocument()
    expect(screen.queryByText('Tim Ho Wan')).not.toBeInTheDocument()
    expect(screen.queryByText('Bonus Brokerage')).not.toBeInTheDocument()
    expect(screen.queryByText('Mystery Charge')).not.toBeInTheDocument()
  })

  it('reconciles an invalid category selection when the status scope changes', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/ai/statement/import-1') {
        return createJsonResponse(createReviewPayload())
      }

      throw new Error(`Unexpected fetch: ${String(input)}`)
    }))

    render(<ReviewPage />)

    expect(await screen.findByText('Cold Storage')).toBeInTheDocument()

    const [statusSelect, categorySelect] = screen.getAllByRole('combobox')

    fireEvent.change(categorySelect, { target: { value: '3' } })
    expect(screen.getByText('Bonus Brokerage')).toBeInTheDocument()
    expect(screen.queryByText('Cold Storage')).not.toBeInTheDocument()

    fireEvent.change(statusSelect, { target: { value: 'pending' } })

    await waitFor(() => {
      expect((screen.getAllByRole('combobox')[1] as HTMLSelectElement).value).toBe('all')
    })

    const nextCategorySelect = screen.getAllByRole('combobox')[1]

    expect(within(nextCategorySelect).queryByRole('option', { name: 'Investments' })).not.toBeInTheDocument()
    expect(screen.getByText('Cold Storage')).toBeInTheDocument()
    expect(screen.getByText('Tim Ho Wan')).toBeInTheDocument()
    expect(screen.getByText('Mystery Charge')).toBeInTheDocument()
    expect(screen.queryByText('Bonus Brokerage')).not.toBeInTheDocument()
  })

  it('requires a verified-brand choice before rerouting into a newly created account', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === '/api/ai/statement/import-1') {
        return createJsonResponse(createReviewPayload())
      }

      if (url.startsWith('/api/institutions/brand-preview?')) {
        return createJsonResponse({
          matched: true,
          brandCode: 'dbs_bank',
          canonicalName: 'DBS Bank Ltd',
          websiteUrl: 'https://www.dbs.com/',
          iconUrl: 'https://www.dbs.com/favicon.ico',
        })
      }

      if (url === '/api/ai/statement/import-1/reroute' && init?.method === 'POST') {
        return createJsonResponse({
          reviewUrl: '/statements/review/import-1',
          duplicateCount: 0,
        })
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ReviewPage />)

    await screen.findByText('Cold Storage')
    fireEvent.click(screen.getByRole('button', { name: 'Reroute Account' }))

    const dialog = await screen.findByRole('dialog')
    const dialogSelects = within(dialog).getAllByRole('combobox')
    fireEvent.change(dialogSelects[0], { target: { value: 'create' } })

    expect(await within(dialog).findByText('DBS Bank Ltd')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply Reroute' }))
    expect(toast.error).toHaveBeenCalledWith('Choose whether to use the verified institution brand before creating the reroute account.')
    expect(fetchMock.mock.calls.some((call) => String(call[0]) === '/api/ai/statement/import-1/reroute')).toBe(false)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Use verified brand' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply Reroute' }))

    await waitFor(() => {
      const rerouteCall = fetchMock.mock.calls.find((call) => String(call[0]) === '/api/ai/statement/import-1/reroute')
      expect(rerouteCall).toBeTruthy()
      const payload = JSON.parse(String(rerouteCall?.[1]?.body ?? '{}'))
      expect(payload).toEqual({
        createAccount: expect.objectContaining({
          institution_name: 'DBS Bank Ltd',
          institution_brand_code: 'dbs_bank',
          institution_brand_decision: 'verified',
        }),
      })
    })
  })

  it('deletes the import and returns to the statements list', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === '/api/ai/statement/import-1' && !init) {
        return createJsonResponse(createReviewPayload())
      }

      if (url === '/api/ai/statement/import-1' && init?.method === 'DELETE') {
        return createJsonResponse({
          deleted: true,
          importId: 'import-1',
          fileName: 'dbs-march.pdf',
        })
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<ReviewPage />)

    await screen.findByText('Cold Storage')
    fireEvent.click(screen.getByRole('button', { name: 'Delete Import' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/ai/statement/import-1', { method: 'DELETE' })
    })
    expect(toast.success).toHaveBeenCalledWith('dbs-march.pdf deleted')
    expect(mockedRouterPush).toHaveBeenCalledWith('/statements')
  })
})
