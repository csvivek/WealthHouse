import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StatementsOverviewPage from '@/app/(dashboard)/statements/overview/page'

describe('StatementsOverviewPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  it('filters by bank and shows disabled download for legacy imports', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        cards: [
          {
            id: 'import-1',
            status: 'committed',
            bankKey: 'dbs',
            bankLabel: 'DBS',
            canonicalType: 'Credit Card',
            badgeLabel: 'Credit Card',
            title: 'DBS Altitude Card',
            subtitle: 'DBS Bank Ltd — Altitude Card',
            accountHint: '•••• 1234',
            statementDate: '2026-03-23',
            periodStart: '2026-02-24',
            periodEnd: '2026-03-23',
            currency: 'SGD',
            summary: {
              creditLimit: 10000,
              minimumPayment: 120,
              paymentDueDate: '2026-04-17',
              grandTotal: 441.01,
              openingBalance: null,
              closingBalance: null,
            },
            transactionCount: 3,
            duplicateCount: 0,
            matchedAccountLabel: 'DBS Bank Ltd — Altitude Card',
            institutionName: 'DBS Bank Ltd',
            importFileName: 'dbs-altitude.pdf',
            createdAt: '2026-03-24T00:00:00.000Z',
            subCards: [],
            transactions: [],
            reviewUrl: '/statements/review/import-1',
            reviewLabel: 'View',
            downloadUrl: '/api/statements/import-1/download',
            downloadAvailable: true,
            downloadUnavailableReason: null,
          },
          {
            id: 'import-2',
            status: 'in_review',
            bankKey: 'ocbc',
            bankLabel: 'OCBC',
            canonicalType: 'Savings',
            badgeLabel: 'Savings',
            title: 'OCBC 360 Account',
            subtitle: 'OCBC Bank — 360 Account',
            accountHint: null,
            statementDate: null,
            periodStart: '2026-01-01',
            periodEnd: '2026-01-31',
            currency: 'SGD',
            summary: {
              creditLimit: null,
              minimumPayment: null,
              paymentDueDate: null,
              grandTotal: null,
              openingBalance: 1200,
              closingBalance: 1450,
            },
            transactionCount: 5,
            duplicateCount: 0,
            matchedAccountLabel: 'OCBC Bank — 360 Account',
            institutionName: 'OCBC Bank',
            importFileName: 'ocbc-360.pdf',
            createdAt: '2026-02-01T00:00:00.000Z',
            subCards: [],
            transactions: [],
            reviewUrl: '/statements/review/import-2',
            reviewLabel: 'Review',
            downloadUrl: null,
            downloadAvailable: false,
            downloadUnavailableReason: 'Original file unavailable for legacy imports.',
          },
        ],
      }),
    })))

    render(<StatementsOverviewPage />)

    expect(await screen.findByText('DBS Altitude Card')).toBeInTheDocument()
    expect(screen.getByText('OCBC 360 Account')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'OCBC' }))

    await waitFor(() => {
      expect(screen.queryByText('DBS Altitude Card')).not.toBeInTheDocument()
    })
    expect(screen.getByText('OCBC 360 Account')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download original' })).toBeDisabled()
    expect(screen.getByRole('link', { name: /Import Statement/i })).toHaveAttribute('href', '/statements')
  })
})
