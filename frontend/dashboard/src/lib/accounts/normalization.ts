export type NormalizedAccountType =
  | 'savings'
  | 'current'
  | 'credit_card'
  | 'investment'
  | 'crypto_exchange'
  | 'loan'
  | 'fixed_deposit'

export type NormalizedInstitutionType = 'bank' | 'broker' | 'exchange' | 'insurer' | 'other'

export interface KnownInstitutionMetadata {
  code: string
  name: string
  countryCode: string
  type: NormalizedInstitutionType
  aliases: string[]
}

const KNOWN_INSTITUTIONS: Record<string, KnownInstitutionMetadata> = {
  dbs_bank: {
    code: 'dbs_bank',
    name: 'DBS Bank Ltd',
    countryCode: 'SG',
    type: 'bank',
    aliases: ['dbs', 'dbs bank', 'dbs bank ltd'],
  },
  dbs_cc: {
    code: 'dbs_cc',
    name: 'DBS Bank Ltd',
    countryCode: 'SG',
    type: 'bank',
    aliases: ['dbs card', 'dbs credit card', 'dbs cards'],
  },
  ocbc: {
    code: 'ocbc',
    name: 'OCBC Bank',
    countryCode: 'SG',
    type: 'bank',
    aliases: ['ocbc', 'ocbc bank'],
  },
  uob: {
    code: 'uob',
    name: 'UOB',
    countryCode: 'SG',
    type: 'bank',
    aliases: ['uob', 'united overseas bank'],
  },
  posb: {
    code: 'posb',
    name: 'POSB',
    countryCode: 'SG',
    type: 'bank',
    aliases: ['posb'],
  },
  trust_bank: {
    code: 'trust_bank',
    name: 'Trust Bank',
    countryCode: 'SG',
    type: 'bank',
    aliases: ['trust', 'trust bank'],
  },
  wise: {
    code: 'wise',
    name: 'Wise',
    countryCode: 'SG',
    type: 'other',
    aliases: ['wise'],
  },
  citibank: {
    code: 'citibank',
    name: 'Citibank Singapore Ltd',
    countryCode: 'SG',
    type: 'bank',
    aliases: ['citibank', 'citibank singapore ltd', 'citi', 'citi bank'],
  },
}

function cleanText(value?: string | null) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => cleanText(value)).filter(Boolean)))
}

export function normalizeInstitutionCode(
  rawCode?: string | null,
  values: Array<string | null | undefined> = [],
) {
  const normalizedCode = cleanText(rawCode).replace(/\s+/g, '_')
  if (normalizedCode && KNOWN_INSTITUTIONS[normalizedCode]) {
    return normalizedCode
  }

  const haystacks = uniqueStrings([rawCode, ...values])
  for (const institution of Object.values(KNOWN_INSTITUTIONS)) {
    if (haystacks.some((value) => institution.aliases.some((alias) => value === cleanText(alias) || value.includes(cleanText(alias))))) {
      return institution.code
    }
  }

  return normalizedCode || null
}

export function getKnownInstitutionMetadata(
  institutionCode?: string | null,
  values: Array<string | null | undefined> = [],
) {
  const normalizedCode = normalizeInstitutionCode(institutionCode, values)
  return normalizedCode ? KNOWN_INSTITUTIONS[normalizedCode] ?? null : null
}

export function canonicalizeInstitutionName(params: {
  institutionCode?: string | null
  institutionName?: string | null
  fallbackValues?: Array<string | null | undefined>
}) {
  const known = getKnownInstitutionMetadata(
    params.institutionCode,
    [params.institutionName, ...(params.fallbackValues ?? [])],
  )

  if (known) {
    return known.name
  }

  return params.institutionName?.trim() || params.fallbackValues?.find((value) => value?.trim())?.trim() || null
}

export function institutionsMatch(left?: string | null, right?: string | null) {
  const leftCode = normalizeInstitutionCode(null, [left])
  const rightCode = normalizeInstitutionCode(null, [right])

  if (leftCode && rightCode) {
    return leftCode === rightCode
  }

  const leftNormalized = cleanText(left)
  const rightNormalized = cleanText(right)

  if (!leftNormalized || !rightNormalized) {
    return false
  }

  return leftNormalized === rightNormalized || leftNormalized.includes(rightNormalized) || rightNormalized.includes(leftNormalized)
}

function isLoanLike(value: string) {
  return (
    value.includes('ready credit')
    || value.includes('credit line')
    || value.includes('line of credit')
    || value.includes('personal loan')
    || value.includes('unsecured loan')
    || value.includes('term loan')
    || value.includes('revolving loan')
    || value.includes('revolving credit')
    || value.includes('cash line')
    || /\bloan\b/.test(value)
  )
}

export function normalizeAccountType(
  raw?: string | null,
  extraValues: Array<string | null | undefined> = [],
): NormalizedAccountType {
  const value = cleanText(raw)
  const haystack = uniqueStrings([raw, ...extraValues]).join(' ')

  if (isLoanLike(haystack) || isLoanLike(value)) return 'loan'
  if (value.includes('crypto') || value.includes('exchange') || haystack.includes('crypto exchange')) return 'crypto_exchange'
  if (value.includes('invest') || haystack.includes('brokerage')) return 'investment'
  if (value.includes('deposit')) return 'fixed_deposit'
  if (value.includes('current')) return 'current'
  if (value.includes('credit')) return 'credit_card'
  if (value.includes('card') || haystack.includes('mastercard') || haystack.includes('visa')) return 'credit_card'

  return 'savings'
}
