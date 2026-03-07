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
  group_name?: string | null
}

const CATEGORIES_DOC_PATH = join(process.cwd(), 'knowledge', 'categories.md')

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

export function loadApprovedCategoryDefinitions(): ApprovedCategoryDefinition[] {
  if (cachedDefinitions) {
    return cachedDefinitions
  }

  const markdown = readFileSync(CATEGORIES_DOC_PATH, 'utf-8')
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
      aliases: (aliases || '')
        .split(',')
        .map((value) => normalizeCategoryToken(value))
        .filter(Boolean),
    })
  }

  cachedDefinitions = definitions
  return definitions
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
