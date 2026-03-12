import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { getAuthenticatedHouseholdContext } from '@/lib/server/household-context'
import { deleteTag, getTagById, updateTag } from '@/lib/server/tag-service'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const tag = await getTagById(createServiceSupabaseClient(), ctx.householdId, id)
    if (!tag) return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    return NextResponse.json({ tag })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load tag' },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const tag = await updateTag({
      db: createServiceSupabaseClient(),
      householdId: ctx.householdId,
      tagId: id,
      actorUserId: ctx.userId,
      name: typeof body?.name === 'string' ? body.name : undefined,
      color_token: typeof body?.color_token === 'string' ? body.color_token : undefined,
      color_hex: typeof body?.color_hex === 'string' || body?.color_hex === null ? body.color_hex : undefined,
      icon_key: typeof body?.icon_key === 'string' ? body.icon_key : undefined,
      description: typeof body?.description === 'string' || body?.description === null ? body.description : undefined,
    })

    return NextResponse.json({ tag })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update tag'
    return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : /required|exists/i.test(message) ? 400 : 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const result = await deleteTag({
      db: createServiceSupabaseClient(),
      householdId: ctx.householdId,
      tagId: id,
      actorUserId: ctx.userId,
    })

    return NextResponse.json({ success: true, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete tag'
    return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : 500 })
  }
}
