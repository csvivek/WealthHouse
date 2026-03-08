export function normalizeMerchantName(value?: string | null) {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(pte|ltd|llp|co|company|singapore|sg|store|branch|outlet)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeItemName(value?: string | null) {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(pack|pkt|pc|pcs|piece|pieces|ea|each|qty)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]+/g, '')
    if (!cleaned) return null
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export function clampConfidence(value: unknown, defaultValue = 0): number {
  const parsed = parseNumeric(value)
  if (parsed == null) return defaultValue
  const normalized = parsed > 1 ? parsed / 100 : parsed
  if (normalized < 0) return 0
  if (normalized > 1) return 1
  return normalized
}

export function coerceDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const raw = value.trim()

  const directDate = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
  if (directDate) return directDate

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

export function coerceTime(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const raw = value.trim()

  if (/^\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    return raw.length === 5 ? `${raw}:00` : raw
  }

  const parsed = new Date(`1970-01-01T${raw}`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(11, 19)
}

export function buildItemSignature(itemNames: string[]) {
  return itemNames
    .map((name) => normalizeItemName(name))
    .filter(Boolean)
    .sort()
    .join('|')
}
