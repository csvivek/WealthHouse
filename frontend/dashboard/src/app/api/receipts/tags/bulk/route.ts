import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { getAuthenticatedHouseholdContext } from '@/lib/server/household-context'
import {
  addTagsToMultipleReceiptTransactions,
  removeTagsFromMultipleReceiptTransactions,
} from '@/lib/server/tag-service'

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthenticatedHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const mode = body?.mode === 'remove' ? 'remove' : 'add'
    const receiptIds = Array.isArray(body?.receiptIds) ? body.receiptIds : []
    const tagIds = Array.isArray(body?.tagIds) ? body.tagIds : []
    const db = createServiceSupabaseClient()

    const result = mode === 'remove'
      ? await removeTagsFromMultipleReceiptTransactions({ db, householdId: ctx.householdId, receiptIds, tagIds })
      : await addTagsToMultipleReceiptTransactions({ db, householdId: ctx.householdId, receiptIds, tagIds, actorUserId: ctx.userId })

    return NextResponse.json({ success: true, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update tags'
    return NextResponse.json({ error: message }, { status: /not found|household/i.test(message) ? 404 : /tag/i.test(message) ? 400 : 500 })
  }
}
