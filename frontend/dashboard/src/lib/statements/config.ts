export const DEFAULT_STATEMENTS_BUCKET = 'statements'
export const STATEMENT_SIGNED_URL_TTL_SECONDS = 60

type SupabaseLikeError = {
  message?: string | null
  details?: string | null
  code?: string | null
  status?: number | null
  statusCode?: number | null
} | null

export const STATEMENT_STORAGE_ERROR_CODES = {
  BUCKET_MISSING: 'statement_storage_bucket_missing',
  ACCESS_DENIED: 'statement_storage_access_denied',
  STORAGE_FAILED: 'statement_storage_failed',
} as const

export function getStatementsBucket() {
  return process.env.STATEMENTS_BUCKET?.trim() || DEFAULT_STATEMENTS_BUCKET
}

export function assertStatementStorageConfig() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Statement storage configuration is missing.')
  }
}

export function toSafeStatementStorageFilename(original: string) {
  const cleaned = original
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  return cleaned || `statement-${Date.now()}`
}

export function mapStatementStorageErrorMessage(message: string) {
  const lower = message.toLowerCase()

  if (lower.includes('bucket') && lower.includes('not found')) {
    return {
      code: STATEMENT_STORAGE_ERROR_CODES.BUCKET_MISSING,
      userMessage: 'Statement storage bucket is missing. Create the `statements` bucket in Supabase storage.',
      status: 503,
    }
  }

  if (lower.includes('permission') || lower.includes('forbidden') || lower.includes('not authorized')) {
    return {
      code: STATEMENT_STORAGE_ERROR_CODES.ACCESS_DENIED,
      userMessage: 'You do not have permission to access statement storage.',
      status: 403,
    }
  }

  return {
    code: STATEMENT_STORAGE_ERROR_CODES.STORAGE_FAILED,
    userMessage: 'Failed to access statement storage.',
    status: 500,
  }
}

export function isStatementStorageSchemaNotReadyError(
  error: SupabaseLikeError,
  requiredTable = 'file_imports',
) {
  if (!error) return false

  const message = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  if (error.code === 'PGRST205') return true
  if (message.includes('schema cache') && message.includes(requiredTable)) return true
  if (message.includes(`could not find the table 'public.${requiredTable}'`)) return true
  if (message.includes(`column ${requiredTable}.storage_bucket does not exist`)) return true
  if (message.includes(`column public.${requiredTable}.storage_bucket does not exist`)) return true
  if (message.includes(`column ${requiredTable}.storage_path does not exist`)) return true
  if (message.includes(`column public.${requiredTable}.storage_path does not exist`)) return true
  if (message.includes(`could not find the 'storage_bucket' column of '${requiredTable}'`)) return true
  if (message.includes(`could not find the 'storage_path' column of '${requiredTable}'`)) return true

  return false
}

export async function ensureStatementsBucket(serviceSupabase: {
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
