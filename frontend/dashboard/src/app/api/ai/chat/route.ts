import { NextRequest, NextResponse } from 'next/server'
import { createChatEventStream } from '@/lib/ai/chat/orchestrator'
import {
  getAuthenticatedChatRequestContext,
  getAuthorizedChatSessionContext,
} from '@/lib/ai/chat/request-context'
import type {
  ChatAssistantContext,
  ChatHistoryItem,
  ChatSessionPayload,
} from '@/lib/ai/chat/types'

interface ChatRequestBody {
  message?: unknown
  history?: unknown
  sessionContext?: unknown
}

function parseAssistantContext(value: unknown): ChatAssistantContext | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<ChatAssistantContext>
  if (typeof candidate.intent !== 'string' || typeof candidate.periodLabel !== 'string') {
    return null
  }

  return {
    intent: candidate.intent as ChatAssistantContext['intent'],
    periodLabel: candidate.periodLabel,
    dateFrom: typeof candidate.dateFrom === 'string' ? candidate.dateFrom : null,
    dateTo: typeof candidate.dateTo === 'string' ? candidate.dateTo : null,
    comparisonDateFrom: typeof candidate.comparisonDateFrom === 'string' ? candidate.comparisonDateFrom : null,
    comparisonDateTo: typeof candidate.comparisonDateTo === 'string' ? candidate.comparisonDateTo : null,
    comparisonPeriodLabel: typeof candidate.comparisonPeriodLabel === 'string' ? candidate.comparisonPeriodLabel : null,
    accountIds: Array.isArray(candidate.accountIds) ? candidate.accountIds.filter((item): item is string => typeof item === 'string') : [],
    accountNames: Array.isArray(candidate.accountNames) ? candidate.accountNames.filter((item): item is string => typeof item === 'string') : [],
    merchant: typeof candidate.merchant === 'string' ? candidate.merchant : null,
    categoryNames: Array.isArray(candidate.categoryNames) ? candidate.categoryNames.filter((item): item is string => typeof item === 'string') : [],
    counterpartyName: typeof candidate.counterpartyName === 'string' ? candidate.counterpartyName : null,
    currencyMode: candidate.currencyMode === 'single_currency' ? 'single_currency' : 'segment_by_currency',
    groupBy: ['merchant', 'category', 'month', 'account', 'none'].includes(String(candidate.groupBy))
      ? candidate.groupBy as ChatAssistantContext['groupBy']
      : 'none',
    nextCursor: typeof candidate.nextCursor === 'string' ? candidate.nextCursor : null,
    dataAvailability: ['available', 'no_match', 'unavailable', 'missing_account', 'out_of_scope'].includes(String(candidate.dataAvailability))
      ? candidate.dataAvailability as ChatAssistantContext['dataAvailability']
      : 'available',
  }
}

function parseHistory(value: unknown): ChatHistoryItem[] {
  if (!Array.isArray(value)) return []

  const parsed: ChatHistoryItem[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as { role?: unknown; content?: unknown; assistantContext?: unknown }
    if ((candidate.role !== 'user' && candidate.role !== 'assistant') || typeof candidate.content !== 'string') {
      continue
    }

    parsed.push({
      role: candidate.role,
      content: candidate.content,
      assistantContext: candidate.role === 'assistant'
        ? parseAssistantContext(candidate.assistantContext)
        : null,
    })
  }

  return parsed
}

function parseSessionContext(value: unknown): ChatSessionPayload | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<ChatSessionPayload>
  if (typeof candidate.householdId !== 'string' || typeof candidate.baseCurrency !== 'string') {
    return null
  }

  return {
    userDisplayName: typeof candidate.userDisplayName === 'string' ? candidate.userDisplayName : null,
    householdId: candidate.householdId,
    householdName: typeof candidate.householdName === 'string' ? candidate.householdName : null,
    baseCurrency: candidate.baseCurrency,
    accounts: Array.isArray(candidate.accounts) ? candidate.accounts.filter((item): item is ChatSessionPayload['accounts'][number] => {
      if (!item || typeof item !== 'object') return false
      const account = item as ChatSessionPayload['accounts'][number]
      return typeof account.id === 'string' && typeof account.name === 'string' && typeof account.accountType === 'string'
    }) : [],
    promptChips: Array.isArray(candidate.promptChips) ? candidate.promptChips.filter((item): item is string => typeof item === 'string') : [],
    coverage: candidate.coverage && typeof candidate.coverage === 'object'
      ? {
          transactions: {
            start: typeof candidate.coverage.transactions?.start === 'string' ? candidate.coverage.transactions.start : null,
            end: typeof candidate.coverage.transactions?.end === 'string' ? candidate.coverage.transactions.end : null,
          },
          ledger: {
            start: typeof candidate.coverage.ledger?.start === 'string' ? candidate.coverage.ledger.start : null,
            end: typeof candidate.coverage.ledger?.end === 'string' ? candidate.coverage.ledger.end : null,
          },
          statementSummaries: {
            start: typeof candidate.coverage.statementSummaries?.start === 'string' ? candidate.coverage.statementSummaries.start : null,
            end: typeof candidate.coverage.statementSummaries?.end === 'string' ? candidate.coverage.statementSummaries.end : null,
          },
        }
      : {
          transactions: { start: null, end: null },
          ledger: { start: null, end: null },
          statementSummaries: { start: null, end: null },
        },
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedChatRequestContext()
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as ChatRequestBody
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const history = parseHistory(body.history)
    const requestedSession = parseSessionContext(body.sessionContext)

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const session = await getAuthorizedChatSessionContext({
      requestedSession,
      userId: context.userId,
      householdId: context.householdId,
    })

    return new Response(createChatEventStream({
      message,
      history,
      session,
    }), {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 })
  }
}
