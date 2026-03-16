// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/ai/statement/[importId]/file/route'
import { assertStatementStorageConfig, mapStatementStorageErrorMessage } from '@/lib/statements/config'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { createStatementSignedUrl } from '@/lib/server/statement-storage'

vi.mock('@/lib/statements/config', () => ({
  assertStatementStorageConfig: vi.fn(),
  mapStatementStorageErrorMessage: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/server/statement-storage', () => ({
  createStatementSignedUrl: vi.fn(),
}))

const mockedAssertStatementStorageConfig = vi.mocked(assertStatementStorageConfig)
const mockedMapStatementStorageErrorMessage = vi.mocked(mapStatementStorageErrorMessage)
const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient)
const mockedCreateServiceSupabaseClient = vi.mocked(createServiceSupabaseClient)
const mockedCreateStatementSignedUrl = vi.mocked(createStatementSignedUrl)

function createServerSupabaseMock(options?: {
  fileImport?: {
    id: string
    storage_bucket: string | null
    storage_path: string | null
  } | null
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
    from(table: string) {
      if (table === 'user_profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { household_id: 'hh-1' }, error: null }),
            }),
          }),
        }
      }

      if (table === 'file_imports') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: options?.fileImport ?? null, error: null }),
              }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

describe('GET /api/ai/statement/[importId]/file', () => {
  beforeEach(() => {
    mockedAssertStatementStorageConfig.mockReset()
    mockedMapStatementStorageErrorMessage.mockReset()
    mockedCreateServerSupabaseClient.mockReset()
    mockedCreateServiceSupabaseClient.mockReset()
    mockedCreateStatementSignedUrl.mockReset()

    mockedAssertStatementStorageConfig.mockImplementation(() => undefined)
    mockedMapStatementStorageErrorMessage.mockImplementation((message) => ({
      code: 'statement_storage_failed',
      userMessage: `mapped: ${message}`,
      status: 500,
    }))
    mockedCreateServerSupabaseClient.mockResolvedValue(createServerSupabaseMock({
      fileImport: {
        id: 'import-1',
        storage_bucket: 'statements',
        storage_path: 'households/hh-1/statements/import-1/statement.pdf',
      },
    }) as never)
    mockedCreateServiceSupabaseClient.mockReturnValue({ storage: {} } as never)
    mockedCreateStatementSignedUrl.mockResolvedValue('https://signed.example.com/statement.pdf')
  })

  it('redirects authorized users to a signed statement URL', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/ai/statement/import-1/file'),
      { params: Promise.resolve({ importId: 'import-1' }) },
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://signed.example.com/statement.pdf')
    expect(mockedCreateStatementSignedUrl).toHaveBeenCalledWith({
      supabase: { storage: {} },
      storageBucket: 'statements',
      storagePath: 'households/hh-1/statements/import-1/statement.pdf',
    })
  })

  it('returns 404 when the import has no stored source file', async () => {
    mockedCreateServerSupabaseClient.mockResolvedValueOnce(createServerSupabaseMock({
      fileImport: {
        id: 'import-1',
        storage_bucket: null,
        storage_path: null,
      },
    }) as never)

    const response = await GET(
      new NextRequest('http://localhost/api/ai/statement/import-1/file'),
      { params: Promise.resolve({ importId: 'import-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(payload).toEqual({ error: 'Stored statement file not found' })
    expect(mockedCreateStatementSignedUrl).not.toHaveBeenCalled()
  })

  it('rejects access when the import is outside the current household', async () => {
    mockedCreateServerSupabaseClient.mockResolvedValueOnce(createServerSupabaseMock({
      fileImport: null,
    }) as never)

    const response = await GET(
      new NextRequest('http://localhost/api/ai/statement/import-1/file'),
      { params: Promise.resolve({ importId: 'import-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(payload).toEqual({ error: 'Import not found' })
  })
})
