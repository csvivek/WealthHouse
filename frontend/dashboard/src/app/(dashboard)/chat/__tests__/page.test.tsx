import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatPage from '@/app/(dashboard)/chat/page'
import type { ChatSessionPayload } from '@/lib/ai/chat/types'

vi.mock('@/components/executive/page', () => ({
  ExecutivePage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ExecutivePageHeader: ({
    title,
    description,
    actions,
  }: {
    title: React.ReactNode
    description?: React.ReactNode
    actions?: React.ReactNode
  }) => (
    <div>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {actions}
    </div>
  ),
}))

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}))

const sessionPayload: ChatSessionPayload = {
  userDisplayName: 'Owner User',
  householdId: 'hh-1',
  householdName: 'Home',
  baseCurrency: 'SGD',
  accounts: [
    {
      id: 'acct-1',
      name: 'DBS Altitude',
      productName: 'DBS Altitude',
      nickname: null,
      institutionName: 'DBS',
      identifierHint: '1234',
      accountType: 'credit_card',
      currency: 'SGD',
    },
  ],
  promptChips: [
    "What's my net worth today?",
    'How much did I spend on food this month?',
  ],
  coverage: {
    transactions: { start: '2026-01-01', end: '2026-03-31' },
    ledger: { start: '2026-01-01', end: '2026-03-31' },
    statementSummaries: { start: '2026-01-31', end: '2026-03-31' },
  },
}

function createSseResponse(events: Array<{ event: string; payload: Record<string, unknown> }>) {
  const stream = new ReadableStream({
    start(controller) {
      for (const item of events) {
        controller.enqueue(
          new TextEncoder().encode(
            `event: ${item.event}\ndata: ${JSON.stringify(item.payload)}\n\n`,
          ),
        )
      }
      controller.close()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
    },
  })
}

describe('ChatPage', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/ai/chat/session') {
        return Promise.resolve(new Response(JSON.stringify(sessionPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }))
      }

      if (url === '/api/ai/chat') {
        return Promise.resolve(createSseResponse([
          { event: 'status', payload: { message: 'Drafting response' } },
          {
            event: 'delta',
            payload: {
              text: '## Net worth\n\n| Item | Amount |\n| --- | --- |\n| Cash | **SGD 1,200** |\n',
            },
          },
          {
            event: 'done',
            payload: {
              assistantContext: {
                intent: 'net_worth',
                periodLabel: 'today',
                dateFrom: null,
                dateTo: null,
                comparisonDateFrom: null,
                comparisonDateTo: null,
                comparisonPeriodLabel: null,
                accountIds: [],
                accountNames: [],
                merchant: null,
                categoryNames: [],
                counterpartyName: null,
                currencyMode: 'single_currency',
                groupBy: 'none',
                nextCursor: null,
                dataAvailability: 'available',
              },
            },
          },
        ]))
      }

      return Promise.reject(new Error(`Unexpected fetch to ${url}`))
    })

    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    cleanup()
  })

  it('loads prompt chips, sends only prior history, and renders streamed markdown output', async () => {
    render(<ChatPage />)

    const netWorthChip = await screen.findByRole('button', { name: "What's my net worth today?" })
    expect(netWorthChip).toBeInTheDocument()

    await userEvent.click(netWorthChip)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/ai/chat', expect.objectContaining({
        method: 'POST',
      }))
    })

    const postCall = fetchMock.mock.calls.find(([input]) => String(input) === '/api/ai/chat')
    const requestBody = JSON.parse(String(postCall?.[1]?.body ?? '{}'))

    expect(requestBody).toEqual(expect.objectContaining({
      message: "What's my net worth today?",
      history: [],
      sessionContext: sessionPayload,
    }))

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.getByText('Cash')).toBeInTheDocument()
    expect(screen.getByText('SGD 1,200')).toBeInTheDocument()
  })

  it('resets the conversation and re-shows onboarding chips', async () => {
    render(<ChatPage />)

    await userEvent.click(await screen.findByRole('button', { name: "What's my net worth today?" }))
    expect(await screen.findByText('Cash')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'New Chat' }))

    await waitFor(() => {
      expect(screen.queryByText('Cash')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: "What's my net worth today?" })).toBeInTheDocument()
  })
})
