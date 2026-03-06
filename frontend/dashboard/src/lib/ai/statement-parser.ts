import { geminiProVision } from './gemini'

export interface ParsedStatement {
  institution_code?: string
  statement_date?: string
  period_start?: string
  period_end?: string
  summary?: string
  transactions?: Array<{ date?: string; description?: string; amount?: number }>
}

export async function parseStatement(
  fileBase64: string,
  mimeType: string
): Promise<ParsedStatement> {
  const prompt = `You are an assistant that extracts structured data from bank or credit card statements.  
The input will be provided as a Base64‑encoded file (PDF, image, text, etc.).  
Return a JSON object with the following shape, and nothing else (no markdown, explanation, or extraneous fields):
{
  "institution_code": "short code like DBS, OCBC, UOB, etc.",
  "statement_date": "YYYY-MM-DD",
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "summary": "brief one‑sentence summary or empty string",
  "transactions": [
    {"date":"YYYY-MM-DD","description":"...","amount":123.45}
  ]
}

If you cannot find any transactions, use an empty array for transactions.  
Be conservative with the dates and amounts; ensure they are in the specified formats.  
`;  

  const result = await geminiProVision.generateContent([
    prompt,
    {
      inlineData: {
        mimeType,
        data: fileBase64,
      },
    },
  ])

  const text = result.response.text()
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch (err) {
    console.error('Failed to parse statement JSON from AI response:', cleaned, err)
    return {} as ParsedStatement
  }
}
