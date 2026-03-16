// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/ai/chat/session/route'
import { buildChatSessionPayload } from '@/lib/ai/chat/session'
import { getAuthenticatedChatRequestContext } from '@/lib/ai/chat/request-context'

vi.mock('@/lib/ai/chat/session', () => ({
  buildChatSessionPayload: vi.fn(),
}))

vi.mock('@/lib/ai/chat/request-context', () => ({
  getAuthenticatedChatRequestContext: vi.fn(),
}))

const mockedBuildChatSessionPayload = vi.mocked(buildChatSessionPayload)
const mockedGetAuthenticatedChatRequestContext = vi.mocked(getAuthenticatedChatRequestContext)

describe('GET /api/ai/chat/session', () => {
  beforeEach(() => {
    mockedBuildChatSessionPayload.mockReset()
    mockedGetAuthenticatedChatRequestContext.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    mockedGetAuthenticatedChatRequestContext.mockResolvedValueOnce(null)

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Unauthorized' })
  })

  it('returns the household chat session payload', async () => {
    mockedGetAuthenticatedChatRequestContext.mockResolvedValueOnce({
      supabase: { key: 'supabase' } as never,
      userId: 'user-1',
      householdId: 'hh-1',
    })
    mockedBuildChatSessionPayload.mockResolvedValueOnce({
      userDisplayName: 'Owner User',
      householdId: 'hh-1',
      householdName: 'Home',
      baseCurrency: 'SGD',
      accounts: [],
      promptChips: ["What's my net worth today?"],
      coverage: {
        transactions: { start: null, end: null },
        ledger: { start: null, end: null },
        statementSummaries: { start: null, end: null },
      },
    })

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual(expect.objectContaining({
      householdId: 'hh-1',
      baseCurrency: 'SGD',
      promptChips: ["What's my net worth today?"],
    }))
    expect(mockedBuildChatSessionPayload).toHaveBeenCalledWith({
      supabase: { key: 'supabase' },
      userId: 'user-1',
      householdId: 'hh-1',
    })
  })
})
