export const MERCHANT_ERROR_CODES = {
  SCHEMA_NOT_READY: 'merchant_schema_not_ready',
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

export function isMerchantSchemaNotReadyError(error: unknown, requiredObject = 'merchants') {
  if (!error) return false

  const code = readErrorCode(error)
  const message = readErrorText(error)
  const required = requiredObject.toLowerCase()
  const mentionsRequired =
    message.includes(required) ||
    (required.startsWith('merchant') && message.includes('merchant')) ||
    (required === 'merchants' && message.includes('merchant_id'))

  if ((code === 'PGRST200' || code === 'PGRST202' || code === 'PGRST205') && mentionsRequired) {
    return true
  }

  if (message.includes('schema cache') && mentionsRequired) return true
  if (message.includes(`could not find the table 'public.${required}'`)) return true
  if (message.includes(`relation "public.${required}" does not exist`)) return true
  if (message.includes(`function public.${required}`) && message.includes('does not exist')) return true

  if (message.includes("relationship between 'receipts' and 'merchants'")) return true
  if (message.includes("relationship between 'statement_transactions' and 'merchants'")) return true

  if (message.includes('column merchants.household_id does not exist')) return true
  if (message.includes('column merchant_aliases.household_id does not exist')) return true
  if (message.includes('column statement_transactions.merchant_id does not exist')) return true
  if (message.includes('column receipts.merchant_id does not exist')) return true
  if (message.includes('column ledger_entries.merchant_id does not exist')) return true

  if (message.includes('merchant_merge_preview')) return true
  if (message.includes('merge_merchant_safe')) return true
  if (message.includes('delete_merchant_safe')) return true

  return false
}

function describeRequiredObject(requiredObject: string) {
  const required = requiredObject.toLowerCase()
  if (required === 'merchants' || required === 'merchant_aliases') {
    return `table \`public.${required}\``
  }

  if (required.includes('merchant') && required.includes('_safe')) {
    return `function \`public.${required}\``
  }

  if (required.includes('merchant')) {
    return `merchant schema object \`public.${required}\``
  }

  return `merchant schema support for \`${requiredObject}\``
}

export function merchantSchemaNotReadyResponse(requiredObject = 'merchants') {
  return {
    error: 'Merchant management schema is not deployed in this Supabase environment.',
    code: MERCHANT_ERROR_CODES.SCHEMA_NOT_READY,
    action: `Run migration \`016_merchant_management.sql\` so ${describeRequiredObject(requiredObject)} exists.`,
  }
}

export function merchantApiErrorPayload(error: unknown, fallbackMessage: string, requiredObject = 'merchants') {
  if (isMerchantSchemaNotReadyError(error, requiredObject)) {
    return {
      status: 503,
      body: merchantSchemaNotReadyResponse(requiredObject),
    }
  }

  return {
    status: 500,
    body: {
      error: error instanceof Error ? error.message : fallbackMessage,
    },
  }
}
