import { NextResponse } from 'next/server'
import { buildChatSessionPayload } from '@/lib/ai/chat/session'
import { getAuthenticatedChatRequestContext } from '@/lib/ai/chat/request-context'

export async function GET() {
  try {
    const context = await getAuthenticatedChatRequestContext()
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await buildChatSessionPayload({
      supabase: context.supabase,
      userId: context.userId,
      householdId: context.householdId,
    })

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Chat session API error:', error)
    return NextResponse.json({ error: 'Failed to load chat session' }, { status: 500 })
  }
}
