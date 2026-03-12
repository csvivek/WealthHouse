import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import StatementsPage from '@/app/(dashboard)/statements/page'
import { createClient } from '@/lib/supabase/client'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

vi.mock('@/lib/statement-commit-jobs', () => ({
  useStatementCommitJobs: () => ({
    hasActiveJobs: false,
  }),
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
      institution_code: 'dbs',
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
      institution_code: 'ocbc',
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
})
