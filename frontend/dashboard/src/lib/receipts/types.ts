export type ReceiptUploadStatus =
  | 'uploaded'
  | 'parsing'
  | 'needs_review'
  | 'ready_for_approval'
  | 'committed'
  | 'failed'

export type ReceiptReviewStatus = 'pending' | 'needs_review' | 'ready' | 'approved' | 'committed' | 'failed'

export type ReceiptDuplicateStatus =
  | 'suggested'
  | 'user_confirmed_duplicate'
  | 'user_marked_distinct'
  | 'dismissed'

export type ReceiptClassificationSource = 'knowledge_base' | 'heuristic' | 'web' | 'llm' | 'user' | 'mixed'

export interface ParsedReceiptItem {
  name: string
  quantity: number | null
  unitPrice: number | null
  lineTotal: number | null
  discount: number | null
  notes?: string | null
}

export interface ParsedReceiptData {
  merchantName: string | null
  transactionDate: string | null
  paymentTime: string | null
  transactionTotal: number | null
  paymentInformation: string | null
  paymentType: string | null
  paymentBreakdown: Record<string, number> | null
  receiptReference: string | null
  taxAmount: number | null
  currency: string
  notes: string | null
  extractionConfidence: number
  warnings: string[]
  rawExtraction: Record<string, unknown>
  items: ParsedReceiptItem[]
}

export interface ReceiptClassificationItemResult {
  stagingItemId: string
  categoryId: string | null
  categoryName: string | null
  source: ReceiptClassificationSource
  confidence: number
  rationale: string | null
}

export interface ReceiptClassificationResult {
  source: ReceiptClassificationSource
  confidence: number
  categoryId: string | null
  categoryName: string | null
  isMixedBasket: boolean
  rationale: string | null
  webSummary: string | null
  version: string
  itemResults: ReceiptClassificationItemResult[]
}

export const RECEIPT_ERROR_CODES = {
  SCHEMA_NOT_READY: 'receipt_schema_not_ready',
  BUCKET_MISSING: 'receipt_bucket_missing',
  BUCKET_ACCESS_DENIED: 'receipt_bucket_access_denied',
  INVALID_FILE: 'receipt_upload_invalid_file',
  UPLOAD_FAILED: 'receipt_upload_failed',
} as const

export type ReceiptErrorCode = (typeof RECEIPT_ERROR_CODES)[keyof typeof RECEIPT_ERROR_CODES]
