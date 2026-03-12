import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { getAuthenticatedHouseholdContext } from '@/lib/server/household-context'
import { mergeTags } from '@/lib/server/tag-service'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const targetId = String(body?.targetId ?? '').trim()
    if (!targetId) return NextResponse.json({ error: 'targetId is required' }, { status: 400 })

    const result = await mergeTags({
      db: createServiceSupabaseClient(),
      householdId: ctx.householdId,
      survivorTagId: targetId,
      victimTagId: id,
      actorUserId: ctx.userId,
    })

    return NextResponse.json({ success: true, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to merge tag'
    return NextResponse.json({ error: message }, { status: /required|itself/i.test(message) ? 400 : /not found/i.test(message) ? 404 : 500 })
  }
}
