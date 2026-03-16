import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import {
  assertStatementStorageConfig,
  mapStatementStorageErrorMessage,
} from '@/lib/statements/config'
import { createStatementSignedUrl } from '@/lib/server/statement-storage'

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<unknown> },
) {
  try {
    const { importId } = await context.params as { importId: string }
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

    const { data: fileImport, error } = await supabase
      .from('file_imports')
      .select('id, storage_bucket, storage_path')
      .eq('id', importId)
      .eq('household_id', profile.household_id)
      .maybeSingle()

    if (error || !fileImport) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 })
    }

    const storageBucket = readString(fileImport.storage_bucket)
    const storagePath = readString(fileImport.storage_path)
    if (!storageBucket || !storagePath) {
      return NextResponse.json({ error: 'Stored statement file not found' }, { status: 404 })
    }

    try {
      assertStatementStorageConfig()
    } catch (configError) {
      return NextResponse.json(
        {
          error: configError instanceof Error ? configError.message : 'Statement storage configuration is missing.',
        },
        { status: 503 },
      )
    }

    const serviceSupabase = createServiceSupabaseClient() as any

    let signedUrl: string
    try {
      signedUrl = await createStatementSignedUrl({
        supabase: serviceSupabase,
        storageBucket,
        storagePath,
      })
    } catch (storageError) {
      const message = storageError instanceof Error ? storageError.message : 'Failed to create statement download URL'
      const mapped = mapStatementStorageErrorMessage(message)
      return NextResponse.json(
        {
          error: mapped.userMessage,
          code: mapped.code,
          details: message,
        },
        { status: mapped.status },
      )
    }

    return NextResponse.redirect(signedUrl)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to load stored statement file',
      },
      { status: 500 },
    )
  }
}
