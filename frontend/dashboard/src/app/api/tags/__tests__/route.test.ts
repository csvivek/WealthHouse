// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/tags/route'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { createTag, listTags } from '@/lib/server/tag-service'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/server/tag-service', () => ({
  listTags: vi.fn(),
  createTag: vi.fn(),
}))

const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient)
const mockedCreateServiceSupabaseClient = vi.mocked(createServiceSupabaseClient)
const mockedListTags = vi.mocked(listTags)
const mockedCreateTag = vi.mocked(createTag)

function createSupabaseMock(userId: string | null, householdId: string | null = 'hh-1') {
  return {
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null } }),
    },
    from: (table: string) => {
      if (table === 'user_profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: householdId ? { household_id: householdId } : null }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

describe('GET /api/tags', () => {
  beforeEach(() => {
    mockedCreateServerSupabaseClient.mockReset()
    mockedCreateServiceSupabaseClient.mockReset()
    mockedListTags.mockReset()
    mockedCreateTag.mockReset()
    mockedCreateServiceSupabaseClient.mockReturnValue({} as never)
  })

  it('returns 401 when unauthenticated', async () => {
    mockedCreateServerSupabaseClient.mockResolvedValueOnce(createSupabaseMock(null) as never)
    const response = await GET(new NextRequest('http://localhost/api/tags'))
    const payload = await response.json()
    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Unauthorized' })
  })

  it('lists tags for the current household', async () => {
    mockedCreateServerSupabaseClient.mockResolvedValueOnce(createSupabaseMock('user-1') as never)
    mockedListTags.mockResolvedValueOnce([
      {
        id: 'tag-1',
        household_id: 'hh-1',
        name: 'Travel',
        normalized_name: 'travel',
        color_token: 'chart-4',
        color_hex: null,
        icon_key: 'travel',
        description: null,
        source: 'default',
        source_member_id: null,
        is_active: true,
        merged_into_tag_id: null,
        created_by: null,
        updated_by: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        statement_mapped_count: 2,
        receipt_mapped_count: 1,
        total_mapped_count: 3,
      },
    ] as never)

    const response = await GET(new NextRequest('http://localhost/api/tags?sortBy=usage_count'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.tags).toHaveLength(1)
    expect(mockedListTags).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ householdId: 'hh-1', sortBy: 'usage_count' }),
    )
  })

  it('creates a tag', async () => {
    mockedCreateServerSupabaseClient.mockResolvedValueOnce(createSupabaseMock('user-1') as never)
    mockedCreateTag.mockResolvedValueOnce({
      id: 'tag-1',
      household_id: 'hh-1',
      name: 'Medical',
      normalized_name: 'medical',
      color_token: 'slate',
      color_hex: null,
      icon_key: 'tag',
      description: null,
      source: 'custom',
      source_member_id: null,
      is_active: true,
      merged_into_tag_id: null,
      created_by: 'user-1',
      updated_by: 'user-1',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    } as never)

    const response = await POST(new NextRequest('http://localhost/api/tags', {
      method: 'POST',
      body: JSON.stringify({ name: 'Medical' }),
      headers: { 'Content-Type': 'application/json' },
    }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.tag.name).toBe('Medical')
    expect(mockedCreateTag).toHaveBeenCalledWith(
      expect.objectContaining({ householdId: 'hh-1', actorUserId: 'user-1', name: 'Medical' }),
    )
  })
})
