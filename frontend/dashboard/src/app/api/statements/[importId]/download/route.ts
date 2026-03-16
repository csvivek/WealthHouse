import { NextResponse } from 'next/server'
import { mapStatementStorageErrorMessage } from '@/lib/statements/config'
import { createServerSupabaseClient } from '@/lib/supabase/server'

function buildContentDisposition(fileName: string) {
  const safeAscii = fileName.replace(/[^a-zA-Z0-9._-]+/g, '_')
  const encoded = encodeURIComponent(fileName)
  return `attachment; filename="${safeAscii || 'statement'}"; filename*=UTF-8''${encoded}`
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ importId: string }> },
) {
  try {
    const { importId } = await params
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

    const { data: fileImport, error: fileImportError } = await supabase
      .from('file_imports')
      .select('id, household_id, file_name, mime_type, storage_bucket, storage_path')
      .eq('id', importId)
      .eq('household_id', profile.household_id)
      .single()

    if (fileImportError || !fileImport) {
      return NextResponse.json({ error: 'Statement import not found' }, { status: 404 })
    }

    if (!fileImport.storage_bucket || !fileImport.storage_path) {
      return NextResponse.json({ error: 'Original statement unavailable for this import' }, { status: 404 })
    }

    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from(fileImport.storage_bucket)
      .download(fileImport.storage_path)

    if (downloadError || !fileBlob) {
      const mapped = mapStatementStorageErrorMessage(downloadError?.message || 'Failed to download statement')
      return NextResponse.json(
        {
          error: mapped.userMessage,
          details: downloadError?.message || null,
        },
        { status: mapped.status },
      )
    }

    const arrayBuffer = await fileBlob.arrayBuffer()
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': fileImport.mime_type || fileBlob.type || 'application/octet-stream',
        'Content-Disposition': buildContentDisposition(fileImport.file_name),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to download statement' },
      { status: 500 },
    )
  }
}
