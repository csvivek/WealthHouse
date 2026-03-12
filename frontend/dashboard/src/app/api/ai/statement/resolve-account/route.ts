/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ensureProfile } from '@/lib/supabase/ensure-profile'
import type { ParsedStatementResult } from '@/lib/statements/helpers'
import {
  loadAccountCandidates,
  resolveAccountCandidate,
  resolvedAccountFromCandidate,
  routeParsedTransactions,
  stageRoutedTransactions,
  type ResolvedAccount,
} from '@/lib/server/statement-import'
import {
  cleanupExpiredStatementParseSessions,
  getStatementParseSession,
  isStatementParseSessionSchemaError,
  markStatementParseSessionResolved,
  STATEMENT_PARSE_SESSION_STATUS,
  updateStatementParseSessionUnresolved,
} from '@/lib/server/statement-parse-sessions'
import {
  createAccountWithRelatedRecords,
  findOrCreateInstitution,
  normalizeAccountType,
} from '@/lib/server/accounts'

interface ResolveAccountPayload {
  parseSessionId: string
  resolutions: Array<{
    descriptorKey: string
    existingAccountId?: string
    createAccount?: {
      institution_name?: string
      institution_code?: string
      product_name?: string
      nickname?: string | null
      identifier_hint?: string | null
      currency?: string | null
      account_type?: string | null
      card_name?: string | null
      card_last4?: string | null
    }
  }>
}

function parseJsonArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function pickString(value: unknown) {
  return typeof value === 'string' ? value : null
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

    const body = await request.json() as ResolveAccountPayload
    if (!body?.parseSessionId || !Array.isArray(body?.resolutions)) {
      return NextResponse.json({ error: 'parseSessionId and resolutions are required.' }, { status: 400 })
    }

    await cleanupExpiredStatementParseSessions({
      supabase: db,
      householdId: profile.household_id,
      userId: user.id,
    })

    const parseSession = await getStatementParseSession({
      supabase: db,
      parseSessionId: body.parseSessionId,
      householdId: profile.household_id,
      userId: user.id,
    })

    if (!parseSession) {
      return NextResponse.json({ error: 'Parse session not found.' }, { status: 404 })
    }

    if (parseSession.status === STATEMENT_PARSE_SESSION_STATUS.EXPIRED) {
      return NextResponse.json({ error: 'Parse session expired. Please upload again.' }, { status: 410 })
    }

    if (parseSession.status === STATEMENT_PARSE_SESSION_STATUS.RESOLVED) {
      return NextResponse.json({ error: 'Parse session was already resolved.' }, { status: 409 })
    }

    const parsed = (parseSession.parsed_payload || {}) as ParsedStatementResult
    const unresolvedFromSession = parseJsonArray(parseSession.unresolved_descriptors) as Array<Record<string, unknown>>

    let candidateAccounts = await loadAccountCandidates(db, profile.household_id)
    const resolutionByDescriptor = new Map(body.resolutions.map((row) => [row.descriptorKey, row]))
    const accountOverrides = new Map<string, ResolvedAccount>()

    for (const descriptor of unresolvedFromSession) {
      const descriptorKey = pickString(descriptor.descriptorKey)
      if (!descriptorKey) continue

      const resolution = resolutionByDescriptor.get(descriptorKey)
      if (!resolution) {
        return NextResponse.json(
          {
            error: 'Resolution missing for one or more unmatched account descriptors.',
            code: 'resolution_required',
            descriptorKey,
          },
          { status: 422 },
        )
      }

      if (resolution.existingAccountId) {
        const matched = candidateAccounts.find((account) => account.id === resolution.existingAccountId)
        if (!matched) {
          return NextResponse.json(
            {
              error: 'Selected existing account was not found for this household.',
              code: 'account_not_found',
              descriptorKey,
            },
            { status: 404 },
          )
        }

        accountOverrides.set(descriptorKey, resolvedAccountFromCandidate(matched, 'manual'))
        continue
      }

      if (!resolution.createAccount) {
        return NextResponse.json(
          {
            error: 'Each unresolved descriptor needs an existing account or createAccount payload.',
            code: 'resolution_required',
            descriptorKey,
          },
          { status: 422 },
        )
      }

      const create = resolution.createAccount
      const institutionName = (create.institution_name || pickString(descriptor.institution_name) || '').trim()
      const productName = (create.product_name || pickString(descriptor.product_name) || pickString(descriptor.card_name) || '').trim()

      if (!institutionName || !productName) {
        return NextResponse.json(
          {
            error: 'Institution and product name are required to create an account.',
            code: 'create_account_fields_required',
            descriptorKey,
          },
          { status: 422 },
        )
      }

      const institution = await findOrCreateInstitution(supabase as any, {
        institutionName,
        institutionCode: create.institution_code || null,
      })

      const createdAccount = await createAccountWithRelatedRecords(supabase as any, {
        householdId: profile.household_id,
        institutionId: institution.id,
        accountType: normalizeAccountType(create.account_type || pickString(descriptor.account_type)),
        productName,
        nickname: create.nickname || null,
        identifierHint: create.identifier_hint || pickString(descriptor.identifier_hint) || null,
        currency: create.currency || pickString(descriptor.currency) || parsed.currency || 'SGD',
        cardName: create.card_name || pickString(descriptor.card_name) || null,
        cardLast4: create.card_last4 || pickString(descriptor.card_last4) || null,
      })

      const createdResolved: ResolvedAccount = {
        id: createdAccount.id,
        institutionId: institution.id,
        label: `${institution.name} — ${createdAccount.nickname ?? createdAccount.product_name}`,
        matchedBy: 'manual',
        cardId: null,
        cardName: create.card_name || pickString(descriptor.card_name) || null,
        cardLast4: create.card_last4 || pickString(descriptor.card_last4) || null,
      }

      accountOverrides.set(descriptorKey, createdResolved)
    }

    candidateAccounts = await loadAccountCandidates(db, profile.household_id)

    const routed = await routeParsedTransactions({
      supabase: db,
      householdId: profile.household_id,
      parsed,
      candidateAccounts,
      accountOverridesByDescriptorKey: accountOverrides,
      manualAccount: null,
    })

    if (routed.unmatchedAccountDescriptors.length > 0) {
      await updateStatementParseSessionUnresolved({
        supabase: db,
        parseSessionId: body.parseSessionId,
        unmatchedAccountDescriptors: routed.unmatchedAccountDescriptors as unknown as Array<Record<string, unknown>>,
        suggestedExistingAccounts: routed.suggestedExistingAccounts as unknown as Array<Record<string, unknown>>,
      })

      return NextResponse.json(
        {
          error: 'Some transactions still need account resolution.',
          code: 'transaction_account_match_required',
          parseSessionId: body.parseSessionId,
          unmatchedAccountDescriptors: routed.unmatchedAccountDescriptors,
          suggestedExistingAccounts: routed.suggestedExistingAccounts,
        },
        { status: 422 },
      )
    }

    const firstOverride = Array.from(accountOverrides.values())[0] || null
    const primaryAccount =
      routed.routedTransactions[0]?.account
      || firstOverride
      || resolveAccountCandidate({
        candidates: candidateAccounts,
        institutionName: parsed.institution_name || parsed.institution_code || '',
        descriptor: parsed.account ?? null,
      }).account

    if (!primaryAccount) {
      return NextResponse.json({ error: 'Could not determine primary account for import.' }, { status: 422 })
    }

    const result = await stageRoutedTransactions({
      supabase: db,
      householdId: profile.household_id,
      userId: user.id,
      parsed,
      routedTransactions: routed.routedTransactions,
      fileName: String(parseSession.file_name || 'statement.pdf'),
      fileSha256: String(parseSession.file_sha256 || ''),
      mimeType: String(parseSession.mime_type || 'application/octet-stream'),
      fileSizeBytes: Number(parseSession.file_size_bytes || 0),
      primaryAccount,
    })

    await markStatementParseSessionResolved({
      supabase: db,
      parseSessionId: body.parseSessionId,
    })

    return NextResponse.json({
      ...result,
      parseSessionId: body.parseSessionId,
    })
  } catch (error) {
    console.error('Statement resolve-account error:', error)

    if (isStatementParseSessionSchemaError(error)) {
      return NextResponse.json(
        {
          error: 'Statement recovery session storage is unavailable. Apply supabase migration 006_statement_parse_sessions.sql, then upload the statement again.',
          code: 'statement_parse_session_schema_missing',
          action: 'Apply supabase migration 006_statement_parse_sessions.sql in this environment.',
        },
        { status: 503 },
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resolve statement account mapping' },
      { status: 500 },
    )
  }
}
