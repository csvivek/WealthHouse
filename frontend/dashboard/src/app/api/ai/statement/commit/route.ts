import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { startStatementCommitJob } from '@/lib/server/statement-commit-jobs'

export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json()
    const { importId } = body

    if (!importId) {
      return NextResponse.json({ error: 'importId is required' }, { status: 400 })
    }

    const { data: fileImport, error: fileImportError } = await supabase
      .from('file_imports')
      .select('id, file_name, status')
      .eq('id', importId)
      .eq('household_id', profile.household_id)
      .single()

    if (fileImportError || !fileImport) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 })
    }

    if (fileImport.status !== 'in_review' && fileImport.status !== 'committing') {
      return NextResponse.json(
        { error: `Import is in "${fileImport.status}" state. Only "in_review" imports can be committed.` },
        { status: 400 },
      )
    }

    const job = startStatementCommitJob({
      importId,
      fileName: fileImport.file_name,
      userId: user.id,
      householdId: profile.household_id,
    })

    return NextResponse.json(
      {
        job,
        message: 'Commit started in the background.',
      },
      { status: 202 },
    )
  } catch (error) {
    console.error('Statement commit start error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start statement commit job' },
      { status: 500 },
    )
  }
}
