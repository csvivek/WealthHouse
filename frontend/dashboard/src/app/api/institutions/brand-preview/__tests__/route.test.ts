// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/institutions/brand-preview/route'

describe('GET /api/institutions/brand-preview', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a matched verified brand preview for known institutions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => '<link rel="icon" href="/favicon.ico" />',
    })))

    const response = await GET(new NextRequest('http://localhost/api/institutions/brand-preview?name=DBS'))
    const payload = await response.json()

    expect(payload).toEqual({
      matched: true,
      brandCode: 'dbs_bank',
      canonicalName: 'DBS Bank Ltd',
      websiteUrl: 'https://www.dbs.com/',
      iconUrl: 'https://www.dbs.com/favicon.ico',
    })
  })

  it('returns matched false for unknown institutions', async () => {
    const response = await GET(new NextRequest('http://localhost/api/institutions/brand-preview?name=Unknown%20Bank'))
    expect(await response.json()).toEqual({ matched: false })
  })
})
