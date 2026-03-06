import { openai } from './openai'

interface FinancialContext {
  accounts?: { name: string; type: string; currency?: string }[]
  recentTransactions?: { merchant_display: string | null; amount: number; txn_date: string }[]
  holdings?: { symbol: string; balance: number }[]
}

export async function getFinancialAdvice(
  userMessage: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  context: FinancialContext
): Promise<string> {
  const systemPrompt = `You are WealthHouse AI, a personal financial advisor for users primarily based in Singapore and India.

You have access to the user's real financial data (provided below). Use it to give specific, personalized advice.

User's Financial Summary:

Accounts: ${context.accounts?.map(a => `${a.name} (${a.type}, ${a.currency ?? 'SGD'})`).join(', ') || 'None linked'}

Recent Transactions: ${context.recentTransactions?.slice(0, 10).map(t => `${t.merchant_display}: S$${t.amount} on ${t.txn_date}`).join(', ') || 'None'}

Holdings: ${context.holdings?.map(h => `${h.symbol} (S$${h.balance.toLocaleString()})`).join(', ') || 'None'}

Guidelines:
- Be concise but helpful
- Reference specific numbers from their data when relevant
- Use SGD (S$) as the primary currency
- Consider Singapore/India tax laws, CPF, EPF, HDB, and local financial products when relevant
- If you don't have enough data to answer, suggest what the user should set up first
- Never give specific stock/crypto buy/sell recommendations
- Always mention this is general guidance, not licensed financial advice`

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: userMessage },
  ]

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    temperature: 0.7,
    max_tokens: 800,
  })

  return response.choices[0].message.content || 'I apologize, I was unable to process your request. Please try again.'
}
