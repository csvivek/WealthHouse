import { openai } from './openai'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const KNOWLEDGE_PATH = join(process.cwd(), 'knowledge', 'categories.md')

interface CategorizationResult {
  category: string
  confidence: number
  needsConfirmation: boolean
}

function loadKnowledge(): string {
  if (existsSync(KNOWLEDGE_PATH)) {
    return readFileSync(KNOWLEDGE_PATH, 'utf-8')
  }
  return ''
}

export function addToKnowledge(merchant: string, category: string) {
  const knowledge = loadKnowledge()
  const newEntry = `| ${merchant} | ${category} | 100% | user-confirmed |`
  const updated = knowledge.replace(
    '## User Corrections Log',
    `${newEntry}\n\n## User Corrections Log`
  )
  writeFileSync(KNOWLEDGE_PATH, updated, 'utf-8')
}

export async function categorizeTransaction(
  merchantName: string,
  amount: number,
  description?: string,
  availableCategories?: { id: number | string; name: string }[]
): Promise<CategorizationResult> {
  const knowledge = loadKnowledge()

  const systemPrompt = `You are a financial transaction categorization agent for a Singapore/India-focused personal finance app called WealthHouse.

Your job is to categorize transactions into the correct spending category.

Here is your knowledge base of known merchant-to-category mappings:
${knowledge}

Available categories: ${availableCategories?.map(c => c.name).join(', ') || 'Groceries, Dining, Transportation, Utilities, Entertainment, Shopping, Health, Subscriptions, Salary, Investment Income, Freelance, Housing'}

Rules:
- If the merchant is in your knowledge base with high confidence, use that mapping
- For new merchants, infer the category from the merchant name and transaction details
- Return a confidence score from 0 to 100
- If confidence is below 90, set needsConfirmation to true

Respond with ONLY valid JSON: {"category": "string", "confidence": number, "needsConfirmation": boolean}`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Merchant: ${merchantName}\nAmount: ${amount}\nDescription: ${description || 'N/A'}` },
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  })

  const result = JSON.parse(response.choices[0].message.content || '{}')
  return {
    category: result.category || 'Uncategorized',
    confidence: result.confidence || 0,
    needsConfirmation: result.needsConfirmation ?? result.confidence < 90,
  }
}
