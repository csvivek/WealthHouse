import {
  STATEMENT_SIGNED_URL_TTL_SECONDS,
  getStatementsBucket,
  toSafeStatementStorageFilename,
} from '@/lib/statements/config'
import { cleanupExpiredStatementParseSessions } from '@/lib/server/statement-parse-sessions'
import { createServiceSupabaseClient } from '@/lib/supabase/service'

export interface StatementStorageReference {
  storageBucket: string
  storagePath: string
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

export function buildStatementStoragePath(params: {
  householdId: string
  fileImportId: string
  fileName: string
}) {
  const safeFileName = toSafeStatementStorageFilename(params.fileName)

  return {
    storageBucket: getStatementsBucket(),
    storagePath: `households/${params.householdId}/statements/${params.fileImportId}/${safeFileName}`,
  }
}

export async function uploadOriginalStatement(params: {
  supabase: any
  householdId: string
  fileImportId: string
  fileName: string
  mimeType: string
  bytes: Buffer
}) {
  const reference = buildStatementStoragePath({
    householdId: params.householdId,
    fileImportId: params.fileImportId,
    fileName: params.fileName,
  })

  const { error } = await params.supabase.storage
    .from(reference.storageBucket)
    .upload(reference.storagePath, params.bytes, {
      contentType: params.mimeType || 'application/octet-stream',
      upsert: false,
    })

  if (error) {
    throw new Error(error.message || 'Failed to upload original statement')
  }

  return reference
}

export function buildStatementSourceFileHref(importId: string) {
  return `/api/ai/statement/${importId}/file`
}

export async function deleteOriginalStatement(params: {
  supabase: any
  storageBucket?: string | null
  storagePath?: string | null
}) {
  if (!params.storageBucket || !params.storagePath) return

  const { error } = await params.supabase.storage
    .from(params.storageBucket)
    .remove([params.storagePath])

  if (error) {
    console.warn(`Failed to remove stored statement ${params.storagePath}: ${error.message}`)
  }
}

export async function cleanupExpiredStatementSessionStorage(params: {
  supabase: any
  householdId: string
  userId: string
}) {
  const expiredSessions = await cleanupExpiredStatementParseSessions(params)
  if (expiredSessions.length === 0) {
    return []
  }

  let serviceSupabase: any = null
  try {
    serviceSupabase = createServiceSupabaseClient()
  } catch (error) {
    console.warn(
      `Statement session storage cleanup skipped: ${error instanceof Error ? error.message : 'service client unavailable'}`,
    )
    return expiredSessions
  }

  await Promise.allSettled(
    expiredSessions.map((session) => deleteOriginalStatement({
      supabase: serviceSupabase,
      storageBucket: session.storageBucket,
      storagePath: session.storagePath,
    })),
  )

  return expiredSessions
}

export async function createStatementSignedUrl(params: {
  supabase: any
  storageBucket: string
  storagePath: string
  expiresIn?: number
}) {
  const { data, error } = await params.supabase.storage
    .from(params.storageBucket)
    .createSignedUrl(params.storagePath, params.expiresIn ?? STATEMENT_SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Failed to create statement download URL')
  }

  return data.signedUrl
}

export async function resolveStatementStorageForImport(params: {
  supabase: any
  importId: string
  householdId: string
}) {
  const baseQuery = params.supabase
    .from('file_imports')
    .select('id, statement_upload_id, storage_bucket, storage_path')
    .eq('id', params.importId)
    .eq('household_id', params.householdId)
  const { data: fileImport, error } = await (
    typeof baseQuery.maybeSingle === 'function'
      ? baseQuery.maybeSingle()
      : baseQuery.single()
  )

  if (error || !fileImport) {
    return null
  }

  let storageBucket = readString(fileImport.storage_bucket)
  let storagePath = readString(fileImport.storage_path)

  if ((!storageBucket || !storagePath) && readString(fileImport.statement_upload_id)) {
    const uploadQuery = params.supabase
      .from('statement_uploads')
      .select('id, storage_bucket, storage_path')
      .eq('id', fileImport.statement_upload_id)
      .eq('household_id', params.householdId)
    const { data: statementUpload } = await (
      typeof uploadQuery.maybeSingle === 'function'
        ? uploadQuery.maybeSingle()
        : uploadQuery.single()
    )

    storageBucket = readString(statementUpload?.storage_bucket) ?? storageBucket
    storagePath = readString(statementUpload?.storage_path) ?? storagePath
  }

  return {
    fileImport,
    storageBucket,
    storagePath,
  }
}
