import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

type FileImportUpdate = Database['public']['Tables']['file_imports']['Update']
type ImportStagingUpdate = Database['public']['Tables']['import_staging']['Update']

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ importId: string }> },
) {
  try {
    const { importId } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

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

    const { data: fileImport, error: fileImportError } = await supabase
      .from('file_imports')
      .select('id, status')
      .eq('id', importId)
      .eq('household_id', profile.household_id)
      .single()

    if (fileImportError || !fileImport) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 })
    }

    if (fileImport.status !== 'committed') {
      return NextResponse.json({ error: 'Only committed imports can be reopened' }, { status: 400 })
    }

    const { count: committedImportCount, error: committedImportError } = await supabase
      .from('statement_imports')
      .select('id', { count: 'exact', head: true })
      .eq('file_import_id', importId)

    if (committedImportError) {
      return NextResponse.json({ error: 'Failed to inspect committed import state' }, { status: 500 })
    }

    if (!committedImportCount) {
      return NextResponse.json({ error: 'No committed statement imports found for this file import' }, { status: 400 })
    }

    const fileImportUpdate: FileImportUpdate = {
      status: 'in_review',
      updated_at: new Date().toISOString(),
    }

    const { error: reopenError } = await supabase
      .from('file_imports')
      .update(fileImportUpdate)
      .eq('id', importId)

    if (reopenError) {
      return NextResponse.json({ error: reopenError.message }, { status: 500 })
    }

    const stagingUpdate: ImportStagingUpdate = {
      review_status: 'approved',
      updated_at: new Date().toISOString(),
    }

    const { error: stagingError } = await supabase
      .from('import_staging')
      .update(stagingUpdate)
      .eq('file_import_id', importId)
      .eq('review_status', 'committed')

    if (stagingError) {
      return NextResponse.json({ error: stagingError.message }, { status: 500 })
    }

    return NextResponse.json({
      status: 'in_review',
      reopened: true,
    })
  } catch (error) {
    console.error('Failed to reopen statement import:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reopen statement import' },
      { status: 500 },
    )
  }
}
