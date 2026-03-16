import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getStatementParseSession } from '@/lib/server/statement-parse-sessions'

function parseJsonArray<T>(value: unknown) {
  return Array.isArray(value) ? value as T[] : []
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ parseSessionId: string }> },
) {
  try {
    const { parseSessionId } = await context.params
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('household_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'No profile found' }, { status: 404 })
    }

    const parseSession = await getStatementParseSession({
      supabase: supabase as any,
      parseSessionId,
      householdId: profile.household_id,
      userId: user.id,
    })

    if (!parseSession) {
      return NextResponse.json({ error: 'Parse session not found.' }, { status: 404 })
    }

    return NextResponse.json({
      parseSessionId,
      statementUploadId: typeof parseSession.statement_upload_id === 'string' ? parseSession.statement_upload_id : null,
      fileName: typeof parseSession.file_name === 'string' ? parseSession.file_name : null,
      status: typeof parseSession.status === 'string' ? parseSession.status : null,
      unmatchedAccountDescriptors: parseJsonArray(parseSession.unresolved_descriptors),
      suggestedExistingAccounts: parseJsonArray(parseSession.suggested_existing_accounts),
      selectedAccountId: typeof parseSession.selected_account_id === 'string' ? parseSession.selected_account_id : null,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load statement parse session' },
      { status: 500 },
    )
  }
}
