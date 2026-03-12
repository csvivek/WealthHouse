export const STATEMENT_LINKING_ERROR_CODES = {
  SCHEMA_NOT_READY: 'statement_linking_schema_not_ready',
} as const

const APPROVED_MAPPING_STATUS_VALUES = ['confirmed', 'approved', 'auto_approved'] as const
const WRITABLE_APPROVED_MAPPING_STATUS_VALUES = ['confirmed', 'approved'] as const

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

export function isApprovedMappingStatus(value: unknown) {
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  return APPROVED_MAPPING_STATUS_VALUES.some((status) => status === normalized)
}

export function isInvalidMappingStatusValueError(error: unknown, value: string) {
  const code = readErrorCode(error)
  const message = readErrorText(error)
  const normalized = value.trim().toLowerCase()

  if (code !== '22P02' || !message.includes('mapping_status')) return false
  return message.includes(`"${normalized}"`) || message.includes(`'${normalized}'`) || message.includes(normalized)
}

export function rewriteApprovedMappingStatus(
  status: unknown,
  approvedStatus: (typeof WRITABLE_APPROVED_MAPPING_STATUS_VALUES)[number],
) {
  if (!isApprovedMappingStatus(status)) {
    return typeof status === 'string' ? status : null
  }

  return approvedStatus
}

export async function withApprovedMappingStatusFallback<T extends { error?: unknown | null }>(
  run: (approvedStatus: (typeof WRITABLE_APPROVED_MAPPING_STATUS_VALUES)[number]) => PromiseLike<T>,
) {
  const result = await run('confirmed')
  if (!isInvalidMappingStatusValueError(result?.error, 'confirmed')) {
    return result
  }

  return run('approved')
}

export function isStatementLinkingSchemaNotReadyError(error: unknown, requiredTable = 'staging_transaction_links') {
  if (!error) return false

  const code = readErrorCode(error)
  const message = readErrorText(error)
  const required = requiredTable.toLowerCase()
  const mentionsRequired =
    message.includes(required) ||
    message.includes(`public.${required}`) ||
    message.includes(`'${required}'`) ||
    message.includes(`"${required}"`) ||
    message.includes(`relation "${required}"`)

  if (
    (code === 'PGRST200' || code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42703') &&
    mentionsRequired
  ) {
    return true
  }

  if (message.includes('schema cache') && mentionsRequired) return true
  if (message.includes(`could not find the table 'public.${required}'`)) return true
  if (message.includes(`relation "public.${required}" does not exist`)) return true
  if (message.includes(`column ${required}.`) && message.includes('does not exist')) return true
  if (message.includes(`column public.${required}.`) && message.includes('does not exist')) return true
  if (message.includes(`relation "${required}"`) && message.includes('column') && message.includes('does not exist')) return true
  if (message.includes(`of '${required}'`) && message.includes('column')) return true
  if (message.includes(`of "${required}"`) && message.includes('column')) return true

  if (required === 'transaction_links' && (code === '42P10' || message.includes('on conflict specification'))) {
    return true
  }

  return false
}

export function statementLinkingSchemaNotReadyWarning() {
  return 'Statement committed, but transaction links were skipped because staging link support is not deployed in this Supabase environment.'
}
