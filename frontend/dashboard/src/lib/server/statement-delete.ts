import { deleteOriginalStatement } from '@/lib/server/statement-storage'

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readSupabaseErrorMessage(error: unknown) {
  if (!error) return 'Unknown error'
  if (error instanceof Error) return error.message || 'Unknown error'

  if (typeof error === 'object') {
    const next = error as {
      message?: unknown
      details?: unknown
      hint?: unknown
      code?: unknown
    }

    const parts = [
      typeof next.message === 'string' ? next.message : '',
      typeof next.details === 'string' ? next.details : '',
      typeof next.hint === 'string' ? next.hint : '',
    ].filter((part) => part.trim().length > 0)

    const message = parts.join(' ').trim() || 'Unknown error'
    return typeof next.code === 'string' && next.code.trim().length > 0
      ? `${message} [${next.code}]`
      : message
  }

  return String(error)
}

function isMissingOptionalRelationError(error: unknown) {
  const message = readSupabaseErrorMessage(error).toLowerCase()
  return (
    message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('[42p01]')
    || message.includes('[42703]')
  )
}

async function deleteByIds(params: {
  supabase: any
  table: string
  column: string
  ids: string[]
  optional?: boolean
}) {
  if (params.ids.length === 0) return

  const { error } = await params.supabase
    .from(params.table)
    .delete()
    .in(params.column, params.ids)

  if (error && !(params.optional && isMissingOptionalRelationError(error))) {
    throw new StatementDeleteProcessError(
      `Failed to delete ${params.table}: ${readSupabaseErrorMessage(error)}`,
    )
  }
}

async function nullStatementTransactionReference(params: {
  supabase: any
  table: string
  ids: string[]
}) {
  if (params.ids.length === 0) return

  const { error } = await params.supabase
    .from(params.table)
    .update({ statement_transaction_id: null })
    .in('statement_transaction_id', params.ids)

  if (error && !isMissingOptionalRelationError(error)) {
    throw new StatementDeleteProcessError(
      `Failed to detach ${params.table} from statement transactions: ${readSupabaseErrorMessage(error)}`,
    )
  }
}

export class StatementDeleteProcessError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'StatementDeleteProcessError'
    this.status = status
  }
}

export async function deleteStatementImport(params: {
  supabase: any
  importId: string
  householdId: string
}) {
  const { data: fileImport, error: fileImportError } = await params.supabase
    .from('file_imports')
    .select('id, household_id, file_name, statement_upload_id, storage_bucket, storage_path')
    .eq('id', params.importId)
    .eq('household_id', params.householdId)
    .maybeSingle()

  if (fileImportError) {
    throw new StatementDeleteProcessError(
      `Failed to load statement import: ${readSupabaseErrorMessage(fileImportError)}`,
    )
  }

  if (!fileImport) {
    throw new StatementDeleteProcessError('Import not found', 404)
  }

  const statementUploadId = readString(fileImport.statement_upload_id)

  const { error: clearDuplicateRefsError } = await params.supabase
    .from('file_imports')
    .update({ duplicate_of_file_import_id: null, updated_at: new Date().toISOString() })
    .eq('duplicate_of_file_import_id', params.importId)

  if (clearDuplicateRefsError && !isMissingOptionalRelationError(clearDuplicateRefsError)) {
    throw new StatementDeleteProcessError(
      `Failed to clear duplicate import references: ${readSupabaseErrorMessage(clearDuplicateRefsError)}`,
    )
  }

  const { data: statementImports, error: statementImportsError } = await params.supabase
    .from('statement_imports')
    .select('id')
    .eq('file_import_id', params.importId)

  if (statementImportsError && !isMissingOptionalRelationError(statementImportsError)) {
    throw new StatementDeleteProcessError(
      `Failed to load committed statement imports: ${readSupabaseErrorMessage(statementImportsError)}`,
    )
  }

  const statementImportIds = (statementImports ?? [])
    .map((row: { id?: string | null }) => readString(row.id))
    .filter((value: string | null): value is string => Boolean(value))

  let statementTransactionIds: string[] = []
  if (statementImportIds.length > 0) {
    const { data: statementTransactions, error: statementTransactionsError } = await params.supabase
      .from('statement_transactions')
      .select('id')
      .in('statement_import_id', statementImportIds)

    if (statementTransactionsError && !isMissingOptionalRelationError(statementTransactionsError)) {
      throw new StatementDeleteProcessError(
        `Failed to load statement transactions: ${readSupabaseErrorMessage(statementTransactionsError)}`,
      )
    }

    statementTransactionIds = (statementTransactions ?? [])
      .map((row: { id?: string | null }) => readString(row.id))
      .filter((value: string | null): value is string => Boolean(value))
  }

  if (statementTransactionIds.length > 0) {
    await deleteByIds({
      supabase: params.supabase,
      table: 'mappings',
      column: 'statement_transaction_id',
      ids: statementTransactionIds,
      optional: true,
    })

    await deleteByIds({
      supabase: params.supabase,
      table: 'transaction_links',
      column: 'from_transaction_id',
      ids: statementTransactionIds,
      optional: true,
    })

    await deleteByIds({
      supabase: params.supabase,
      table: 'transaction_links',
      column: 'to_transaction_id',
      ids: statementTransactionIds,
      optional: true,
    })

    await nullStatementTransactionReference({
      supabase: params.supabase,
      table: 'ledger_entries',
      ids: statementTransactionIds,
    })

    await nullStatementTransactionReference({
      supabase: params.supabase,
      table: 'investment_transactions',
      ids: statementTransactionIds,
    })

    await nullStatementTransactionReference({
      supabase: params.supabase,
      table: 'advance_repayments',
      ids: statementTransactionIds,
    })

    const { error: clearStagingRefsError } = await params.supabase
      .from('import_staging')
      .update({
        committed_transaction_id: null,
        duplicate_transaction_id: null,
        duplicate_status: 'none',
        updated_at: new Date().toISOString(),
      })
      .in('committed_transaction_id', statementTransactionIds)

    if (clearStagingRefsError && !isMissingOptionalRelationError(clearStagingRefsError)) {
      throw new StatementDeleteProcessError(
        `Failed to clear staging transaction references: ${readSupabaseErrorMessage(clearStagingRefsError)}`,
      )
    }

    const { error: clearDuplicateStagingRefsError } = await params.supabase
      .from('import_staging')
      .update({
        duplicate_transaction_id: null,
        duplicate_status: 'none',
        updated_at: new Date().toISOString(),
      })
      .in('duplicate_transaction_id', statementTransactionIds)

    if (clearDuplicateStagingRefsError && !isMissingOptionalRelationError(clearDuplicateStagingRefsError)) {
      throw new StatementDeleteProcessError(
        `Failed to clear duplicate staging transaction references: ${readSupabaseErrorMessage(clearDuplicateStagingRefsError)}`,
      )
    }

    await deleteByIds({
      supabase: params.supabase,
      table: 'statement_transactions',
      column: 'id',
      ids: statementTransactionIds,
    })
  }

  if (statementImportIds.length > 0) {
    await deleteByIds({
      supabase: params.supabase,
      table: 'statement_summaries',
      column: 'statement_import_id',
      ids: statementImportIds,
    })

    await deleteByIds({
      supabase: params.supabase,
      table: 'statement_imports',
      column: 'id',
      ids: statementImportIds,
    })
  }

  const { error: deleteImportError } = await params.supabase
    .from('file_imports')
    .delete()
    .eq('id', params.importId)
    .eq('household_id', params.householdId)

  if (deleteImportError) {
    throw new StatementDeleteProcessError(
      `Failed to delete file import: ${readSupabaseErrorMessage(deleteImportError)}`,
    )
  }

  let removedStoredFile = false
  let removedStatementUpload = false

  if (statementUploadId) {
    const { count: remainingImportCount, error: remainingImportsError } = await params.supabase
      .from('file_imports')
      .select('id', { count: 'exact', head: true })
      .eq('statement_upload_id', statementUploadId)
      .eq('household_id', params.householdId)

    if (remainingImportsError) {
      throw new StatementDeleteProcessError(
        `Failed to inspect remaining statement imports: ${readSupabaseErrorMessage(remainingImportsError)}`,
      )
    }

    if ((remainingImportCount ?? 0) === 0) {
      const { error: clearUploadDuplicateRefsError } = await params.supabase
        .from('statement_uploads')
        .update({ duplicate_of_statement_upload_id: null, updated_at: new Date().toISOString() })
        .eq('duplicate_of_statement_upload_id', statementUploadId)

      if (clearUploadDuplicateRefsError && !isMissingOptionalRelationError(clearUploadDuplicateRefsError)) {
        throw new StatementDeleteProcessError(
          `Failed to clear duplicate upload references: ${readSupabaseErrorMessage(clearUploadDuplicateRefsError)}`,
        )
      }

      const { data: statementUpload, error: statementUploadError } = await params.supabase
        .from('statement_uploads')
        .select('id, storage_bucket, storage_path')
        .eq('id', statementUploadId)
        .eq('household_id', params.householdId)
        .maybeSingle()

      if (statementUploadError && !isMissingOptionalRelationError(statementUploadError)) {
        throw new StatementDeleteProcessError(
          `Failed to load statement upload: ${readSupabaseErrorMessage(statementUploadError)}`,
        )
      }

      await deleteOriginalStatement({
        supabase: params.supabase,
        storageBucket: readString(statementUpload?.storage_bucket) ?? readString(fileImport.storage_bucket),
        storagePath: readString(statementUpload?.storage_path) ?? readString(fileImport.storage_path),
      })
      removedStoredFile = true

      const { error: deleteUploadError } = await params.supabase
        .from('statement_uploads')
        .delete()
        .eq('id', statementUploadId)
        .eq('household_id', params.householdId)

      if (deleteUploadError && !isMissingOptionalRelationError(deleteUploadError)) {
        throw new StatementDeleteProcessError(
          `Failed to delete statement upload: ${readSupabaseErrorMessage(deleteUploadError)}`,
        )
      }

      removedStatementUpload = true
    }
  } else {
    await deleteOriginalStatement({
      supabase: params.supabase,
      storageBucket: readString(fileImport.storage_bucket),
      storagePath: readString(fileImport.storage_path),
    })
    removedStoredFile = Boolean(readString(fileImport.storage_bucket) && readString(fileImport.storage_path))
  }

  return {
    deletedImportId: params.importId,
    deletedFileName: readString(fileImport.file_name) || 'statement import',
    removedStatementUpload,
    removedStoredFile,
  }
}
