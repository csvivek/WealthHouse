import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { getAuthenticatedHouseholdContext } from '@/lib/server/household-context'
import { createTag, listTags } from '@/lib/server/tag-service'

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthenticatedHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const searchParams = request.nextUrl.searchParams
    const rows = await listTags(createServiceSupabaseClient(), {
      householdId: ctx.householdId,
      search: searchParams.get('search') ?? undefined,
      source: (searchParams.get('source') as 'all' | 'default' | 'member' | 'custom' | 'system' | null) ?? 'all',
      status: (searchParams.get('status') as 'all' | 'active' | 'inactive' | null) ?? 'active',
      sortBy: (searchParams.get('sortBy') as 'name' | 'created_at' | 'usage_count' | null) ?? 'name',
      sortDir: (searchParams.get('sortDir') as 'asc' | 'desc' | null) ?? 'asc',
    })

    return NextResponse.json({ tags: rows })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list tags' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthenticatedHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const tag = await createTag({
      db: createServiceSupabaseClient(),
      householdId: ctx.householdId,
      actorUserId: ctx.userId,
      name: String(body?.name ?? ''),
      color_token: typeof body?.color_token === 'string' ? body.color_token : undefined,
      color_hex: typeof body?.color_hex === 'string' ? body.color_hex : undefined,
      icon_key: typeof body?.icon_key === 'string' ? body.icon_key : undefined,
      description: typeof body?.description === 'string' ? body.description : undefined,
    })

    return NextResponse.json({ tag })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create tag'
    return NextResponse.json({ error: message }, { status: /required|exists/i.test(message) ? 400 : 500 })
  }
}
