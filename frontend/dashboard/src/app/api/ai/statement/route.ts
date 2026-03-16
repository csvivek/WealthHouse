/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { parseStatement } from '@/lib/ai/statement-parser'
import type { ParsedStatementResult } from '@/lib/statements/helpers'
import {
  assertStatementStorageConfig,
  ensureStatementsBucket,
  getStatementsBucket,
  mapStatementStorageErrorMessage,
} from '@/lib/statements/config'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { ensureProfile } from '@/lib/supabase/ensure-profile'
import {
  buildParsedAccountLabel,
  computeFileHash,
  loadAccountCandidates,
  resolveAccountCandidate,
  resolvedAccountFromCandidate,
  routeParsedTransactions,
  stageRoutedTransactions,
} from '@/lib/server/statement-import'
import {
  createStatementParseSession,
  isStatementParseSessionSchemaError,
} from '@/lib/server/statement-parse-sessions'
import {
  cleanupExpiredStatementSessionStorage,
  deleteOriginalStatement,
  uploadOriginalStatement,
} from '@/lib/server/statement-storage'

const PARSE_SESSION_MIGRATION_HINT = 'Apply supabase migration 006_statement_parse_sessions.sql to enable continue-without-reupload recovery.'

function buildRoutingFailureMessage(unmatchedLabels: string[]) {
  const uniqueLabels = Array.from(new Set(unmatchedLabels.filter(Boolean)))
  const preview = uniqueLabels.slice(0, 3).join('; ')
  const moreCount = Math.max(uniqueLabels.length - 3, 0)
  const details = moreCount > 0 ? `${preview}; and ${moreCount} more.` : preview

  return `This statement contains transactions for accounts that could not be matched automatically. ${details} Review or create the missing account(s), then continue without re-uploading.`
}

function buildSchemaMissingRecoveryMessage(baseMessage: string) {
  return `${baseMessage} Continue-without-reupload is temporarily unavailable because statement parse session storage is not deployed. ${PARSE_SESSION_MIGRATION_HINT}`
}

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

    const bytes = Buffer.from(await file.arrayBuffer())
    const fileSha256 = computeFileHash(bytes)

    const { data: existingImport } = await supabase
      .from('file_imports')
      .select('id, status, file_name')
      .eq('household_id', profile.household_id)
      .eq('file_sha256', fileSha256)
      .not('status', 'eq', 'failed')
      .limit(1)
      .maybeSingle()

    if (existingImport) {
      return NextResponse.json(
        {
          error: 'This file has already been processed.',
          existingImportId: existingImport.id,
          existingFileName: existingImport.file_name,
          existingStatus: existingImport.status,
        },
        { status: 409 },
      )
    }

    let parsed: ParsedStatementResult
    try {
      parsed = await parseStatement(bytes, file.type || 'application/pdf', file.name)
    } catch (parseError) {
      return NextResponse.json(
        { error: parseError instanceof Error ? parseError.message : 'Failed to parse statement' },
        { status: 500 },
      )
    }

    const candidateAccounts = await loadAccountCandidates(db, profile.household_id)
    if (candidateAccounts.length === 0) {
      return NextResponse.json(
        {
          error: `No active accounts found. Add this account first: ${buildParsedAccountLabel(parsed.account, parsed.institution_name || parsed.institution_code)}`,
          code: 'account_required',
        },
        { status: 422 },
      )
    }

    let manualAccount = null
    if (selectedAccountId) {
      const selectedCandidate = candidateAccounts.find((account) => account.id === selectedAccountId)
      if (!selectedCandidate) {
        return NextResponse.json({ error: 'Selected account was not found.' }, { status: 404 })
      }
      manualAccount = resolvedAccountFromCandidate(selectedCandidate, 'manual')
    }

    let parseSessionStorageAvailable = true
    try {
      await cleanupExpiredStatementSessionStorage({
        supabase: db,
        householdId: profile.household_id,
        userId: user.id,
      })
    } catch (error) {
      if (isStatementParseSessionSchemaError(error)) {
        parseSessionStorageAvailable = false
      } else {
        throw error
      }
    }

    const routed = await routeParsedTransactions({
      supabase: db,
      householdId: profile.household_id,
      parsed,
      candidateAccounts,
      manualAccount,
    })

    let serviceSupabase: any = null
    let statementBucket = ''
    let storageReady = false
    const ensureStatementStorageReady = async () => {
      if (storageReady) {
        return { serviceSupabase, statementBucket }
      }

      assertStatementStorageConfig()

      serviceSupabase = createServiceSupabaseClient() as any
      statementBucket = getStatementsBucket()
      const bucketReady = await ensureStatementsBucket(serviceSupabase, statementBucket)
      if (!bucketReady.ok) {
        const mapped = mapStatementStorageErrorMessage(bucketReady.error?.message ?? 'Bucket not accessible')
        throw Object.assign(new Error(bucketReady.error?.message ?? 'Bucket not accessible'), {
          response: NextResponse.json(
            {
              error: 'Statement storage bucket is missing or inaccessible.',
              code: mapped.code,
              action: 'Create the `statements` bucket in Supabase storage and apply storage policies.',
              details: bucketReady.error?.message ?? null,
            },
            { status: mapped.status === 500 ? 503 : mapped.status },
          ),
        })
      }

      storageReady = true
      return { serviceSupabase, statementBucket }
    }

    if (routed.unmatchedAccountDescriptors.length > 0) {
      const baseMessage = buildRoutingFailureMessage(routed.unmatchedAccountDescriptors.map((row) => row.label))

      if (!parseSessionStorageAvailable) {
        return NextResponse.json(
          {
            error: buildSchemaMissingRecoveryMessage(baseMessage),
            code: 'transaction_account_match_required',
            parseSessionId: null,
            recoveryMode: 'reupload_required',
            parsedStatement: buildParsedAccountLabel(parsed.account, parsed.institution_name || parsed.institution_code),
            unmatchedAccountDescriptors: routed.unmatchedAccountDescriptors,
            suggestedExistingAccounts: routed.suggestedExistingAccounts,
            action: PARSE_SESSION_MIGRATION_HINT,
          },
          { status: 422 },
        )
      }

      try {
        await ensureStatementStorageReady()
      } catch (error) {
        if (error && typeof error === 'object' && 'response' in error) {
          return (error as { response: NextResponse }).response
        }

        return buildStatementStorageUnavailableResponse(error)
      }

      const parseSessionStorageId = randomUUID()
      let storedOriginal = null as { storageBucket: string; storagePath: string } | null
      try {
        storedOriginal = await uploadOriginalStatement({
          supabase: serviceSupabase,
          householdId: profile.household_id,
          fileImportId: parseSessionStorageId,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          bytes,
        })
      } catch (storageError) {
        return buildStatementStorageUnavailableResponse(storageError)
      }

      try {
        const parseSessionId = await createStatementParseSession({
          supabase: db,
          householdId: profile.household_id,
          userId: user.id,
          fileName: file.name,
          fileSha256,
          mimeType: file.type || 'application/octet-stream',
          fileSizeBytes: bytes.byteLength,
          selectedAccountId,
          parsedPayload: parsed as unknown as Record<string, unknown>,
          unmatchedAccountDescriptors: routed.unmatchedAccountDescriptors as unknown as Array<Record<string, unknown>>,
          suggestedExistingAccounts: routed.suggestedExistingAccounts as unknown as Array<Record<string, unknown>>,
          storageBucket: storedOriginal.storageBucket,
          storagePath: storedOriginal.storagePath,
        })

        return NextResponse.json(
          {
            error: baseMessage,
            code: 'transaction_account_match_required',
            parseSessionId,
            recoveryMode: 'resume_supported',
            parsedStatement: buildParsedAccountLabel(parsed.account, parsed.institution_name || parsed.institution_code),
            unmatchedAccountDescriptors: routed.unmatchedAccountDescriptors,
            suggestedExistingAccounts: routed.suggestedExistingAccounts,
          },
          { status: 422 },
        )
      } catch (error) {
        await deleteOriginalStatement({
          supabase: serviceSupabase,
          storageBucket: storedOriginal.storageBucket,
          storagePath: storedOriginal.storagePath,
        })

        if (!isStatementParseSessionSchemaError(error)) {
          throw error
        }

        return NextResponse.json(
          {
            error: buildSchemaMissingRecoveryMessage(baseMessage),
            code: 'transaction_account_match_required',
            parseSessionId: null,
            recoveryMode: 'reupload_required',
            parsedStatement: buildParsedAccountLabel(parsed.account, parsed.institution_name || parsed.institution_code),
            unmatchedAccountDescriptors: routed.unmatchedAccountDescriptors,
            suggestedExistingAccounts: routed.suggestedExistingAccounts,
            action: PARSE_SESSION_MIGRATION_HINT,
          },
          { status: 422 },
        )
      }
    }

    const primaryAccount =
      routed.routedTransactions[0]?.account
      || manualAccount
      || resolveAccountCandidate({
        candidates: candidateAccounts,
        institutionName: parsed.institution_name || parsed.institution_code || '',
        descriptor: parsed.account ?? null,
      }).account

    if (!primaryAccount) {
      return NextResponse.json({ error: 'Could not determine which account this statement belongs to.' }, { status: 422 })
    }

    try {
      await ensureStatementStorageReady()
    } catch (error) {
      if (error && typeof error === 'object' && 'response' in error) {
        return (error as { response: NextResponse }).response
      }

      return buildStatementStorageUnavailableResponse(error)
    }

    const fileImportId = randomUUID()
    let storedOriginal = null as { storageBucket: string; storagePath: string } | null
    try {
      storedOriginal = await uploadOriginalStatement({
        supabase: serviceSupabase,
        householdId: profile.household_id,
        fileImportId,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        bytes,
      })
    } catch (storageError) {
      return buildStatementStorageUnavailableResponse(storageError)
    }

    let result
    try {
      result = await stageRoutedTransactions({
        supabase: db,
        householdId: profile.household_id,
        userId: user.id,
        parsed,
        routedTransactions: routed.routedTransactions,
        fileImportId,
        fileName: file.name,
        fileSha256,
        mimeType: file.type || 'application/octet-stream',
        fileSizeBytes: bytes.byteLength,
        primaryAccount,
        storageBucket: storedOriginal.storageBucket,
        storagePath: storedOriginal.storagePath,
      })
    } catch (stageError) {
      await deleteOriginalStatement({
        supabase: serviceSupabase,
        storageBucket: storedOriginal.storageBucket,
        storagePath: storedOriginal.storagePath,
      })
      throw stageError
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Statement parse error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse statement' },
      { status: 500 },
    )
  }
}
