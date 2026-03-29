/**
 * CSV import utilities for batch receipt ingestion.
 * Handles parsing, validation, and template generation.
 */

export interface CsvItemRow {
  name: string
  quantity: number | null
  unit_price: number | null
  line_total: number | null
  discount: number | null
  notes: string | null
}

export interface CsvReceiptRow {
  merchant_name: string
  txn_date: string // YYYY-MM-DD
  total_amount: number
  currency: string
  payment_type: string | null
  payment_information: string | null
  receipt_reference: string | null
  tax_amount: number | null
  notes: string | null
  merchant_address: string | null
  merchant_phone: string | null
  items_json: CsvItemRow[] | null
}

export interface CsvParseResult {
  valid: CsvReceiptRow[]
  errors: { row: number; message: string }[]
}

const ALLOWED_PAYMENT_TYPES = new Set(['card', 'cash', 'wallet', 'bank_transfer', 'unknown'])

const EXPECTED_HEADERS = [
  'merchant_name',
  'txn_date',
  'total_amount',
  'currency',
  'payment_type',
  'payment_information',
  'receipt_reference',
  'tax_amount',
  'notes',
]

const OPTIONAL_HEADERS = ['merchant_address', 'merchant_phone', 'items_json']

/**
 * Parse a single CSV line, respecting double-quoted fields that may contain commas.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped double-quote inside quoted field
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

function normalizeCsvItem(raw: unknown): CsvItemRow | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const name = typeof item.name === 'string' ? item.name.trim() : ''
  if (!name) return null
  return {
    name,
    quantity: typeof item.quantity === 'number' ? item.quantity : null,
    unit_price: typeof item.unit_price === 'number' ? item.unit_price : null,
    line_total: typeof item.line_total === 'number' ? item.line_total : null,
    discount: typeof item.discount === 'number' ? item.discount : null,
    notes: typeof item.notes === 'string' ? item.notes.trim() : null,
  }
}

/**
 * Parse raw CSV text into validated CsvReceiptRow records.
 * The first non-blank line must be a header row matching EXPECTED_HEADERS.
 * Optional columns (merchant_address, merchant_phone, items_json) are detected
 * automatically and parsed if present.
 */
export function parseCsvReceipts(csvText: string): CsvParseResult {
  const lines = csvText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)

  if (lines.length === 0) {
    return { valid: [], errors: [{ row: 0, message: 'CSV file is empty.' }] }
  }

  // Validate header row
  const headerFields = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'))
  const missingHeaders = EXPECTED_HEADERS.filter(h => !headerFields.includes(h))
  if (missingHeaders.length > 0) {
    return {
      valid: [],
      errors: [{ row: 1, message: `Missing required columns: ${missingHeaders.join(', ')}` }],
    }
  }

  // Build column index map for required headers
  const colIndex: Record<string, number> = {}
  for (const header of EXPECTED_HEADERS) {
    colIndex[header] = headerFields.indexOf(header)
  }

  // Detect and map optional headers
  for (const header of OPTIONAL_HEADERS) {
    const idx = headerFields.indexOf(header)
    if (idx >= 0) colIndex[header] = idx
  }

  const valid: CsvReceiptRow[] = []
  const errors: { row: number; message: string }[] = []

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1 // 1-based, accounting for header
    const fields = parseCsvLine(lines[i])

    const get = (col: string): string => (fields[colIndex[col]] ?? '').trim()

    // Required: merchant_name
    const merchant_name = get('merchant_name')
    if (!merchant_name) {
      errors.push({ row: rowNumber, message: 'merchant_name is required.' })
      continue
    }

    // Required: txn_date (YYYY-MM-DD)
    const txn_date = get('txn_date')
    if (!txn_date) {
      errors.push({ row: rowNumber, message: 'txn_date is required.' })
      continue
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(txn_date)) {
      errors.push({ row: rowNumber, message: `txn_date must be YYYY-MM-DD format (got "${txn_date}").` })
      continue
    }
    const parsedDate = new Date(txn_date)
    if (isNaN(parsedDate.getTime())) {
      errors.push({ row: rowNumber, message: `txn_date "${txn_date}" is not a valid date.` })
      continue
    }

    // Required: total_amount
    const totalStr = get('total_amount')
    if (!totalStr) {
      errors.push({ row: rowNumber, message: 'total_amount is required.' })
      continue
    }
    const total_amount = Number(totalStr)
    if (isNaN(total_amount) || total_amount <= 0) {
      errors.push({ row: rowNumber, message: `total_amount must be a positive number (got "${totalStr}").` })
      continue
    }

    // Optional: currency
    const currencyRaw = get('currency')
    const currency = currencyRaw || 'SGD'

    // Optional: payment_type
    const paymentTypeRaw = get('payment_type') || null
    if (paymentTypeRaw && !ALLOWED_PAYMENT_TYPES.has(paymentTypeRaw)) {
      errors.push({
        row: rowNumber,
        message: `payment_type "${paymentTypeRaw}" is not valid. Use: card, cash, wallet, bank_transfer, unknown.`,
      })
      continue
    }

    // Optional: tax_amount
    const taxStr = get('tax_amount')
    let tax_amount: number | null = null
    if (taxStr) {
      const parsed = Number(taxStr)
      if (isNaN(parsed)) {
        errors.push({ row: rowNumber, message: `tax_amount "${taxStr}" is not a valid number.` })
        continue
      }
      tax_amount = parsed
    }

    // Optional: merchant_address, merchant_phone
    const merchant_address = colIndex['merchant_address'] != null ? get('merchant_address') || null : null
    const merchant_phone = colIndex['merchant_phone'] != null ? get('merchant_phone') || null : null

    // Optional: items_json — JSON array of line items
    let items_json: CsvItemRow[] | null = null
    if (colIndex['items_json'] != null) {
      const itemsRaw = get('items_json')
      if (itemsRaw) {
        try {
          const parsed = JSON.parse(itemsRaw) as unknown
          if (Array.isArray(parsed)) {
            items_json = parsed.map(normalizeCsvItem).filter((item): item is CsvItemRow => item !== null)
          }
        } catch {
          errors.push({ row: rowNumber, message: `items_json on row ${rowNumber} is not valid JSON.` })
          continue
        }
      }
    }

    valid.push({
      merchant_name,
      txn_date,
      total_amount,
      currency,
      payment_type: paymentTypeRaw,
      payment_information: get('payment_information') || null,
      receipt_reference: get('receipt_reference') || null,
      tax_amount,
      notes: get('notes') || null,
      merchant_address,
      merchant_phone,
      items_json,
    })
  }

  return { valid, errors }
}

/**
 * Generate the downloadable CSV template string with example rows.
 * Includes optional columns (merchant_address, merchant_phone, items_json).
 */
export function generateCsvTemplate(): string {
  const headers = [...EXPECTED_HEADERS, ...OPTIONAL_HEADERS].join(',')

  const example1 = [
    'Cold Storage',
    '2024-01-15',
    '45.80',
    'SGD',
    'card',
    'Visa ending 4242',
    'INV-001',
    '4.00',
    'Weekly grocery shopping',
    '"123 Orchard Road, Singapore 238839"',
    '+65-6737-1234',
    '"[{""name"":""Milk 1L"",""quantity"":2,""unit_price"":3.50,""line_total"":7.00},{""name"":""Bread"",""quantity"":1,""unit_price"":3.80,""line_total"":3.80}]"',
  ].join(',')

  const example2 = [
    'Ya Kun Kaya Toast',
    '2024-01-16',
    '12.50',
    'SGD',
    'cash',
    '',
    '',
    '',
    'Coffee and toast',
    '',
    '',
    '',
  ]
    .map(v => (v.includes(',') ? `"${v}"` : v))
    .join(',')

  const example3 = [
    'Grab Transport',
    '2024-01-17',
    '18.30',
    'SGD',
    'wallet',
    'GrabPay',
    '',
    '',
    '"Airport ride, includes surcharge"',
    '',
    '',
    '',
  ].join(',')

  return [headers, example1, example2, example3].join('\n') + '\n'
}
