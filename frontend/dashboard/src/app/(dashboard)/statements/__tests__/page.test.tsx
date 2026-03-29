import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import StatementsPage from '@/app/(dashboard)/statements/page'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

const mockedRouterPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockedRouterPush,
  }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/statement-commit-jobs', () => ({
  useStatementCommitJobs: () => ({
    hasActiveJobs: false,
  }),
}))

const mockedTrackIngestionJob = vi.fn()
const statementIngestionState = {
  jobs: [] as Array<Record<string, unknown>>,
  hasActiveJobs: false,
  trackJob: mockedTrackIngestionJob,
}

vi.mock('@/lib/statement-ingestion-jobs', () => ({
  useStatementIngestionJobs: () => statementIngestionState,
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

function createSupabaseClientMock() {
  const imports = [
    {
      id: 'import-1',
      file_name: 'owner-statement.pdf',
      uploaded_by: 'user-1',
      statement_upload_id: 'upload-1',
      storage_bucket: 'statements',
      storage_path: 'households/hh-1/statements/import-1/owner-statement.pdf',
      institution_code: 'dbs',
      raw_parse_result: {
        institution_name: 'DBS Bank Ltd',
        account: { account_type: 'credit_card' },
        matched_accounts: [{ label: 'DBS Bank Ltd — Altitude Card' }],
      },
      status: 'in_review',
      total_rows: 10,
      approved_rows: 7,
      rejected_rows: 0,
      duplicate_rows: 0,
      committed_rows: 7,
      statement_period_start: '2026-02-01',
      statement_period_end: '2026-02-28',
      created_at: '2026-03-12T00:00:00.000Z',
    },
    {
      id: 'import-2',
      file_name: 'alex-statement.pdf',
      uploaded_by: 'user-2',
      statement_upload_id: null,
      storage_bucket: null,
      storage_path: null,
      institution_code: 'ocbc',
      raw_parse_result: {
        institution_name: 'OCBC Bank',
        account: { account_type: 'savings' },
        matched_accounts: [{ label: 'OCBC Bank — 360 Account' }],
      },
      status: 'committed',
      total_rows: 12,
      approved_rows: 12,
      rejected_rows: 0,
      duplicate_rows: 1,
      committed_rows: 11,
      statement_period_start: '2026-01-01',
      statement_period_end: '2026-01-31',
      created_at: '2026-03-10T00:00:00.000Z',
    },
  ]

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
              eq: () => ({
                order: async () => ({
                  data: [],
                }),
              }),
            }),
          }),
        }
      }

      if (table === 'file_imports') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({
                  data: imports,
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

describe('StatementsPage', () => {
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

  beforeEach(() => {
    mockedCreateClient.mockReset()
    mockedCreateClient.mockReturnValue(createSupabaseClientMock() as never)
    mockedRouterPush.mockReset()
    mockedTrackIngestionJob.mockReset()
    statementIngestionState.jobs = []
    statementIngestionState.hasActiveJobs = false
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  it('shows uploader attribution and filters import history by uploader', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => createJsonResponse({
      profiles: [
        { id: 'user-1', display_name: 'Owner User', email: 'owner@example.com' },
        { id: 'user-2', display_name: 'Alex Example', email: 'alex@example.com' },
      ],
    })))

    render(<StatementsPage />)

    expect(await screen.findByText('owner-statement.pdf')).toBeInTheDocument()
    expect(screen.getByText('alex-statement.pdf')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Statement' })).toHaveAttribute(
      'href',
      '/api/ai/statement/import-1/file',
    )
    expect(screen.getAllByRole('link', { name: 'Open Statement' })).toHaveLength(1)
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Alex Example')).toBeInTheDocument()

    const [, uploaderCombobox] = screen.getAllByRole('combobox')
    await userEvent.click(uploaderCombobox)
    await userEvent.click(screen.getByRole('option', { name: 'Alex Example' }))

    await waitFor(() => {
      expect(screen.queryByText('owner-statement.pdf')).not.toBeInTheDocument()
    })
    expect(screen.getByText('alex-statement.pdf')).toBeInTheDocument()
  })

  it('requires a verified-brand choice before continuing a recovery import', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === '/api/household/profiles') {
        return createJsonResponse({ profiles: [] })
      }

      if (url === '/api/ai/statement/parse-session/session-1') {
        return createJsonResponse({
          parseSessionId: 'session-1',
          statementUploadId: 'upload-1',
          fileName: 'statement.pdf',
          status: 'needs_account_resolution',
          unmatchedAccountDescriptors: [
            {
              descriptorKey: 'dbs-1',
              label: 'DBS — Altitude Card',
              transactionCount: 1,
              sampleRowIndexes: [0],
              institution_name: 'DBS',
              institution_code: 'dbs_bank',
              account_type: 'credit_card',
              product_name: 'Altitude Card',
              identifier_hint: '4242',
              card_name: 'Altitude Card',
              card_last4: '4242',
              currency: 'SGD',
              suggestedExistingAccountId: null,
              suggestedExistingAccountLabel: null,
              suggestedScore: null,
            },
          ],
          suggestedExistingAccounts: [],
        })
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

      if (url === '/api/ai/statement/resolve-account' && init?.method === 'POST') {
        return createJsonResponse({
          statementUploadId: 'upload-1',
          parseSessionId: 'session-1',
          status: 'queued',
          job: {
            id: 'job-1',
            statementUploadId: 'upload-1',
            fileName: 'statement.pdf',
            status: 'queued',
            createdAt: '2026-03-16T00:00:00.000Z',
            startedAt: null,
            finishedAt: null,
            result: null,
            error: null,
          },
        })
      }

      throw new Error(`Unexpected fetch call ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    statementIngestionState.jobs = [{
      id: 'job-paused-1',
      statementUploadId: 'upload-1',
      fileName: 'statement.pdf',
      status: 'needs_action',
      createdAt: '2026-03-16T00:00:00.000Z',
      startedAt: '2026-03-16T00:00:01.000Z',
      finishedAt: '2026-03-16T00:00:02.000Z',
      error: null,
      result: {
        status: 'needs_account_resolution',
        statementUploadId: 'upload-1',
        parseSessionId: 'session-1',
        imports: [],
        importCount: 0,
        transactionsCount: 0,
        duplicateCount: 0,
        reviewUrl: null,
      },
    }]

    render(<StatementsPage />)

    expect(await screen.findByText('Account Matching Needs Review')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Use verified brand' })).toBeInTheDocument()
    vi.mocked(toast.error).mockClear()

    await userEvent.click(screen.getByRole('button', { name: 'Continue Import' }))
    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => String(call[0]) === '/api/ai/statement/resolve-account')).toBe(false)
    })

    await userEvent.click(screen.getByRole('button', { name: 'Use verified brand' }))
    await userEvent.click(screen.getByRole('button', { name: 'Continue Import' }))

    await waitFor(() => {
      const resolveCall = fetchMock.mock.calls.find((call) => String(call[0]) === '/api/ai/statement/resolve-account')
      expect(resolveCall).toBeTruthy()
      const payload = JSON.parse(String(resolveCall?.[1]?.body ?? '{}'))
      expect(payload.resolutions).toEqual([
        {
          descriptorKey: 'dbs-1',
          createAccount: expect.objectContaining({
            institution_name: 'DBS Bank Ltd',
            institution_brand_code: 'dbs_bank',
            institution_brand_decision: 'verified',
          }),
        },
      ])
    })
    expect(mockedTrackIngestionJob).toHaveBeenCalledWith(expect.objectContaining({
      id: 'job-1',
      status: 'queued',
      statementUploadId: 'upload-1',
    }))
  })

  it('reopens a paused import instead of showing it as already imported', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === '/api/household/profiles') {
        return createJsonResponse({ profiles: [] })
      }

      if (url === '/api/ai/statement' && init?.method === 'POST') {
        return createJsonResponse({
          error: 'This file is already waiting for account matching.',
          duplicate: true,
          statementUploadId: 'upload-1',
          existingFileName: 'statement.pdf',
          existingStatus: 'needs_account_resolution',
          existingImportCount: 0,
          existingImports: [],
          parseSessionId: 'session-1',
          resumable: true,
          resumeUrl: '/statements?parseSessionId=session-1',
        }, false, 409)
      }

      if (url === '/api/ai/statement/parse-session/session-1') {
        return createJsonResponse({
          parseSessionId: 'session-1',
          statementUploadId: 'upload-1',
          fileName: 'statement.pdf',
          status: 'needs_account_resolution',
          unmatchedAccountDescriptors: [
            {
              descriptorKey: 'dbs-1',
              label: 'DBS Visa 1234',
              transactionCount: 3,
              sampleRowIndexes: [1, 2, 3],
              institution_name: 'DBS Bank Ltd',
              institution_code: 'dbs',
              account_type: 'credit_card',
              product_name: 'Visa Card',
              identifier_hint: '1234',
              card_name: 'Visa',
              card_last4: '1234',
              currency: 'SGD',
              suggestedExistingAccountId: null,
              suggestedExistingAccountLabel: null,
              suggestedScore: null,
            },
          ],
          suggestedExistingAccounts: [],
        })
      }

      throw new Error(`Unexpected fetch call ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<StatementsPage />)

    await screen.findByText('Drop one or more statements here or click to browse')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement | null
    expect(input).not.toBeNull()
    if (!input) throw new Error('File input not found')

    await userEvent.upload(input, new File(['statement bytes'], 'statement.pdf', { type: 'application/pdf' }))

    expect(await screen.findByText('Account Matching Needs Review')).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('statement.pdf is waiting for account matching. Continue below.')
    expect(toast.error).not.toHaveBeenCalled()
    expect(mockedTrackIngestionJob).not.toHaveBeenCalled()
  })

  it('opens the existing review when the same statement was already imported once', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === '/api/household/profiles') {
        return createJsonResponse({ profiles: [] })
      }

      if (url === '/api/ai/statement' && init?.method === 'POST') {
        return createJsonResponse({
          error: 'This file has already been processed.',
          duplicate: true,
          statementUploadId: 'upload-1',
          existingFileName: 'statement.pdf',
          existingStatus: 'completed',
          existingImportCount: 1,
          existingImports: [
            {
              importId: 'import-1',
              importLabel: 'DBS - Visa',
              accountLabel: 'DBS - Visa',
              reviewUrl: '/statements/review/import-1',
              status: 'in_review',
            },
          ],
          parseSessionId: null,
          resumable: false,
          resumeUrl: null,
        }, false, 409)
      }

      throw new Error(`Unexpected fetch call ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<StatementsPage />)

    await screen.findByText('Drop one or more statements here or click to browse')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement | null
    expect(input).not.toBeNull()
    if (!input) throw new Error('File input not found')

    await userEvent.upload(input, new File(['statement bytes'], 'statement.pdf', { type: 'application/pdf' }))

    await waitFor(() => {
      expect(mockedRouterPush).toHaveBeenCalledWith('/statements/review/import-1')
    })
    expect(toast.success).toHaveBeenCalledWith('statement.pdf was already imported. Opening the existing review.')
  })

  it('shows existing review choices when the same statement was already split into multiple account-specific imports', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === '/api/household/profiles') {
        return createJsonResponse({ profiles: [] })
      }

      if (url === '/api/ai/statement' && init?.method === 'POST') {
        return createJsonResponse({
          error: 'This file has already been processed.',
          duplicate: true,
          statementUploadId: 'upload-1',
          existingFileName: 'statement.pdf',
          existingStatus: 'completed',
          existingImportCount: 2,
          existingImports: [
            {
              importId: 'import-1',
              importLabel: 'DBS - Visa',
              accountLabel: 'DBS - Visa',
              reviewUrl: '/statements/review/import-1',
              status: 'in_review',
            },
            {
              importId: 'import-2',
              importLabel: 'POSB - Savings',
              accountLabel: 'POSB - Savings',
              reviewUrl: '/statements/review/import-2',
              status: 'committed',
            },
          ],
          parseSessionId: null,
          resumable: false,
          resumeUrl: null,
        }, false, 409)
      }

      throw new Error(`Unexpected fetch call ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<StatementsPage />)

    await screen.findByText('Drop one or more statements here or click to browse')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement | null
    expect(input).not.toBeNull()
    if (!input) throw new Error('File input not found')

    await userEvent.upload(input, new File(['statement bytes'], 'statement.pdf', { type: 'application/pdf' }))

    expect(await screen.findByText('Statement Already Imported')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open DBS - Visa' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open POSB - Savings' })).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('statement.pdf was already imported into 2 account-specific reviews. Open one below.')
    expect(toast.error).not.toHaveBeenCalled()
    expect(mockedRouterPush).not.toHaveBeenCalled()
  })

  it('submits one background import request per selected file with concurrency capped at two', async () => {
    const startedFiles: string[] = []
    const pendingResolvers: Array<() => void> = []
    let inFlight = 0
    let maxInFlight = 0

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === '/api/household/profiles') {
        return Promise.resolve(createJsonResponse({ profiles: [] }))
      }

      if (url === '/api/ai/statement' && init?.method === 'POST' && init.body instanceof FormData) {
        const statement = init.body.get('statement')
        const fileName = statement instanceof File ? statement.name : 'unknown.pdf'
        startedFiles.push(fileName)
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)

        return new Promise<Response>((resolve) => {
          pendingResolvers.push(() => {
            inFlight -= 1
            resolve(createJsonResponse({
              duplicate: false,
              statementUploadId: `upload-${fileName}`,
              status: 'queued',
              job: {
                id: `job-${fileName}`,
                statementUploadId: `upload-${fileName}`,
                fileName,
                status: 'queued',
                createdAt: '2026-03-16T00:00:00.000Z',
                startedAt: null,
                finishedAt: null,
                result: null,
                error: null,
              },
            }, true, 202))
          })
        })
      }

      throw new Error(`Unexpected fetch call ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<StatementsPage />)

    await screen.findByText('Drop one or more statements here or click to browse')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement | null
    expect(input).not.toBeNull()
    if (!input) throw new Error('File input not found')

    await userEvent.upload(input, [
      new File(['one'], 'one.pdf', { type: 'application/pdf' }),
      new File(['two'], 'two.pdf', { type: 'application/pdf' }),
      new File(['three'], 'three.pdf', { type: 'application/pdf' }),
    ])

    await waitFor(() => {
      expect(startedFiles).toEqual(['one.pdf', 'two.pdf'])
    })
    expect(maxInFlight).toBe(2)

    pendingResolvers.shift()?.()

    await waitFor(() => {
      expect(startedFiles).toEqual(['one.pdf', 'two.pdf', 'three.pdf'])
    })
    expect(maxInFlight).toBe(2)

    while (pendingResolvers.length > 0) {
      pendingResolvers.shift()?.()
    }

    await waitFor(() => {
      expect(mockedTrackIngestionJob).toHaveBeenCalledTimes(3)
    })
    expect(fetchMock.mock.calls.filter((call) => String(call[0]) === '/api/ai/statement')).toHaveLength(3)
  })
})
