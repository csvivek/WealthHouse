import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { listStatementCommitJobsForUser } from '@/lib/server/statement-commit-jobs'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const idsParam = request.nextUrl.searchParams.get('ids')
    const jobIds = idsParam
      ? idsParam.split(',').map((value) => value.trim()).filter(Boolean)
      : undefined

    const jobs = listStatementCommitJobsForUser(user.id, jobIds)
    return NextResponse.json({ jobs })
  } catch (error) {
    console.error('Statement commit jobs fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch statement commit jobs' }, { status: 500 })
  }
}
