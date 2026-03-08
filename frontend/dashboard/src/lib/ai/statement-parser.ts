import { geminiProVision } from './gemini'
import { extractStatementArchiveEntries, isZipArchive } from '@/lib/statements/archive'
import type { ParsedStatementResult } from '@/lib/statements/helpers'

function extractJson(text: string) {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  return start >= 0 && end >= 0 ? cleaned.slice(start, end + 1) : cleaned
}

function isCsvDocument(mimeType: string, fileName?: string) {
  return mimeType === 'text/csv' || fileName?.toLowerCase().endsWith('.csv') === true
}

function createArchiveContext(fileName: string | undefined, archiveEntries: ReturnType<typeof extractStatementArchiveEntries>) {
  const textEntries = archiveEntries.filter((entry) => entry.text)
  const imageEntries = archiveEntries.filter((entry) => entry.mimeType.startsWith('image/'))

  const textPayload = textEntries
    .map((entry) => `--- ${entry.name} ---\n${entry.text}`)
    .join('\n\n')

  const contextLines = [
    `Original file name: ${fileName || 'statement'}`,
    'The uploaded statement is a ZIP archive.',
    `Extracted ${textEntries.length} text page(s) and ${imageEntries.length} image page(s).`,
    'Prefer the extracted TXT/JSON content where present and use the attached page images to complete any missing transaction details.',
  ]

  if (textPayload) {
    contextLines.push(`Extracted text content:\n${textPayload}`)
  }

  return {
    context: contextLines.join('\n\n'),
    imageEntries,
  }
}

export async function parseStatement(
  fileBytes: Buffer,
  mimeType: string,
  fileName?: string,
): Promise<ParsedStatementResult> {
  const prompt = `You extract structured data from bank and credit-card statements for WealthHouse.

Return only valid JSON with this exact shape:
{
  "institution_code": "dbs_bank | dbs_cc | ocbc | uob | trust_bank | wise | unknown",
  "institution_name": "Institution display name",
  "statement_date": "YYYY-MM-DD or null",
  "period_start": "YYYY-MM-DD or null",
  "period_end": "YYYY-MM-DD or null",
  "currency": "SGD or detected ISO currency",
  "summary": "short plain-English summary",
  "summary_json": {
    "credit_limit": number | null,
    "minimum_payment": number | null,
    "payment_due_date": "YYYY-MM-DD or null",
    "grand_total": number | null,
    "opening_balance": number | null,
    "closing_balance": number | null
  },
  "account": {
    "account_type": "savings | current | credit_card | fixed_deposit | investment | crypto_exchange | loan",
    "product_name": "best statement-level product/account name",
    "identifier_hint": "masked account hint or last 4 digits",
    "card_name": "card product name if applicable",
    "card_last4": "last four digits if applicable",
    "currency": "statement account currency"
  },
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "posting_date": "YYYY-MM-DD or null",
      "description": "full normalized description",
      "merchant": "best merchant/payee/payer name or null",
      "amount": number,
      "currency": "ISO currency",
      "statement_type": "specific normalized type",
      "category_hint": "one canonical WealthHouse category",
      "reference": "reference or null",
      "account": {
        "account_type": "savings | current | credit_card | fixed_deposit | investment | crypto_exchange | loan",
        "product_name": "originating account/card name for this transaction",
        "identifier_hint": "masked account hint or last 4 digits for this transaction",
        "card_name": "card name for this transaction if applicable",
        "card_last4": "last four digits for this transaction if applicable",
        "currency": "transaction account currency"
      }
    }
  ]
}

General rules:
- Concatenate multi-line statement descriptions into a single readable description.
- statement_type must be specific, not generic. Prefer values like credit_card_payment, purchase, paynow, fast_transfer, giro, wallet_topup, interest, salary, investment_purchase, investment_sale, refund, fee, cash_deposit, transfer_in, transfer_out, internal_transfer.
- category_hint must be one of these WealthHouse categories only: Groceries, Eating Out, General Household, Transport, Shopping, Kids, Subscriptions, Dining, Flowers / Gifts, Other.
- Skip statement summary rows such as opening balance, carried forward, subtotal, total, grand total, points summaries, and rewards sections.
- Keep transaction amount as a positive absolute value. Direction is encoded by statement_type context and later processing.
- Extract the best account/card product name and identifier hint from the statement header.
- Do not infer duplicates or remove rows just because merchant/date/amount repeat. If the statement shows two separate rows, return two separate transactions.

DBS-specific rules:
- DBS consolidated bank statements contain multiple account blocks. Extract transactions only from the transaction details section.
- DBS credit-card statements may contain multiple card sections. Each transaction must include the card/account block it belongs to in transactions[].account.
- For DBS bank lines with FAST Payment / Receipt, inspect continuation lines and classify as paynow, transfer_in, transfer_out, or internal_transfer instead of a generic payment.
- TOP-UP TO PAYLAH! is wallet_topup and category Other.
- Funds Transfer between own accounts is internal_transfer and category Other.
- Interest is interest and category Other.
- Buy - ... is investment_purchase and category Other; Sell - ... is investment_sale and category Other.
- DBS credit-card rows with PAYMENT - ... or amounts suffixed with CR are credit_card_payment or refund, not purchases, and category Other unless the merchant context clearly indicates something else.
- Standard DBS credit-card merchant spend rows should have category hints inferred from the merchant, for example GOPAY-GOJEK -> Transport, BUS/MRT -> Transport, SP DIGITAL -> Other, YA KUN / TOAST BOX / OLD CHANG KEE -> Eating Out, SHENG SIONG / NTUC / U STARS -> Groceries, OPENAI / NETFLIX / CIRCLES.LIFE -> Subscriptions.

If you cannot confidently detect a field, use null or unknown rather than inventing data.`

  const promptParts: Array<string | { inlineData: { mimeType: string; data: string } }> = [prompt]

  if (isZipArchive(fileBytes) || mimeType.includes('zip') || fileName?.toLowerCase().endsWith('.zip')) {
    const archiveEntries = extractStatementArchiveEntries(fileBytes)
    if (archiveEntries.length === 0) {
      throw new Error('The uploaded ZIP statement does not contain any supported TXT, JSON, or image pages.')
    }

    const archiveContext = createArchiveContext(fileName, archiveEntries)
    promptParts.push(archiveContext.context)
    promptParts.push(
      ...archiveContext.imageEntries.map((entry) => ({
        inlineData: {
          mimeType: entry.mimeType,
          data: entry.data.toString('base64'),
        },
      })),
    )
  } else if (isCsvDocument(mimeType, fileName)) {
    promptParts.push(`Original file name: ${fileName || 'statement.csv'}`)
    promptParts.push('The uploaded statement is CSV text. Use the CSV rows directly instead of OCR.')
    promptParts.push(fileBytes.toString('utf8'))
  } else {
    promptParts.push({
      inlineData: {
        mimeType,
        data: fileBytes.toString('base64'),
      },
    })
  }

  const result = await geminiProVision.generateContent(promptParts)

  const text = result.response.text()
  const payload = extractJson(text)

  try {
    return JSON.parse(payload) as ParsedStatementResult
  } catch (error) {
    console.error('Failed to parse statement JSON from AI response:', payload, error)
    return {
      institution_code: 'unknown',
      institution_name: null,
      statement_date: null,
      period_start: null,
      period_end: null,
      currency: 'SGD',
      summary: 'Unable to parse statement output',
      summary_json: null,
      account: null,
      transactions: [],
    }
  }
}
