import { geminiProVision } from './gemini'

interface ParsedReceipt {
  merchantName: string
  totalAmount: number
  date: string
  currency: string
  items: { name: string; quantity: number; price: number }[]
}

export async function parseReceipt(imageBase64: string, mimeType: string): Promise<ParsedReceipt> {
  const prompt = `Analyze this receipt image and extract the following information in JSON format:
{
  "merchantName": "store name",
  "totalAmount": total amount as number,
  "date": "YYYY-MM-DD",
  "currency": "SGD" or "INR" or detected currency code,
  "items": [{"name": "item name", "quantity": 1, "price": 10.50}]
}

Only return valid JSON, no markdown or explanation.`

  const result = await geminiProVision.generateContent([
    prompt,
    {
      inlineData: {
        mimeType,
        data: imageBase64,
      },
    },
  ])

  const text = result.response.text()
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(cleaned)
}
