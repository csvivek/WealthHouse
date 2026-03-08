import { RECEIPT_ERROR_CODES, type ReceiptErrorCode } from '@/lib/receipts/types'

export const DEFAULT_RECEIPTS_BUCKET = 'receipts'
export const RECEIPT_MAX_BYTES = 15 * 1024 * 1024

const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf']

type SupabaseLikeError = {
  message?: string | null
  details?: string | null
  code?: string | null
  status?: number | null
  statusCode?: number | null
} | null

export class ReceiptApiError extends Error {
  status: number
  code: ReceiptErrorCode

  constructor(code: ReceiptErrorCode, message: string, status: number) {
    super(message)
    this.name = 'ReceiptApiError'
    this.code = code
    this.status = status
  }
}

export function getReceiptsBucket() {
  return process.env.RECEIPTS_BUCKET?.trim() || DEFAULT_RECEIPTS_BUCKET
}

export function assertReceiptConfig() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new ReceiptApiError(RECEIPT_ERROR_CODES.BUCKET_ACCESS_DENIED, 'Supabase configuration is missing.', 503)
  }
}

export function validateReceiptFile(file: File) {
  if (!file || file.size <= 0) {
    throw new ReceiptApiError(RECEIPT_ERROR_CODES.INVALID_FILE, 'Receipt file is required.', 400)
  }

  if (file.size > RECEIPT_MAX_BYTES) {
    throw new ReceiptApiError(
      RECEIPT_ERROR_CODES.INVALID_FILE,
      `Receipt file is too large. Maximum size is ${Math.round(RECEIPT_MAX_BYTES / (1024 * 1024))}MB.`,
      422,
    )
  }

  const mimeType = file.type || 'application/octet-stream'
  const isAllowed = ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))

  if (!isAllowed) {
    throw new ReceiptApiError(
      RECEIPT_ERROR_CODES.INVALID_FILE,
      'Unsupported file type. Upload an image or PDF receipt.',
      422,
    )
  }
}

export function toSafeStorageFilename(original: string) {
  const cleaned = original
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  return cleaned || `receipt-${Date.now()}`
}

export function mapStorageErrorMessage(message: string) {
  const lower = message.toLowerCase()
  if (lower.includes('bucket') && lower.includes('not found')) {
    return {
      code: RECEIPT_ERROR_CODES.BUCKET_MISSING,
      userMessage: 'Receipt storage bucket is missing. Create the `receipts` bucket in Supabase storage.',
      status: 503,
    }
  }

  if (lower.includes('permission') || lower.includes('forbidden') || lower.includes('not authorized')) {
    return {
      code: RECEIPT_ERROR_CODES.BUCKET_ACCESS_DENIED,
      userMessage: 'You do not have permission to upload to receipt storage.',
      status: 403,
    }
  }

  return {
    code: RECEIPT_ERROR_CODES.UPLOAD_FAILED,
    userMessage: 'Failed to upload receipt to storage.',
    status: 500,
  }
}

export function isReceiptSchemaNotReadyError(error: SupabaseLikeError, requiredTable = 'receipt_uploads') {
  if (!error) return false

  const message = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  if (error.code === 'PGRST205') return true
  if (message.includes('schema cache') && message.includes(`public.${requiredTable}`)) return true
  if (message.includes(`could not find the table 'public.${requiredTable}'`)) return true
  if (message.includes('column receipts.household_id does not exist')) return true

  return false
}

export function receiptSchemaNotReadyResponse(requiredTable = 'receipt_uploads') {
  return {
    error: 'Receipt ingestion schema is not deployed in this Supabase environment.',
    code: RECEIPT_ERROR_CODES.SCHEMA_NOT_READY,
    action: `Run migration \`005_receipt_ingestion_and_intelligence.sql\` (or \`frontend/dashboard/supabase/migrations/004_receipt_ingestion_and_intelligence.sql\`) so table \`public.${requiredTable}\` exists.`,
  }
}

export async function ensureReceiptsBucket(serviceSupabase: {
  storage: {
    getBucket: (bucket: string) => Promise<{ data: unknown; error: SupabaseLikeError }>
    createBucket: (bucket: string, options: { public: boolean }) => Promise<{ data: unknown; error: SupabaseLikeError }>
  }
}, bucket: string) {
  const { data, error } = await serviceSupabase.storage.getBucket(bucket)
  if (data && !error) {
    return { ok: true as const, created: false }
  }

  const lower = `${error?.message ?? ''}`.toLowerCase()
  const notFound =
    error?.status === 404 ||
    error?.statusCode === 404 ||
    (lower.includes('bucket') && lower.includes('not found'))

  if (!notFound) {
    return { ok: false as const, error }
  }

  const { error: createError } = await serviceSupabase.storage.createBucket(bucket, { public: false })
  if (!createError) {
    return { ok: true as const, created: true }
  }

  const createLower = `${createError.message ?? ''}`.toLowerCase()
  if (createLower.includes('already exists')) {
    return { ok: true as const, created: false }
  }

  return { ok: false as const, error: createError }
}
