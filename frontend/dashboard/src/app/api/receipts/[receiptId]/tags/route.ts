import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { getAuthenticatedHouseholdContext } from '@/lib/server/household-context'
import { getReceiptTags, replaceTagsOnReceiptTransaction } from '@/lib/server/tag-service'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ receiptId: string }> }) {
  try {
    const ctx = await getAuthenticatedHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { receiptId } = await params
    const tags = await getReceiptTags(createServiceSupabaseClient(), ctx.householdId, receiptId)
    return NextResponse.json({ tags })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load tags'
    return NextResponse.json({ error: message }, { status: /not found|household/i.test(message) ? 404 : 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ receiptId: string }> }) {
  try {
    const ctx = await getAuthenticatedHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { receiptId } = await params
    const body = await request.json()
    const result = await replaceTagsOnReceiptTransaction({
      db: createServiceSupabaseClient(),
      householdId: ctx.householdId,
      receiptId,
      tagIds: Array.isArray(body?.tagIds) ? body.tagIds : [],
      actorUserId: ctx.userId,
    })
    return NextResponse.json({ success: true, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update receipt tags'
    return NextResponse.json({ error: message }, { status: /not found|household/i.test(message) ? 404 : /tag/i.test(message) ? 400 : 500 })
  }
}
