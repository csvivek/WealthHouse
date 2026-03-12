import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { getAuthenticatedHouseholdContext } from '@/lib/server/household-context'
import { getStatementTransactionTags, replaceTagsOnStatementTransaction } from '@/lib/server/tag-service'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    const tags = await getStatementTransactionTags(createServiceSupabaseClient(), ctx.householdId, id)
    return NextResponse.json({ tags })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load tags'
    return NextResponse.json({ error: message }, { status: /not found|household/i.test(message) ? 404 : 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    const body = await request.json()
    const result = await replaceTagsOnStatementTransaction({
      db: createServiceSupabaseClient(),
      householdId: ctx.householdId,
      transactionId: id,
      tagIds: Array.isArray(body?.tagIds) ? body.tagIds : [],
      actorUserId: ctx.userId,
    })
    return NextResponse.json({ success: true, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update transaction tags'
    return NextResponse.json({ error: message }, { status: /not found|household/i.test(message) ? 404 : /tag/i.test(message) ? 400 : 500 })
  }
}
