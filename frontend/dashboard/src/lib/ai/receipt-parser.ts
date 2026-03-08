import { geminiProVision } from './gemini'
import {
  clampConfidence,
  coerceDate,
  coerceTime,
  parseNumeric,
} from '@/lib/receipts/normalization'
import type { ParsedReceiptData, ParsedReceiptItem } from '@/lib/receipts/types'

function extractJson(text: string) {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  return start >= 0 && end >= 0 ? cleaned.slice(start, end + 1) : cleaned
}

function normalizeItem(raw: unknown): ParsedReceiptItem | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const name = typeof item.name === 'string' ? item.name.trim() : ''
  if (!name) return null

  const quantity = parseNumeric(item.quantity)
  const unitPrice = parseNumeric(item.unitPrice ?? item.price)
  const lineTotal = parseNumeric(item.lineTotal) ?? (quantity != null && unitPrice != null ? quantity * unitPrice : null)

  return {
    name,
    quantity,
    unitPrice,
    lineTotal,
    discount: parseNumeric(item.discount),
    notes: typeof item.notes === 'string' ? item.notes.trim() : null,
  }
}

function toParsedReceipt(payload: unknown): ParsedReceiptData {
  const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const itemsRaw = Array.isArray(data.items) ? data.items : []
  const items = itemsRaw
    .map((item) => normalizeItem(item))
    .filter((item): item is ParsedReceiptItem => Boolean(item))

  const currency = typeof data.currency === 'string' && data.currency.trim()
    ? data.currency.trim().toUpperCase()
    : 'SGD'

  const warnings = Array.isArray(data.warnings)
    ? data.warnings.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : []

  return {
    merchantName: typeof data.merchantName === 'string' && data.merchantName.trim() ? data.merchantName.trim() : null,
    transactionDate: coerceDate(data.transactionDate ?? data.date),
    paymentTime: coerceTime(data.paymentTime),
    transactionTotal: parseNumeric(data.transactionTotal ?? data.totalAmount),
    paymentInformation: typeof data.paymentInformation === 'string' ? data.paymentInformation.trim() : null,
    paymentType: typeof data.paymentType === 'string' ? data.paymentType.trim() : null,
    paymentBreakdown:
      data.paymentBreakdown && typeof data.paymentBreakdown === 'object'
        ? Object.entries(data.paymentBreakdown as Record<string, unknown>).reduce<Record<string, number>>((acc, [key, value]) => {
            const amount = parseNumeric(value)
            if (amount != null) {
              acc[key] = amount
            }
            return acc
          }, {})
        : null,
    receiptReference: typeof data.receiptReference === 'string' ? data.receiptReference.trim() : null,
    taxAmount: parseNumeric(data.taxAmount),
    currency,
    notes: typeof data.notes === 'string' ? data.notes.trim() : null,
    extractionConfidence: clampConfidence(data.extractionConfidence, 0.55),
    warnings,
    rawExtraction: data,
    items,
  }
}

export async function parseReceipt(imageBase64: string, mimeType: string): Promise<ParsedReceiptData> {
  const prompt = `You extract structured data from shopping receipt images for WealthHouse.

Return only valid JSON using this exact shape:
{
  "merchantName": "string or null",
  "transactionDate": "YYYY-MM-DD or null",
  "paymentTime": "HH:MM:SS or null",
  "transactionTotal": number or null,
  "paymentInformation": "raw payment info from receipt or null",
  "paymentType": "card|cash|wallet|bank_transfer|unknown",
  "paymentBreakdown": {"cash": number, "card": number},
  "receiptReference": "invoice/receipt number or null",
  "taxAmount": number or null,
  "currency": "ISO code",
  "notes": "short notes or null",
  "extractionConfidence": number,
  "warnings": ["missing merchant", "low quality image"],
  "items": [
    {
      "name": "string",
      "quantity": number or null,
      "unitPrice": number or null,
      "lineTotal": number or null,
      "discount": number or null,
      "notes": "string or null"
    }
  ]
}

Rules:
- Do not invent values. Use null when missing.
- Keep numeric values as numbers.
- Confidence can be 0-1 or 0-100.
- If receipt has no clear line items, return an empty array.
- Return JSON only.`

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
  const payload = extractJson(text)

  try {
    return toParsedReceipt(JSON.parse(payload) as unknown)
  } catch {
    return toParsedReceipt({
      merchantName: null,
      transactionDate: null,
      paymentTime: null,
      transactionTotal: null,
      paymentInformation: null,
      paymentType: 'unknown',
      paymentBreakdown: null,
      receiptReference: null,
      taxAmount: null,
      currency: 'SGD',
      notes: 'Parser returned invalid JSON',
      extractionConfidence: 0,
      warnings: ['parser_invalid_json'],
      items: [],
      rawResponse: payload,
    })
  }
}
