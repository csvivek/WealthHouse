import { readFileSync } from 'fs'
import { join } from 'path'

export interface GroceryTaxonomyEntry {
  canonicalName: string
  aliases: string[]
  group: string
  subgroup: string
}

const GROCERY_TAXONOMY_PATH = join(process.cwd(), 'knowledge', 'grocery_taxonomy.md')

let cachedEntries: GroceryTaxonomyEntry[] | null = null

function parseTableRow(line: string) {
  return line
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell, index, values) => !(index === 0 && cell === '') && !(index === values.length - 1 && cell === ''))
}

function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b\d+(?:\.\d+)?(?:kg|g|ml|l|pcs|pc|pack)?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function loadGroceryTaxonomy() {
  if (cachedEntries) {
    return cachedEntries
  }

  const markdown = readFileSync(GROCERY_TAXONOMY_PATH, 'utf-8')
  const entries: GroceryTaxonomyEntry[] = []

  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|') || line.includes('Canonical Item Name') || line.includes('---')) {
      continue
    }

    const [canonicalName, aliases, group, subgroup] = parseTableRow(line)
    if (!canonicalName || !group || !subgroup) {
      continue
    }

    entries.push({
      canonicalName,
      aliases: (aliases || '')
        .split(',')
        .map((value) => normalizeToken(value))
        .filter(Boolean),
      group,
      subgroup,
    })
  }

  cachedEntries = entries
  return entries
}

function tokenSimilarity(left: string, right: string) {
  if (!left || !right) {
    return 0
  }

  if (left === right) {
    return 1
  }

  const leftTokens = new Set(left.split(' '))
  const rightTokens = new Set(right.split(' '))
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length

  return (2 * overlap) / (leftTokens.size + rightTokens.size)
}

export function normalizeGroceryItemName(value: string) {
  return normalizeToken(value)
}

export function classifyGroceryItem(rawItemName: string) {
  const normalizedName = normalizeGroceryItemName(rawItemName)

  for (const entry of loadGroceryTaxonomy()) {
    if (normalizeToken(entry.canonicalName) === normalizedName || entry.aliases.includes(normalizedName)) {
      return {
        canonicalItemName: entry.canonicalName,
        normalizedItemName: normalizedName,
        taxonomyGroup: entry.group,
        taxonomySubgroup: entry.subgroup,
      }
    }
  }

  let bestEntry: GroceryTaxonomyEntry | null = null
  let bestScore = 0

  for (const entry of loadGroceryTaxonomy()) {
    const candidateValues = [entry.canonicalName, ...entry.aliases]
    const score = Math.max(...candidateValues.map((candidate) => tokenSimilarity(normalizedName, normalizeToken(candidate))))
    if (score > bestScore) {
      bestScore = score
      bestEntry = entry
    }
  }

  if (bestEntry && bestScore >= 0.7) {
    return {
      canonicalItemName: bestEntry.canonicalName,
      normalizedItemName: normalizedName,
      taxonomyGroup: bestEntry.group,
      taxonomySubgroup: bestEntry.subgroup,
    }
  }

  return {
    canonicalItemName: normalizedName || rawItemName.trim().toLowerCase(),
    normalizedItemName: normalizedName || rawItemName.trim().toLowerCase(),
    taxonomyGroup: 'Misc Grocery',
    taxonomySubgroup: 'Unclassified',
  }
}
