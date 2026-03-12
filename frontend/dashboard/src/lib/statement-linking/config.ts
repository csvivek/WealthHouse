export const STATEMENT_LINKING_ERROR_CODES = {
  SCHEMA_NOT_READY: 'statement_linking_schema_not_ready',
} as const

type SupabaseLikeError = {
  message?: string | null
  details?: string | null
  hint?: string | null
  code?: string | null
  status?: number | null
  statusCode?: number | null
} | Error | null | undefined

function asSupabaseLikeError(error: unknown): SupabaseLikeError {
  if (!error) return null
  if (error instanceof Error) return error
  if (typeof error === 'object') return error as SupabaseLikeError
  return { message: String(error) }
}

function readErrorText(error: unknown) {
  const value = asSupabaseLikeError(error)
  if (!value) return ''

  if (value instanceof Error) {
    return `${value.message ?? ''}`.toLowerCase()
  }

  return `${value.message ?? ''} ${value.details ?? ''} ${value.hint ?? ''}`.toLowerCase()
}

function readErrorCode(error: unknown) {
  const value = asSupabaseLikeError(error)
  if (!value || value instanceof Error) return null
  return value.code ?? null
}

export function isStatementLinkingSchemaNotReadyError(error: unknown, requiredTable = 'staging_transaction_links') {
  if (!error) return false

  const code = readErrorCode(error)
  const message = readErrorText(error)
  const required = requiredTable.toLowerCase()
  const mentionsRequired = message.includes(required) || message.includes(`public.${required}`)

  if ((code === 'PGRST205' || code === '42P01') && mentionsRequired) {
    return true
  }

  if (message.includes('schema cache') && mentionsRequired) return true
  if (message.includes(`could not find the table 'public.${required}'`)) return true
  if (message.includes(`relation "public.${required}" does not exist`)) return true

  return false
}

export function statementLinkingSchemaNotReadyWarning() {
  return 'Statement committed, but transaction links were skipped because staging link support is not deployed in this Supabase environment.'
}
