const LEGAL_SUFFIXES = new Set([
  'pte',
  'ltd',
  'limited',
  'llc',
  'inc',
  'co',
  'company',
  'corp',
  'corporation',
  'plc',
  'llp',
])

const COUNTRY_SUFFIXES = new Set(['sg', 'singapore'])

const NOISE_TOKENS = new Set([
  'ref',
  'reference',
  'auth',
  'approval',
  'trace',
  'terminal',
  'term',
  'txn',
  'pos',
  'visa',
  'mastercard',
])

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeApostrophes(value: string) {
  return value.replace(/[\u2018\u2019\u02bc]/g, "'")
}

function splitBeforeBranchSuffix(value: string) {
  return value
    .replace(/\s+#\s*\d{2,}\b.*$/i, '')
    .replace(/\s+\d{3,}\b.*$/i, '')
    .replace(/\s+(branch|outlet|store)\b.*$/i, '')
}

function splitOnSafeSeparators(value: string) {
  const parts = value.split(/\s(?:-|\/|\|)\s/)
  if (parts.length <= 1) return value

  const [left] = parts
  const leftWordCount = left.trim().split(/\s+/).filter(Boolean).length
  return leftWordCount > 0 ? left : value
}

function cleanSourceText(value?: string | null) {
  if (!value) return ''
  return collapseWhitespace(normalizeApostrophes(value))
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9']+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function stripTrailingNoiseTokens(tokens: string[]) {
  const next = [...tokens]
  while (next.length > 1) {
    const token = next[next.length - 1]
    const previous = next[next.length - 2] ?? ''
    if (COUNTRY_SUFFIXES.has(token) || NOISE_TOKENS.has(token)) {
      next.pop()
      continue
    }
    if (/^\d{2,}$/.test(token)) {
      next.pop()
      continue
    }
    if ((token === 'id' || token === 'no' || token === 'num') && /^\d{2,}$/.test(previous)) {
      next.pop()
      next.pop()
      continue
    }
    break
  }
  return next
}

function stripBusinessSuffixes(tokens: string[]) {
  return tokens.filter((token) => !LEGAL_SUFFIXES.has(token))
}

function stripNoiseTokens(tokens: string[]) {
  return tokens.filter((token) => !NOISE_TOKENS.has(token))
}

function titleCaseToken(token: string) {
  if (!token) return token
  if (token.includes("'")) {
    return token
      .split("'")
      .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part))
      .join("'")
  }
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
}

export function cleanMerchantSourceText(value?: string | null) {
  const cleaned = cleanSourceText(value)
  if (!cleaned) return ''

  const withoutBranchNoise = splitBeforeBranchSuffix(cleaned)
  return collapseWhitespace(splitOnSafeSeparators(withoutBranchNoise))
}

export function normalizeMerchantAlias(value?: string | null) {
  const cleaned = cleanMerchantSourceText(value)
  if (!cleaned) return ''

  const tokens = stripTrailingNoiseTokens(stripNoiseTokens(stripBusinessSuffixes(tokenize(cleaned))))
  return collapseWhitespace(tokens.join(' '))
}

export function normalizeMerchantCanonicalName(value?: string | null) {
  const cleaned = cleanMerchantSourceText(value)
  if (!cleaned) return ''

  let tokens = tokenize(cleaned)
  tokens = stripBusinessSuffixes(tokens)
  tokens = stripTrailingNoiseTokens(tokens)
  tokens = tokens.filter((token, index) => !(index === tokens.length - 1 && COUNTRY_SUFFIXES.has(token)))

  return collapseWhitespace(tokens.join(' '))
}

export function deriveMerchantDisplayName(value?: string | null) {
  const cleaned = cleanMerchantSourceText(value)
  if (!cleaned) return ''

  const tokens = normalizeMerchantCanonicalName(cleaned).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return ''

  return tokens.map(titleCaseToken).join(' ')
}

export function buildMerchantSearchTokens(value?: string | null) {
  const alias = normalizeMerchantAlias(value)
  const canonical = normalizeMerchantCanonicalName(value)
  return Array.from(new Set([alias, canonical].filter(Boolean)))
}
