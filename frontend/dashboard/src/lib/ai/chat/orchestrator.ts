import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions/completions'
import { openai } from '@/lib/ai/openai'
import { loadApprovedCategoryDefinitions } from '@/lib/knowledge/categories'
import {
  buildAssistantContext,
  executeChatDataTool,
  isRangeOutsideCoverage,
  sanitizeRouteDecision,
} from '@/lib/ai/chat/tools'
import type {
  ChatHistoryItem,
  ChatRouteDecision,
  ChatSessionPayload,
  ChatTurnParams,
} from '@/lib/ai/chat/types'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const ROUTER_MODEL = 'gpt-4o-mini'
const PLANNER_MODEL = 'gpt-4o-mini'
const FINAL_MODEL = 'gpt-4o'
const MAX_DB_TOOL_CALLS = 3

function nowIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function createSseEvent(event: string, payload: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
}

function chunkText(text: string) {
  const words = text.split(/(\s+)/).filter(Boolean)
  const chunks: string[] = []
  let current = ''

  for (const word of words) {
    if ((current + word).length > 28 && current) {
      chunks.push(current)
      current = word
      continue
    }
    current += word
  }

  if (current) chunks.push(current)
  return chunks
}

function writeEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: string,
  payload: Record<string, unknown>,
) {
  controller.enqueue(encoder.encode(createSseEvent(event, payload)))
}

function serializeAssistantContext(historyItem: ChatHistoryItem) {
  if (!historyItem.assistantContext) return historyItem.content
  return [
    historyItem.content,
    '',
    `<assistant_context>${JSON.stringify(historyItem.assistantContext)}</assistant_context>`,
  ].join('\n')
}

function toConversationMessages(history: ChatHistoryItem[]): ChatCompletionMessageParam[] {
  return history.map((item) => (
    item.role === 'assistant'
      ? {
          role: 'assistant',
          content: serializeAssistantContext(item),
        }
      : {
          role: 'user',
          content: item.content,
        }
  ))
}

function buildRoutingPrompt(session: ChatSessionPayload) {
  const categoryNames = loadApprovedCategoryDefinitions().map((definition) => definition.canonicalName)
  return [
    'You route Wealth House chat requests before any database query is made.',
    `Today is ${nowIsoDate()}.`,
    `Default reporting currency: ${session.baseCurrency}.`,
    'Available accounts:',
    JSON.stringify(session.accounts, null, 2),
    'Approved category names:',
    categoryNames.join(', '),
    'Instructions:',
    '- Always emit the route_financial_query tool call.',
    '- Resolve natural-language periods to ISO date bounds when possible.',
    '- If the user follows up on a prior assistant_context, inherit its period/account scope/cursor unless the user explicitly changes it.',
    '- When the user asks for "show more", preserve the prior cursor and filters.',
    '- If the user mentions an account or institution not present in the available accounts, set missingAccountName or missingInstitutionName.',
    '- Use intent values: spending, net_worth, cash_flow, advances, transactions, financial_advice, general.',
    '- Use currencyMode single_currency only when all requested data clearly maps to a single currency. Otherwise use segment_by_currency.',
    '- Use groupBy merchant for merchant/top-spend questions, category for category breakdowns, month for trend/comparison prompts, none otherwise.',
    '- Never invent account ids.',
  ].join('\n')
}

function buildPlannerPrompt(session: ChatSessionPayload) {
  return [
    'You decide which Wealth House internal data tools to call after routing is complete.',
    `Default reporting currency: ${session.baseCurrency}.`,
    'Instructions:',
    '- Use the routing tool result as the source of truth for date range, account scope, merchant/category filters, and cursor.',
    '- Call only the minimum tools needed to answer accurately.',
    '- Prefer get_account_summary for financial_advice when balance context will help.',
    '- Comparison questions may call the same tool twice with primary and comparison periods.',
    '- Do not call more than three database tools in total.',
    '- If the available tool outputs are enough, stop calling tools.',
  ].join('\n')
}

function buildFinalPrompt(session: ChatSessionPayload) {
  return [
    `You are WealthHouse AI for household "${session.householdName ?? 'Unnamed household'}".`,
    `Today is ${nowIsoDate()}.`,
    `Default reporting currency: ${session.baseCurrency}.`,
    session.userDisplayName ? `User name: ${session.userDisplayName}.` : null,
    'You must answer only from the provided tool results and chat history.',
    'Formatting rules:',
    '- Use markdown.',
    '- Always state the reporting period.',
    '- Always state the currency or explain when the answer is segmented by currency.',
    '- For spending breakdowns, prefer a concise markdown table: merchant/category | amount | % of total.',
    '- For net worth, use grouped sections for assets and liabilities and include balance as-of dates.',
    '- For cash flow, show income, expenses, and net clearly.',
    '- For transaction lookups, keep rows compact: date | merchant | amount.',
    '- If tool data says availability is unavailable or no_match, say that directly instead of implying zero.',
    '- If figures are segmented by currency, do not combine them unless a consolidated total is explicitly available in tool results.',
    '- The assistant is focused on Wealth House financial data; for general questions, redirect briefly.',
  ].filter(Boolean).join('\n')
}

const ROUTING_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'route_financial_query',
    description: 'Classify the chat request and resolve user scope before any database query runs.',
    parameters: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          enum: ['spending', 'net_worth', 'cash_flow', 'advances', 'transactions', 'financial_advice', 'general'],
        },
        periodLabel: { type: 'string' },
        dateFrom: { type: ['string', 'null'] },
        dateTo: { type: ['string', 'null'] },
        comparisonDateFrom: { type: ['string', 'null'] },
        comparisonDateTo: { type: ['string', 'null'] },
        comparisonPeriodLabel: { type: ['string', 'null'] },
        accountIds: {
          type: 'array',
          items: { type: 'string' },
        },
        merchant: { type: ['string', 'null'] },
        categoryNames: {
          type: 'array',
          items: { type: 'string' },
        },
        counterpartyName: { type: ['string', 'null'] },
        institutionName: { type: ['string', 'null'] },
        currencyMode: {
          type: 'string',
          enum: ['segment_by_currency', 'single_currency'],
        },
        groupBy: {
          type: 'string',
          enum: ['merchant', 'category', 'month', 'account', 'none'],
        },
        limit: { type: 'number' },
        cursor: { type: ['string', 'null'] },
        missingAccountName: { type: ['string', 'null'] },
        missingInstitutionName: { type: ['string', 'null'] },
        requiresAccountSummary: { type: 'boolean' },
      },
      required: ['intent', 'periodLabel'],
      additionalProperties: false,
    },
  },
}

const DATA_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_spending_summary',
      description: 'Return aggregated debit spending grouped by merchant or category for a date range.',
      parameters: {
        type: 'object',
        properties: {
          accountIds: { type: 'array', items: { type: 'string' } },
          merchant: { type: ['string', 'null'] },
          categoryNames: { type: 'array', items: { type: 'string' } },
          dateFrom: { type: ['string', 'null'] },
          dateTo: { type: ['string', 'null'] },
          groupBy: { type: 'string', enum: ['merchant', 'category'] },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_net_worth',
      description: 'Return account and liability balances grouped by currency.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cash_flow',
      description: 'Return income, expenses, net cash flow, and grouped breakdowns for a date range.',
      parameters: {
        type: 'object',
        properties: {
          accountIds: { type: 'array', items: { type: 'string' } },
          dateFrom: { type: ['string', 'null'] },
          dateTo: { type: ['string', 'null'] },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_advances',
      description: 'Return outstanding advances, direction, repayments, and counterparty summaries.',
      parameters: {
        type: 'object',
        properties: {
          counterpartyName: { type: ['string', 'null'] },
          dateFrom: { type: ['string', 'null'] },
          dateTo: { type: ['string', 'null'] },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_transactions',
      description: 'Return paginated transactions filtered by date range, account, and merchant.',
      parameters: {
        type: 'object',
        properties: {
          accountIds: { type: 'array', items: { type: 'string' } },
          merchant: { type: ['string', 'null'] },
          dateFrom: { type: ['string', 'null'] },
          dateTo: { type: ['string', 'null'] },
          limit: { type: 'number' },
          cursor: { type: ['string', 'null'] },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_account_summary',
      description: 'Return accounts with latest stored balances, holdings, and card liabilities.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
]

function buildDirectResponse(routeDecision: ChatRouteDecision) {
  if (routeDecision.intent === 'general') {
    return "I'm focused on your Wealth House financial data. I can help with spending, net worth, advances, cash flow, and account summaries."
  }

  if (routeDecision.missingAccountName || routeDecision.missingInstitutionName) {
    const missingTarget = routeDecision.missingAccountName ?? routeDecision.missingInstitutionName ?? 'that account'
    return `I don't have data for ${missingTarget} yet. Upload a statement for that account or institution, then I can include it in the answer.`
  }

  return null
}

function findCoverageBlocker(routeDecision: ChatRouteDecision, session: ChatSessionPayload) {
  if (routeDecision.intent === 'spending' || routeDecision.intent === 'transactions') {
    if (isRangeOutsideCoverage({
      dateFrom: routeDecision.dateFrom,
      dateTo: routeDecision.dateTo,
      coverage: session.coverage.transactions,
    })) {
      return `I don't have imported transaction data for ${routeDecision.periodLabel}. Upload statements for that period, then I can answer accurately.`
    }
  }

  if (routeDecision.intent === 'cash_flow') {
    if (isRangeOutsideCoverage({
      dateFrom: routeDecision.dateFrom,
      dateTo: routeDecision.dateTo,
      coverage: session.coverage.ledger,
    })) {
      return `I don't have imported cash-flow data for ${routeDecision.periodLabel}. Upload statements or receipts for that period, then I can answer accurately.`
    }
  }

  return null
}

function parseToolArguments(value: string | undefined) {
  if (!value) return {}
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function runRoutingDecision(params: ChatTurnParams) {
  const completion = await openai.chat.completions.create({
    model: ROUTER_MODEL,
    temperature: 0.1,
    messages: [
      {
        role: 'developer',
        content: buildRoutingPrompt(params.session),
      },
      ...toConversationMessages(params.history),
      {
        role: 'user',
        content: params.message,
      },
    ],
    tools: [ROUTING_TOOL],
    tool_choice: {
      type: 'function',
      function: { name: 'route_financial_query' },
    },
  })

  const toolCall = completion.choices[0]?.message.tool_calls?.find((candidate) => candidate.type === 'function')
  const rawDecision = parseToolArguments(toolCall?.function.arguments)

  return {
    routeDecision: sanitizeRouteDecision({
      rawDecision,
      session: params.session,
    }),
    toolCallId: toolCall?.id ?? 'route_financial_query_0',
  }
}

async function streamStaticResponse(params: {
  controller: ReadableStreamDefaultController<Uint8Array>
  encoder: TextEncoder
  text: string
  assistantContext: ReturnType<typeof buildAssistantContext>
}) {
  for (const chunk of chunkText(params.text)) {
    writeEvent(params.controller, params.encoder, 'delta', { text: chunk })
  }

  writeEvent(params.controller, params.encoder, 'done', {
    assistantContext: params.assistantContext,
  })
}

function toolCallToAssistantMessage(toolCalls: ChatCompletionAssistantMessageParam['tool_calls']) {
  return {
    role: 'assistant',
    content: null,
    tool_calls: toolCalls,
  } satisfies ChatCompletionAssistantMessageParam
}

function toolResultMessage(toolCallId: string, payload: unknown) {
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content: JSON.stringify(payload),
  } satisfies ChatCompletionToolMessageParam
}

export function createChatEventStream(params: ChatTurnParams) {
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        writeEvent(controller, encoder, 'status', { message: 'Routing request' })
        const supabase = await createServerSupabaseClient()
        const { routeDecision, toolCallId } = await runRoutingDecision(params)
        const directResponse = buildDirectResponse(routeDecision)

        if (directResponse) {
          const assistantContext = buildAssistantContext({
            routeDecision,
            toolContext: params.session,
            availability: routeDecision.intent === 'general' ? 'out_of_scope' : 'missing_account',
          })
          await streamStaticResponse({
            controller,
            encoder,
            text: directResponse,
            assistantContext,
          })
          controller.close()
          return
        }

        const coverageBlocker = findCoverageBlocker(routeDecision, params.session)
        if (coverageBlocker) {
          const assistantContext = buildAssistantContext({
            routeDecision,
            toolContext: params.session,
            availability: 'unavailable',
          })
          await streamStaticResponse({
            controller,
            encoder,
            text: coverageBlocker,
            assistantContext,
          })
          controller.close()
          return
        }

        const MAX_HISTORY_FOR_PLANNER = 10
        const planningMessages: ChatCompletionMessageParam[] = [
          {
            role: 'developer',
            content: buildPlannerPrompt(params.session),
          },
          ...toConversationMessages(params.history.slice(-MAX_HISTORY_FOR_PLANNER)),
          {
            role: 'user',
            content: params.message,
          },
          toolCallToAssistantMessage([
            {
              id: toolCallId,
              type: 'function',
              function: {
                name: 'route_financial_query',
                arguments: JSON.stringify(routeDecision),
              },
            },
          ]),
          toolResultMessage(toolCallId, routeDecision),
        ]

        const toolOutputs: Array<{ name: string; result: Record<string, unknown> }> = []
        let dbToolCalls = 0
        let nextCursor: string | null = routeDecision.cursor

        while (dbToolCalls < MAX_DB_TOOL_CALLS) {
          writeEvent(controller, encoder, 'status', { message: 'Checking requested data' })
          const plannerCompletion = await openai.chat.completions.create({
            model: PLANNER_MODEL,
            temperature: 0.1,
            messages: planningMessages,
            tools: DATA_TOOLS,
            tool_choice: 'auto',
          })

          const plannerMessage = plannerCompletion.choices[0]?.message
          const plannerToolCalls = (plannerMessage?.tool_calls ?? []).filter((toolCall) => toolCall.type === 'function')

          if (plannerToolCalls.length === 0) {
            break
          }

          planningMessages.push(toolCallToAssistantMessage(plannerToolCalls))

          const VALID_DATA_TOOL_NAMES = new Set(['get_account_summary', 'get_net_worth', 'get_spending_summary', 'get_cash_flow', 'get_advances', 'get_transactions'])

          for (const toolCall of plannerToolCalls) {
            if (dbToolCalls >= MAX_DB_TOOL_CALLS) break

            if (!VALID_DATA_TOOL_NAMES.has(toolCall.function.name)) {
              console.warn(`Planner requested unknown tool: ${toolCall.function.name} — skipping`)
              continue
            }

            const args = parseToolArguments(toolCall.function.arguments)
            writeEvent(controller, encoder, 'status', {
              message: `Fetching ${toolCall.function.name.replaceAll('_', ' ')}`,
            })

            const result = await executeChatDataTool({
              name: toolCall.function.name,
              args,
              supabase,
              toolContext: {
                householdId: params.session.householdId,
                baseCurrency: params.session.baseCurrency,
                accounts: params.session.accounts,
                coverage: params.session.coverage,
              },
            })

            if (toolCall.function.name === 'get_transactions' && 'nextCursor' in result) {
              nextCursor = typeof result.nextCursor === 'string' ? result.nextCursor : null
            }

            toolOutputs.push({
              name: toolCall.function.name,
              result,
            })
            planningMessages.push(toolResultMessage(toolCall.id, result))
            dbToolCalls += 1
          }
        }

        writeEvent(controller, encoder, 'status', { message: 'Drafting response' })

        const finalMessages: ChatCompletionMessageParam[] = [
          {
            role: 'developer',
            content: buildFinalPrompt(params.session),
          },
          ...planningMessages,
        ]

        const availability = toolOutputs.length === 0
          ? 'unavailable'
          : toolOutputs.some((item) => item.result.availability === 'available')
            ? 'available'
            : toolOutputs.some((item) => item.result.availability === 'no_match')
              ? 'no_match'
              : 'unavailable'

        const assistantContext = buildAssistantContext({
          routeDecision,
          toolContext: params.session,
          availability,
          nextCursor,
        })

        const stream = await openai.chat.completions.create({
          model: FINAL_MODEL,
          temperature: 0.2,
          stream: true,
          messages: finalMessages,
        })

        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content
          if (text) {
            writeEvent(controller, encoder, 'delta', { text })
          }
        }

        writeEvent(controller, encoder, 'done', {
          assistantContext,
        })
        controller.close()
      } catch (error) {
        writeEvent(controller, encoder, 'error', {
          message: error instanceof Error ? error.message : 'Failed to generate chat response',
        })
        controller.close()
      }
    },
  })
}
