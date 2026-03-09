interface InferredCategoryStyle {
  icon_key: string
  color_token: string
}

const STYLE_RULES: Array<{ pattern: RegExp; style: InferredCategoryStyle }> = [
  { pattern: /\b(salary|payroll|bonus|income)\b/i, style: { icon_key: 'salary', color_token: 'chart-1' } },
  { pattern: /\b(refund|reimbursement)\b/i, style: { icon_key: 'income', color_token: 'chart-1' } },
  { pattern: /\b(transfer|xfer)\b/i, style: { icon_key: 'transfer', color_token: 'chart-3' } },
  { pattern: /\b(grocery|groceries|supermarket|mart)\b/i, style: { icon_key: 'groceries', color_token: 'chart-2' } },
  { pattern: /\b(food|dining|restaurant|cafe|coffee)\b/i, style: { icon_key: 'food', color_token: 'chart-2' } },
  { pattern: /\b(transport|taxi|grab|uber|bus|train|mrt)\b/i, style: { icon_key: 'transport', color_token: 'chart-4' } },
  { pattern: /\b(home|housing|rent|mortgage)\b/i, style: { icon_key: 'home', color_token: 'chart-5' } },
  { pattern: /\b(utility|electric|water|gas|internet|phone)\b/i, style: { icon_key: 'utilities', color_token: 'chart-4' } },
  { pattern: /\b(health|medical|clinic|hospital|pharmacy)\b/i, style: { icon_key: 'healthcare', color_token: 'chart-5' } },
  { pattern: /\b(education|school|tuition|course)\b/i, style: { icon_key: 'education', color_token: 'chart-3' } },
  { pattern: /\b(entertainment|movie|music|game|stream)\b/i, style: { icon_key: 'entertainment', color_token: 'chart-5' } },
  { pattern: /\b(cash|atm|withdrawal)\b/i, style: { icon_key: 'cash', color_token: 'chart-4' } },
]

function trimOrNull(value: string | null | undefined) {
  const next = value?.trim()
  return next ? next : null
}

export function inferCategoryStyleFromName(name: string): InferredCategoryStyle {
  const normalized = name.trim()
  for (const rule of STYLE_RULES) {
    if (rule.pattern.test(normalized)) {
      return rule.style
    }
  }

  return { icon_key: 'tag', color_token: 'slate' }
}

export function resolveCategoryStyle(params: {
  name: string
  iconKey?: string | null
  colorToken?: string | null
  colorHex?: string | null
}) {
  const inferred = inferCategoryStyleFromName(params.name)

  return {
    icon_key: trimOrNull(params.iconKey) ?? inferred.icon_key,
    color_token: trimOrNull(params.colorToken) ?? inferred.color_token,
    color_hex: trimOrNull(params.colorHex),
  }
}
