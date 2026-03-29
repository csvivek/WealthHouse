import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { listStatementIngestionJobsForUser } from '@/lib/server/statement-ingestion-jobs'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const jobIds = request.nextUrl.searchParams.getAll('jobId')

    return NextResponse.json({
      jobs: listStatementIngestionJobsForUser(user.id, jobIds.length ? jobIds : undefined),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load statement ingestion jobs' },
      { status: 500 },
    )
  }
}
