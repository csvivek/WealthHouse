/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ensureProfile } from '@/lib/supabase/ensure-profile'
import {
  getStatementParseSession,
  STATEMENT_PARSE_SESSION_STATUS,
} from '@/lib/server/statement-parse-sessions'
import { queueStatementParseSessionResumption } from '@/lib/server/statement-ingestion'
import { startStatementIngestionJob } from '@/lib/server/statement-ingestion-jobs'

interface ResolveAccountPayload {
  parseSessionId: string
  resolutions: Array<Record<string, unknown>>
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

    const statementUploadId = typeof parseSession.statement_upload_id === 'string'
      ? parseSession.statement_upload_id
      : null

    if (!statementUploadId) {
      return NextResponse.json(
        { error: 'This parse session is missing its statement upload linkage. Please re-upload the statement.' },
        { status: 409 },
      )
    }

    await queueStatementParseSessionResumption({
      statementUploadId,
      parseSessionId: body.parseSessionId,
      resolutionPayload: body.resolutions,
    })

    const job = startStatementIngestionJob({
      statementUploadId,
      fileName: typeof parseSession.file_name === 'string' ? parseSession.file_name : 'statement.pdf',
      userId: user.id,
      householdId: profile.household_id,
    })

    return NextResponse.json(
      {
        statementUploadId,
        parseSessionId: body.parseSessionId,
        status: 'queued',
        job,
      },
      { status: 202 },
    )
  } catch (error) {
    console.error('Statement resolve-account error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to queue statement account resolution' },
      { status: 500 },
    )
  }
}
