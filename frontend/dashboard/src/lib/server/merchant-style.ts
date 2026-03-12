interface MerchantStyle {
  icon_key: string
  color_token: string
}

const STYLE_RULES: Array<{ pattern: RegExp; style: MerchantStyle }> = [
  { pattern: /\b(coffee|cafe|starbucks)\b/i, style: { icon_key: 'coffee', color_token: 'chart-2' } },
  { pattern: /\b(restaurant|food|burger|pizza|mcdonald|kfc)\b/i, style: { icon_key: 'food', color_token: 'chart-2' } },
  { pattern: /\b(grocery|market|mart|fairprice|ntuc|cold storage)\b/i, style: { icon_key: 'cart', color_token: 'chart-4' } },
  { pattern: /\b(grab|uber|taxi|mrt|bus|shell|esso|caltex)\b/i, style: { icon_key: 'transport', color_token: 'chart-3' } },
  { pattern: /\b(bank|dbs|ocbc|uob|visa|mastercard)\b/i, style: { icon_key: 'bank', color_token: 'chart-1' } },
  { pattern: /\b(pharmacy|clinic|hospital|guardian|watsons)\b/i, style: { icon_key: 'health', color_token: 'chart-5' } },
  { pattern: /\b(amazon|shopee|lazada|retail|mall|shop)\b/i, style: { icon_key: 'bag', color_token: 'chart-4' } },
  { pattern: /\b(air|travel|hotel|airbnb|booking)\b/i, style: { icon_key: 'travel', color_token: 'chart-5' } },
]

function trimOrNull(value?: string | null) {
  const next = value?.trim()
  return next ? next : null
}

export function inferMerchantStyleFromName(name: string): MerchantStyle {
  for (const rule of STYLE_RULES) {
    if (rule.pattern.test(name)) {
      return rule.style
    }
  }

  return { icon_key: 'store', color_token: 'slate' }
}

export function resolveMerchantStyle(params: {
  name: string
  iconKey?: string | null
  colorToken?: string | null
  colorHex?: string | null
}) {
  const inferred = inferMerchantStyleFromName(params.name)

  return {
    icon_key: trimOrNull(params.iconKey) ?? inferred.icon_key,
    color_token: trimOrNull(params.colorToken) ?? inferred.color_token,
    color_hex: trimOrNull(params.colorHex),
  }
}
