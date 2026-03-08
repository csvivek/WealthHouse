interface GoogleSearchItem {
  title?: string
  snippet?: string
  link?: string
}

export interface WebMerchantSummary {
  summary: string | null
  snippets: string[]
  links: string[]
}

export function canUseGoogleSearch() {
  return Boolean(process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_CSE_ID)
}

export async function searchMerchantOnWeb(query: string): Promise<WebMerchantSummary | null> {
  if (!canUseGoogleSearch()) {
    return null
  }

  const apiKey = process.env.GOOGLE_SEARCH_API_KEY
  const cseId = process.env.GOOGLE_CSE_ID
  const url = new URL('https://www.googleapis.com/customsearch/v1')
  url.searchParams.set('key', apiKey as string)
  url.searchParams.set('cx', cseId as string)
  url.searchParams.set('q', query)
  url.searchParams.set('num', '5')

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Google search failed: ${response.status}`)
  }

  const payload = await response.json() as { items?: GoogleSearchItem[] }
  const items = payload.items ?? []
  if (items.length === 0) {
    return null
  }

  const snippets = items
    .map((item) => item.snippet?.trim())
    .filter((value): value is string => Boolean(value))

  const links = items
    .map((item) => item.link?.trim())
    .filter((value): value is string => Boolean(value))

  return {
    summary: snippets.slice(0, 3).join(' '),
    snippets,
    links,
  }
}
