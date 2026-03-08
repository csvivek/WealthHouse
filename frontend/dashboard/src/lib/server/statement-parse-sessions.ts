/* eslint-disable @typescript-eslint/no-explicit-any */

function isMissingParseSessionTableError(error: any) {
  const message = typeof error?.message === 'string' ? error.message : ''
  return error?.code === 'PGRST205' || error?.code === '42P01' || message.includes('statement_parse_sessions')
}

const STATEMENT_PARSE_SESSIONS_TABLE = 'statement_parse_sessions'

export const STATEMENT_PARSE_SESSION_STATUS = {
  NEEDS_ACCOUNT_RESOLUTION: 'needs_account_resolution',
  RESOLVED: 'resolved',
  EXPIRED: 'expired',
} as const

export class StatementParseSessionSchemaError extends Error {
  constructor(message = 'statement_parse_sessions table is missing from the database schema') {
    super(message)
    this.name = 'StatementParseSessionSchemaError'
  }
}

export function isStatementParseSessionSchemaError(error: unknown): boolean {
  if (error instanceof StatementParseSessionSchemaError) return true
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  return message.includes('statement_parse_sessions') && (
    message.includes('schema cache')
    || message.includes('could not find the table')
    || message.includes('does not exist')
  )
}

function throwIfParseSessionSchemaMissing(error: unknown) {
  if (!error || typeof error !== 'object') return
  const message = String((error as { message?: unknown }).message || '')
  if (isStatementParseSessionSchemaError(new Error(message))) {
    throw new StatementParseSessionSchemaError(
      "Could not find the table 'public.statement_parse_sessions' in the schema cache",
    )
  }
}

export async function cleanupExpiredStatementParseSessions(params: {
  supabase: any
  householdId: string
  userId: string
}) {
  const { error } = await params.supabase
    .from(STATEMENT_PARSE_SESSIONS_TABLE)
    .update({
      status: STATEMENT_PARSE_SESSION_STATUS.EXPIRED,
      updated_at: new Date().toISOString(),
    })
    .eq('household_id', params.householdId)
    .eq('user_id', params.userId)
    .eq('status', STATEMENT_PARSE_SESSION_STATUS.NEEDS_ACCOUNT_RESOLUTION)
    .lt('expires_at', new Date().toISOString())

  throwIfParseSessionSchemaMissing(error)
}

export async function createStatementParseSession(params: {
  supabase: any
  householdId: string
  userId: string
  fileName: string
  fileSha256: string
  mimeType: string
  fileSizeBytes: number
  selectedAccountId: string | null
  parsedPayload: Record<string, unknown>
  unmatchedAccountDescriptors: Array<Record<string, unknown>>
  suggestedExistingAccounts: Array<Record<string, unknown>>
}) {
  const { data, error } = await params.supabase
    .from(STATEMENT_PARSE_SESSIONS_TABLE)
    .insert({
      household_id: params.householdId,
      user_id: params.userId,
      file_name: params.fileName,
      file_sha256: params.fileSha256,
      mime_type: params.mimeType || 'application/octet-stream',
      file_size_bytes: params.fileSizeBytes,
      selected_account_id: params.selectedAccountId,
      parsed_payload: params.parsedPayload,
      unresolved_descriptors: params.unmatchedAccountDescriptors,
      suggested_existing_accounts: params.suggestedExistingAccounts,
      status: STATEMENT_PARSE_SESSION_STATUS.NEEDS_ACCOUNT_RESOLUTION,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  throwIfParseSessionSchemaMissing(error)

  if (error || !data) {
    if (isMissingParseSessionTableError(error)) {
      return null
    }

    throw new Error(error?.message || 'Failed to create statement parse session')
  }

  return data.id as string
}

export async function getStatementParseSession(params: {
  supabase: any
  parseSessionId: string
  householdId: string
  userId: string
}) {
  const { data, error } = await params.supabase
    .from(STATEMENT_PARSE_SESSIONS_TABLE)
    .select('*')
    .eq('id', params.parseSessionId)
    .eq('household_id', params.householdId)
    .eq('user_id', params.userId)
    .single()

  throwIfParseSessionSchemaMissing(error)

  if (error || !data) {
    if (error && !isMissingParseSessionTableError(error)) {
      console.error('Failed to fetch statement parse session:', error)
    }
    return null
  }

  return data as Record<string, unknown>
}

export async function updateStatementParseSessionUnresolved(params: {
  supabase: any
  parseSessionId: string
  unmatchedAccountDescriptors: Array<Record<string, unknown>>
  suggestedExistingAccounts: Array<Record<string, unknown>>
}) {
  const { error } = await params.supabase
    .from(STATEMENT_PARSE_SESSIONS_TABLE)
    .update({
      unresolved_descriptors: params.unmatchedAccountDescriptors,
      suggested_existing_accounts: params.suggestedExistingAccounts,
      status: STATEMENT_PARSE_SESSION_STATUS.NEEDS_ACCOUNT_RESOLUTION,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.parseSessionId)

  throwIfParseSessionSchemaMissing(error)
}

export async function markStatementParseSessionResolved(params: {
  supabase: any
  parseSessionId: string
}) {
  const { error } = await params.supabase
    .from(STATEMENT_PARSE_SESSIONS_TABLE)
    .update({
      status: STATEMENT_PARSE_SESSION_STATUS.RESOLVED,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.parseSessionId)

  throwIfParseSessionSchemaMissing(error)
}
