/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  assertStatementStorageConfig,
  ensureStatementsBucket,
  getStatementsBucket,
  mapStatementStorageErrorMessage,
} from '@/lib/statements/config'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { ensureProfile } from '@/lib/supabase/ensure-profile'
import { computeFileHash } from '@/lib/server/statement-import'
import { startStatementIngestionJob } from '@/lib/server/statement-ingestion-jobs'
import {
  listStatementUploadImports,
  loadStatementUploadByHash,
} from '@/lib/server/statement-uploads'
import { uploadOriginalStatement } from '@/lib/server/statement-storage'

function buildStatementStorageUnavailableResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Failed to store original statement'
  if (message === 'Statement storage configuration is missing.') {
    return NextResponse.json({ error: message }, { status: 503 })
  }

  const mapped = mapStatementStorageErrorMessage(message)

  return NextResponse.json(
    {
      error: mapped.userMessage,
      details: message,
    },
    { status: mapped.status },
  )
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const db = supabase as any

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensureProfile(supabase, user.id)

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('household_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'No profile found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('statement') as File | null
    const selectedAccountId = formData.get('account_id') as string | null

    if (!file) {
      return NextResponse.json({ error: 'Statement file is required' }, { status: 400 })
    }

    if (selectedAccountId) {
      const { data: existingAccount } = await supabase
        .from('accounts')
        .select('id')
        .eq('id', selectedAccountId)
        .eq('household_id', profile.household_id)
        .maybeSingle()

      if (!existingAccount) {
        return NextResponse.json({ error: 'Selected account was not found.' }, { status: 404 })
      }
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const fileSha256 = computeFileHash(bytes)

    const existingUpload = await loadStatementUploadByHash({
      supabase: db,
      householdId: profile.household_id,
      fileSha256,
    })

    if (existingUpload) {
      const existingImports = await listStatementUploadImports({
        supabase: db,
        statementUploadId: String(existingUpload.id),
        householdId: profile.household_id,
      })

      return NextResponse.json(
        {
          error: 'This file has already been processed.',
          duplicate: true,
          statementUploadId: String(existingUpload.id),
          existingFileName: typeof existingUpload.file_name === 'string' ? existingUpload.file_name : file.name,
          existingStatus: typeof existingUpload.status === 'string' ? existingUpload.status : 'completed',
          existingImportCount: existingImports.length,
          existingImports,
        },
        { status: 409 },
      )
    }

    let serviceSupabase: any
    let statementBucket = ''
    try {
      assertStatementStorageConfig()

      serviceSupabase = createServiceSupabaseClient() as any
      statementBucket = getStatementsBucket()
      const bucketReady = await ensureStatementsBucket(serviceSupabase, statementBucket)
      if (!bucketReady.ok) {
        const mapped = mapStatementStorageErrorMessage(bucketReady.error?.message ?? 'Bucket not accessible')
        return NextResponse.json(
          {
            error: 'Statement storage bucket is missing or inaccessible.',
            code: mapped.code,
            action: 'Create the `statements` bucket in Supabase storage and apply storage policies.',
            details: bucketReady.error?.message ?? null,
          },
          { status: mapped.status === 500 ? 503 : mapped.status },
        )
      }
    } catch (error) {
      return buildStatementStorageUnavailableResponse(error)
    }

    const statementUploadId = randomUUID()

    const { error: insertError } = await serviceSupabase
      .from('statement_uploads')
      .insert({
        id: statementUploadId,
        household_id: profile.household_id,
        uploaded_by: user.id,
        selected_account_id: selectedAccountId,
        file_name: file.name,
        file_sha256: fileSha256,
        mime_type: file.type || 'application/octet-stream',
        file_size_bytes: bytes.byteLength,
        storage_bucket: statementBucket,
        status: 'queued',
      })

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message || 'Failed to register statement upload' },
        { status: 500 },
      )
    }

    let storedOriginal: { storageBucket: string; storagePath: string } | null = null
    try {
      storedOriginal = await uploadOriginalStatement({
        supabase: serviceSupabase,
        householdId: profile.household_id,
        fileImportId: statementUploadId,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        bytes,
      })
    } catch (error) {
      await serviceSupabase
        .from('statement_uploads')
        .update({
          status: 'failed',
          error_code: 'statement_storage_failed',
          error_message: error instanceof Error ? error.message : 'Failed to upload statement file',
          parse_error: error instanceof Error ? error.message : 'Failed to upload statement file',
          updated_at: new Date().toISOString(),
        })
        .eq('id', statementUploadId)

      return buildStatementStorageUnavailableResponse(error)
    }

    await serviceSupabase
      .from('statement_uploads')
      .update({
        storage_bucket: storedOriginal.storageBucket,
        storage_path: storedOriginal.storagePath,
        updated_at: new Date().toISOString(),
      })
      .eq('id', statementUploadId)

    const job = startStatementIngestionJob({
      statementUploadId,
      fileName: file.name,
      userId: user.id,
      householdId: profile.household_id,
    })

    return NextResponse.json(
      {
        duplicate: false,
        statementUploadId,
        status: 'queued',
        job,
      },
      { status: 202 },
    )
  } catch (error) {
    console.error('Statement upload error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to queue statement import' },
      { status: 500 },
    )
  }
}
