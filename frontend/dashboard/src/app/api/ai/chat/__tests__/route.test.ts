// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/ai/chat/route'
import { createChatEventStream } from '@/lib/ai/chat/orchestrator'
import {
  getAuthenticatedChatRequestContext,
  getAuthorizedChatSessionContext,
} from '@/lib/ai/chat/request-context'
import type { ChatSessionPayload } from '@/lib/ai/chat/types'

vi.mock('@/lib/ai/chat/orchestrator', () => ({
  createChatEventStream: vi.fn(),
}))

vi.mock('@/lib/ai/chat/request-context', () => ({
  getAuthenticatedChatRequestContext: vi.fn(),
  getAuthorizedChatSessionContext: vi.fn(),
}))

const mockedCreateChatEventStream = vi.mocked(createChatEventStream)
const mockedGetAuthenticatedChatRequestContext = vi.mocked(getAuthenticatedChatRequestContext)
const mockedGetAuthorizedChatSessionContext = vi.mocked(getAuthorizedChatSessionContext)

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
  promptChips: ["What's my net worth today?"],
  coverage: {
    transactions: { start: '2026-01-01', end: '2026-03-01' },
    ledger: { start: '2026-01-01', end: '2026-03-01' },
    statementSummaries: { start: '2026-01-31', end: '2026-02-28' },
  },
}

function createRequest(body: unknown) {
  return new NextRequest('http://localhost/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/ai/chat', () => {
  beforeEach(() => {
    mockedCreateChatEventStream.mockReset()
    mockedGetAuthenticatedChatRequestContext.mockReset()
    mockedGetAuthorizedChatSessionContext.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    mockedGetAuthenticatedChatRequestContext.mockResolvedValueOnce(null)

    const response = await POST(createRequest({ message: 'hello' }))
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Unauthorized' })
  })

  it('returns 400 when message is empty', async () => {
    mockedGetAuthenticatedChatRequestContext.mockResolvedValueOnce({
      supabase: {} as never,
      userId: 'user-1',
      householdId: 'hh-1',
    })

    const response = await POST(createRequest({ message: '   ' }))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Message is required' })
    expect(mockedGetAuthorizedChatSessionContext).not.toHaveBeenCalled()
    expect(mockedCreateChatEventStream).not.toHaveBeenCalled()
  })

  it('returns an event stream and passes parsed history plus session context', async () => {
    mockedGetAuthenticatedChatRequestContext.mockResolvedValueOnce({
      supabase: {} as never,
      userId: 'user-1',
      householdId: 'hh-1',
    })
    mockedGetAuthorizedChatSessionContext.mockResolvedValueOnce(sessionPayload)
    mockedCreateChatEventStream.mockReturnValueOnce(new ReadableStream({
      start(controller) {
        controller.close()
      },
    }))

    const response = await POST(createRequest({
      message: 'Show me my last 5 DBS transactions',
      history: [
        { role: 'user', content: 'How much did I spend last month?' },
        {
          role: 'assistant',
          content: 'You spent SGD 420.',
          assistantContext: {
            intent: 'spending',
            periodLabel: 'last month',
            dateFrom: '2026-02-01',
            dateTo: '2026-02-28',
            comparisonDateFrom: null,
            comparisonDateTo: null,
            comparisonPeriodLabel: null,
            accountIds: ['acct-1'],
            accountNames: ['DBS Altitude'],
            merchant: null,
            categoryNames: ['Eating Out'],
            counterpartyName: null,
            currencyMode: 'single_currency',
            groupBy: 'merchant',
            nextCursor: null,
            dataAvailability: 'available',
          },
        },
        { role: 'system', content: 'skip me' },
        { role: 'assistant', content: 42 },
      ],
      sessionContext: sessionPayload,
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/event-stream')
    expect(mockedGetAuthorizedChatSessionContext).toHaveBeenCalledWith({
      requestedSession: sessionPayload,
      userId: 'user-1',
      householdId: 'hh-1',
    })
    expect(mockedCreateChatEventStream).toHaveBeenCalledWith({
      message: 'Show me my last 5 DBS transactions',
      history: [
        { role: 'user', content: 'How much did I spend last month?', assistantContext: null },
        {
          role: 'assistant',
          content: 'You spent SGD 420.',
          assistantContext: expect.objectContaining({
            intent: 'spending',
            dateFrom: '2026-02-01',
            accountIds: ['acct-1'],
          }),
        },
      ],
      session: sessionPayload,
    })
  })
})
