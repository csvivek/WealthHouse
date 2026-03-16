import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  extractIconUrlFromHtml,
  resolveInstitutionBrandMetadata,
  resolveInstitutionBrandPreview,
} from '@/lib/server/institution-branding'

describe('institution branding helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('matches brands from aliases', () => {
    const brand = resolveInstitutionBrandMetadata(null, ['DBS Bank'])
    expect(brand).toEqual(expect.objectContaining({
      code: 'dbs_bank',
      name: 'DBS Bank Ltd',
      websiteUrl: 'https://www.dbs.com/',
    }))
  })

  it('prefers apple-touch-icon and resolves relative icon URLs', () => {
    const iconUrl = extractIconUrlFromHtml(`
      <html>
        <head>
          <link rel="icon" href="/favicon.ico" />
          <link rel="apple-touch-icon" href="/brand/apple-touch.png" />
        </head>
      </html>
    `, 'https://www.dbs.com/')

    expect(iconUrl).toBe('https://www.dbs.com/brand/apple-touch.png')
  })

  it('falls back to favicon.ico when no icon link exists', () => {
    const iconUrl = extractIconUrlFromHtml('<html><head></head></html>', 'https://www.ocbc.com/')
    expect(iconUrl).toBe('https://www.ocbc.com/favicon.ico')
  })

  it('builds a verified preview from the curated institution website', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => '<link rel="shortcut icon" href="/icons/dbs.ico" />',
    })))

    const preview = await resolveInstitutionBrandPreview({
      institutionName: 'DBS',
    })

    expect(preview).toEqual({
      matched: true,
      brandCode: 'dbs_bank',
      canonicalName: 'DBS Bank Ltd',
      websiteUrl: 'https://www.dbs.com/',
      iconUrl: 'https://www.dbs.com/icons/dbs.ico',
    })
  })
})
