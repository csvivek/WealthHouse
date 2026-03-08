import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { listReceiptIngestionJobsForUser } from '@/lib/server/receipt-ingestion-jobs'

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
      jobs: listReceiptIngestionJobsForUser(user.id, jobIds.length ? jobIds : undefined),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load receipt ingestion jobs' },
      { status: 500 },
    )
  }
}
