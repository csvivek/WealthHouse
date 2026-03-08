import { readFileSync } from 'fs'
import { join } from 'path'

export interface ApprovedCategoryDefinition {
  canonicalName: string
  purpose: string
  aliases: string[]
}

export interface AvailableCategory {
  id: number
  name: string
  type?: 'income' | 'expense' | 'transfer' | null
  group_name?: string | null
}

const CATEGORIES_DOC_PATH = join(process.cwd(), 'knowledge', 'categories.md')

const BUILTIN_ALIASES: Record<string, string[]> = {
  Groceries: ['grocery', 'supermarket', 'market'],
  'Eating Out': ['dining', 'food', 'restaurant', 'restaurants', 'cafe', 'coffee', 'takeaway'],
  'General Household': ['household', 'home supplies', 'home'],
  Transport: ['transport', 'transportation', 'travel', 'bus', 'mrt', 'taxi', 'ride'],
  Shopping: ['retail', 'online shopping', 'marketplace', 'ecommerce'],
  Kids: ['children', 'child', 'school'],
  Subscriptions: ['subscription', 'subscriptions', 'saas', 'software', 'membership'],
  Dining: ['fine dining', 'celebration dining'],
  'Flowers / Gifts': ['flowers', 'flower', 'gift', 'gifts'],
  Other: ['other', 'misc', 'miscellaneous', 'uncategorized', 'unknown', 'utilities', 'bills', 'fees', 'cash', 'salary', 'interest', 'transfer', 'refund', 'payment', 'investments'],
}

let cachedDefinitions: ApprovedCategoryDefinition[] | null = null

function parseTableRow(line: string) {
  return line
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell, index, values) => !(index === 0 && cell === '') && !(index === values.length - 1 && cell === ''))
}

function normalizeCategoryToken(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function buildAliases(canonicalName: string, aliases: string[] = []) {
  return Array.from(
    new Set(
      [...aliases, ...(BUILTIN_ALIASES[canonicalName] ?? [])]
        .map((value) => normalizeCategoryToken(value))
        .filter(Boolean),
    ),
  )
}

function parseMarkdownTableDefinitions(markdown: string) {
  const definitions: ApprovedCategoryDefinition[] = []

  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|') || line.includes('Canonical Category') || line.includes('---')) {
      continue
    }

    const [canonicalName, purpose, aliases] = parseTableRow(line)
    if (!canonicalName || !purpose) {
      continue
    }

    definitions.push({
      canonicalName,
      purpose,
      aliases: buildAliases(canonicalName, (aliases || '').split(',')),
    })
  }

  return definitions
}

function parseNarrativeDefinitions(markdown: string) {
  const definitions: ApprovedCategoryDefinition[] = []
  const lines = markdown.split('\n')
  let inPrimaryCategories = false
  let currentName: string | null = null
  let currentPurpose = ''

  function flushCurrent() {
    if (!currentName) {
      return
    }

    definitions.push({
      canonicalName: currentName,
      purpose: currentPurpose || `${currentName} spending category`,
      aliases: buildAliases(currentName),
    })
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!inPrimaryCategories) {
      if (line.toLowerCase() === 'primary categories') {
        inPrimaryCategories = true
      }
      continue
    }

    if (/^merchant mapping rules$/i.test(line)) {
      break
    }

    const headingMatch = line.match(/^\d+\.\s+(.+)$/)
    if (headingMatch) {
      flushCurrent()
      currentName = headingMatch[1].trim()
      currentPurpose = ''
      continue
    }

    if (!currentName || !line || line === '⸻') {
      continue
    }

    if (
      line.startsWith('Examples:') ||
      line.startsWith('Example Merchants:') ||
      line.startsWith('Example tracked items:') ||
      line.startsWith('Merchant Mapping Rules') ||
      line.startsWith('Version') ||
      line.startsWith('Category Design Principles') ||
      line.startsWith('Grocery Intelligence Categories')
    ) {
      continue
    }

    if (line.startsWith('•')) {
      continue
    }

    if (!currentPurpose) {
      currentPurpose = line
    }
  }

  flushCurrent()
  return definitions
}

export function loadApprovedCategoryDefinitions(): ApprovedCategoryDefinition[] {
  if (cachedDefinitions) {
    return cachedDefinitions
  }

  const markdown = readFileSync(CATEGORIES_DOC_PATH, 'utf-8')
  const tableDefinitions = parseMarkdownTableDefinitions(markdown)
  const narrativeDefinitions = tableDefinitions.length === 0 ? parseNarrativeDefinitions(markdown) : []

  cachedDefinitions = tableDefinitions.length > 0 ? tableDefinitions : narrativeDefinitions
  return cachedDefinitions
}

export function getApprovedCategoryNames() {
  return loadApprovedCategoryDefinitions().map((definition) => definition.canonicalName)
}

export function resolveApprovedCategoryName(candidate?: string | null) {
  const normalizedCandidate = normalizeCategoryToken(candidate || '')
  if (!normalizedCandidate) {
    return null
  }

  for (const definition of loadApprovedCategoryDefinitions()) {
    if (normalizeCategoryToken(definition.canonicalName) === normalizedCandidate) {
      return definition.canonicalName
    }

    if (definition.aliases.includes(normalizedCandidate)) {
      return definition.canonicalName
    }
  }

  return null
}

export function mapApprovedCategoryToAvailableCategory(
  availableCategories: AvailableCategory[],
  canonicalCategoryName?: string | null,
) {
  const canonical = resolveApprovedCategoryName(canonicalCategoryName)
  if (!canonical) {
    return null
  }

  const normalizedCanonical = normalizeCategoryToken(canonical)
  const exactMatch = availableCategories.find(
    (category) => normalizeCategoryToken(category.name) === normalizedCanonical,
  )
  if (exactMatch) {
    return exactMatch
  }

  const definition = loadApprovedCategoryDefinitions().find(
    (entry) => normalizeCategoryToken(entry.canonicalName) === normalizedCanonical,
  )

  if (!definition) {
    return null
  }

  for (const alias of definition.aliases) {
    const aliasMatch = availableCategories.find(
      (category) => normalizeCategoryToken(category.name) === alias,
    )
    if (aliasMatch) {
      return aliasMatch
    }
  }

  return null
}
