import institutionRegistry from '@/lib/accounts/institution-registry.json'
import type { Database } from '@/types/database'

type InstitutionType = Database['public']['Enums']['institution_type']

export interface InstitutionBrandMetadata {
  code: string
  name: string
  countryCode: string
  type: InstitutionType
  websiteUrl: string
  aliases: string[]
}

export interface InstitutionBrandPreview {
  matched: true
  brandCode: string
  canonicalName: string
  websiteUrl: string
  iconUrl: string
}

const BRAND_ICON_CACHE = new Map<string, Promise<string> | string>()

function cleanText(value?: string | null) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const KNOWN_INSTITUTION_BRANDS = institutionRegistry as InstitutionBrandMetadata[]

export function getInstitutionBrandByCode(code?: string | null) {
  const normalized = cleanText(code).replace(/\s+/g, '_')
  return KNOWN_INSTITUTION_BRANDS.find((brand) => brand.code === normalized) ?? null
}

export function resolveInstitutionBrandMetadata(
  institutionCode?: string | null,
  values: Array<string | null | undefined> = [],
) {
  const byCode = getInstitutionBrandByCode(institutionCode)
  if (byCode) return byCode

  const haystacks = [institutionCode, ...values]
    .map((value) => cleanText(value))
    .filter(Boolean)

  return KNOWN_INSTITUTION_BRANDS.find((brand) =>
    haystacks.some((value) =>
      brand.aliases.some((alias) => {
        const normalizedAlias = cleanText(alias)
        return value === normalizedAlias || value.includes(normalizedAlias) || normalizedAlias.includes(value)
      }),
    ),
  ) ?? null
}

export function extractIconUrlFromHtml(html: string, websiteUrl: string) {
  const iconRelPattern = /<link\b[^>]*rel=(['"])(.*?)\1[^>]*>/gi
  const hrefPattern = /\bhref=(['"])(.*?)\1/i
  const candidates: Array<{ href: string; score: number }> = []

  for (const match of html.matchAll(iconRelPattern)) {
    const tag = match[0]
    const relValue = match[2] ?? ''
    const normalizedRel = cleanText(relValue)
    if (!normalizedRel.includes('icon')) continue

    const hrefMatch = tag.match(hrefPattern)
    const href = hrefMatch?.[2]?.trim()
    if (!href) continue

    let score = 1
    if (normalizedRel.includes('apple touch icon')) score = 4
    else if (normalizedRel.includes('shortcut icon')) score = 3
    else if (normalizedRel.includes('mask icon')) score = 2

    candidates.push({ href, score })
  }

  candidates.sort((left, right) => right.score - left.score)
  const href = candidates[0]?.href
  if (!href) return new URL('/favicon.ico', websiteUrl).toString()

  try {
    return new URL(href, websiteUrl).toString()
  } catch {
    return new URL('/favicon.ico', websiteUrl).toString()
  }
}

async function fetchWebsiteHtml(websiteUrl: string) {
  const response = await fetch(websiteUrl, {
    headers: {
      'user-agent': 'Mozilla/5.0 WealthHouse/1.0',
      accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Failed to load ${websiteUrl}: ${response.status}`)
  }

  return response.text()
}

export async function resolveInstitutionBrandIconUrl(websiteUrl: string) {
  const cached = BRAND_ICON_CACHE.get(websiteUrl)
  if (typeof cached === 'string') return cached
  if (cached) return cached

  const promise = (async () => {
    try {
      const html = await fetchWebsiteHtml(websiteUrl)
      return extractIconUrlFromHtml(html, websiteUrl)
    } catch {
      return new URL('/favicon.ico', websiteUrl).toString()
    }
  })()

  BRAND_ICON_CACHE.set(websiteUrl, promise)
  const iconUrl = await promise
  BRAND_ICON_CACHE.set(websiteUrl, iconUrl)
  return iconUrl
}

export async function resolveInstitutionBrandPreview(params: {
  institutionCode?: string | null
  institutionName?: string | null
  brandCode?: string | null
}) {
  const metadata = resolveInstitutionBrandMetadata(
    params.brandCode || params.institutionCode,
    [params.institutionName],
  )

  if (!metadata) return null

  const iconUrl = await resolveInstitutionBrandIconUrl(metadata.websiteUrl)

  return {
    matched: true,
    brandCode: metadata.code,
    canonicalName: metadata.name,
    websiteUrl: metadata.websiteUrl,
    iconUrl,
  } satisfies InstitutionBrandPreview
}

export function websiteHostLabel(websiteUrl?: string | null) {
  if (!websiteUrl) return null
  try {
    return new URL(websiteUrl).host.replace(/^www\./, '')
  } catch {
    return websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
  }
}
