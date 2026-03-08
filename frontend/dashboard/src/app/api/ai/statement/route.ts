/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { parseStatement } from '@/lib/ai/statement-parser'
import type { ParsedStatementResult } from '@/lib/statements/helpers'
import { createServerSupabaseClient } from '@/lib/supabase/server'
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
  cleanupExpiredStatementParseSessions,
  createStatementParseSession,
  isStatementParseSessionSchemaError,
} from '@/lib/server/statement-parse-sessions'

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
      await cleanupExpiredStatementParseSessions({
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
      parsed,
      candidateAccounts,
      manualAccount,
    })

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

    const result = await stageRoutedTransactions({
      supabase: db,
      householdId: profile.household_id,
      userId: user.id,
      parsed,
      routedTransactions: routed.routedTransactions,
      fileName: file.name,
      fileSha256,
      mimeType: file.type || 'application/octet-stream',
      fileSizeBytes: bytes.byteLength,
      primaryAccount,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Statement parse error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse statement' },
      { status: 500 },
    )
  }
}
