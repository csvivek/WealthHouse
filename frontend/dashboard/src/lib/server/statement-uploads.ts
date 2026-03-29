import type { Database } from '@/types/database'

export type StatementUploadStatus =
  | 'queued'
  | 'parsing'
  | 'needs_account_resolution'
  | 'completed'
  | 'duplicate'
  | 'failed'

export interface StatementUploadImportSummary {
  importId: string
  importLabel: string
  accountLabel: string | null
  reviewUrl: string
  status: string
}

export interface StatementUploadCompletedResult {
  statementUploadId: string
  status: 'completed'
  importCount: number
  transactionsCount: number
  duplicateCount: number
  imports: StatementUploadImportSummary[]
  reviewUrl: string | null
}

export interface StatementUploadPausedResult {
  statementUploadId: string
  status: 'needs_account_resolution'
  parseSessionId: string
  imports: []
  importCount: 0
  transactionsCount: 0
  duplicateCount: 0
  reviewUrl: null
}

export type StatementUploadProcessResult =
  | StatementUploadCompletedResult
  | StatementUploadPausedResult

type FileImportRow = Database['public']['Tables']['file_imports']['Row']

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readMatchedAccountLabel(rawParseResult: Record<string, unknown> | null) {
  const matches = Array.isArray(rawParseResult?.matched_accounts) ? rawParseResult.matched_accounts : []

  for (const entry of matches) {
    const object = readObject(entry)
    const label = readString(object?.label)
    if (label) {
      return label
    }
  }

  return null
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function extractImportIdFromReviewUrl(reviewUrl: string) {
  const match = reviewUrl.match(/\/statements\/review\/([^/?#]+)/)
  return match?.[1] ?? null
}

export function buildStatementUploadImportSummary(fileImport: Pick<FileImportRow, 'id' | 'file_name' | 'status' | 'raw_parse_result'>) {
  const rawParseResult = readObject(fileImport.raw_parse_result)
  const accountLabel = readMatchedAccountLabel(rawParseResult)
  const importLabel = readString(rawParseResult?.import_label) || accountLabel || fileImport.file_name

  return {
    importId: fileImport.id,
    importLabel,
    accountLabel,
    reviewUrl: `/statements/review/${fileImport.id}`,
    status: fileImport.status,
  } satisfies StatementUploadImportSummary
}

export async function listStatementUploadImports(params: {
  supabase: any
  statementUploadId: string
  householdId: string
}) {
  const { data, error } = await params.supabase
    .from('file_imports')
    .select('id, file_name, status, raw_parse_result')
    .eq('statement_upload_id', params.statementUploadId)
    .eq('household_id', params.householdId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(error.message || 'Failed to load imports for statement upload')
  }

  return ((data ?? []) as Array<Pick<FileImportRow, 'id' | 'file_name' | 'status' | 'raw_parse_result'>>)
    .map(buildStatementUploadImportSummary)
}

export async function listStatementUploadImportsByFileHash(params: {
  supabase: any
  householdId: string
  fileSha256: string
}) {
  const { data, error } = await params.supabase
    .from('file_imports')
    .select('id, file_name, status, raw_parse_result')
    .eq('household_id', params.householdId)
    .eq('file_sha256', params.fileSha256)
    .neq('status', 'duplicate')
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(error.message || 'Failed to load imports for statement upload hash')
  }

  return ((data ?? []) as Array<Pick<FileImportRow, 'id' | 'file_name' | 'status' | 'raw_parse_result'>>)
    .map(buildStatementUploadImportSummary)
}

export function listStatementUploadImportsFromResultPayload(params: {
  resultPayload: unknown
  fallbackFileName: string
  fallbackStatus: string
}) {
  const payload = readObject(params.resultPayload)
  const payloadImports = Array.isArray(payload?.imports) ? payload.imports : []

  const imports = payloadImports
    .map((entry) => {
      const object = readObject(entry)
      const reviewUrl = readString(object?.reviewUrl)
      const importId = readString(object?.importId) ?? (reviewUrl ? extractImportIdFromReviewUrl(reviewUrl) : null)
      if (!reviewUrl || !importId) return null

      return {
        importId,
        importLabel: readString(object?.importLabel) || params.fallbackFileName,
        accountLabel: readString(object?.accountLabel),
        reviewUrl,
        status: readString(object?.status) || params.fallbackStatus,
      } satisfies StatementUploadImportSummary
    })
    .filter((entry): entry is StatementUploadImportSummary => entry !== null)

  if (imports.length > 0) {
    return imports
  }

  const reviewUrl = readString(payload?.reviewUrl)
  const importCount = readNumber(payload?.importCount)
  const importId = reviewUrl ? extractImportIdFromReviewUrl(reviewUrl) : null

  if (!reviewUrl || !importId || (importCount !== null && importCount !== 1)) {
    return []
  }

  return [{
    importId,
    importLabel: params.fallbackFileName,
    accountLabel: null,
    reviewUrl,
    status: params.fallbackStatus,
  }] satisfies StatementUploadImportSummary[]
}

export function readStatementUploadImportCount(resultPayload: unknown) {
  const payload = readObject(resultPayload)
  return readNumber(payload?.importCount)
}

export async function loadStatementUploadByHash(params: {
  supabase: any
  householdId: string
  fileSha256: string
}) {
  const query = params.supabase
    .from('statement_uploads')
    .select('*')
    .eq('household_id', params.householdId)
    .eq('file_sha256', params.fileSha256)
    .order('created_at', { ascending: false })
    .limit(1)
  const { data, error } = await (
    typeof query.maybeSingle === 'function'
      ? query.maybeSingle()
      : query.single()
  )

  if (error) {
    throw new Error(error.message || 'Failed to load statement upload')
  }

  return data as Record<string, unknown> | null
}

export async function loadStatementUpload(params: {
  supabase: any
  statementUploadId: string
  householdId: string
}) {
  const query = params.supabase
    .from('statement_uploads')
    .select('*')
    .eq('id', params.statementUploadId)
    .eq('household_id', params.householdId)
  const { data, error } = await (
    typeof query.maybeSingle === 'function'
      ? query.maybeSingle()
      : query.single()
  )

  if (error) {
    throw new Error(error.message || 'Failed to load statement upload')
  }

  return data as Record<string, unknown> | null
}
