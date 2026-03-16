#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import process from 'node:process'

const APPLY = process.argv.includes('--apply')
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')

function cleanText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function loadEnvFile() {
  const envPath = path.resolve(appRoot, '.env.local')
  const raw = await readFile(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue
    const key = trimmed.slice(0, separatorIndex)
    const value = trimmed.slice(separatorIndex + 1)
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

async function loadRegistry() {
  const registryPath = path.resolve(appRoot, 'src/lib/accounts/institution-registry.json')
  return JSON.parse(await readFile(registryPath, 'utf8'))
}

function resolveBrand(registry, institutionName, institutionCode) {
  const normalizedCode = cleanText(institutionCode).replace(/\s+/g, '_')
  if (normalizedCode) {
    const byCode = registry.find((brand) => brand.code === normalizedCode)
    if (byCode) return byCode
  }

  const haystacks = [institutionName, institutionCode]
    .map((value) => cleanText(value))
    .filter(Boolean)

  return registry.find((brand) =>
    haystacks.some((value) =>
      brand.aliases.some((alias) => {
        const normalizedAlias = cleanText(alias)
        return value === normalizedAlias || value.includes(normalizedAlias) || normalizedAlias.includes(value)
      }),
    ),
  ) ?? null
}

function extractIconUrlFromHtml(html, websiteUrl) {
  const iconRelPattern = /<link\b[^>]*rel=(['"])(.*?)\1[^>]*>/gi
  const hrefPattern = /\bhref=(['"])(.*?)\1/i
  const candidates = []

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

async function resolveIconUrl(websiteUrl) {
  try {
    const response = await fetch(websiteUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 WealthHouse/1.0',
        accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch ${websiteUrl}: ${response.status}`)
    }

    return extractIconUrlFromHtml(await response.text(), websiteUrl)
  } catch {
    return new URL('/favicon.ico', websiteUrl).toString()
  }
}

async function supabaseRequest(pathname, options = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.')
  }

  const response = await fetch(`${url}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(options.body ? { 'Content-Type': 'application/json', Prefer: 'return=representation' } : {}),
      ...(options.headers ?? {}),
    },
  })

  if (!response.ok) {
    throw new Error(`Supabase request failed for ${pathname}: ${response.status} ${await response.text()}`)
  }

  if (response.status === 204) return null
  return response.json()
}

function extractInstitution(row) {
  if (!row || typeof row !== 'object') return null
  const embedded = row.institutions
  if (!embedded || Array.isArray(embedded) || typeof embedded !== 'object') return null
  return embedded
}

async function main() {
  await loadEnvFile()
  const registry = await loadRegistry()
  const accountRows = await supabaseRequest('accounts?select=institution_id,institutions(id,name,country_code,type,website_url,icon_url)&order=created_at.desc&limit=500')

  const institutionsById = new Map()
  for (const row of accountRows ?? []) {
    const institution = extractInstitution(row)
    if (!institution?.id || institutionsById.has(institution.id)) continue
    institutionsById.set(institution.id, institution)
  }

  const matched = []
  const unmatched = []

  for (const institution of institutionsById.values()) {
    const brand = resolveBrand(registry, institution.name, null)
    if (!brand) {
      unmatched.push(institution)
      continue
    }

    const iconUrl = await resolveIconUrl(brand.websiteUrl)
    matched.push({
      id: institution.id,
      name: institution.name,
      brandCode: brand.code,
      websiteUrl: brand.websiteUrl,
      iconUrl,
      updateNeeded: institution.website_url !== brand.websiteUrl || institution.icon_url !== iconUrl,
    })
  }

  console.log(`Matched institutions: ${matched.length}`)
  for (const institution of matched) {
    console.log(`- ${institution.name} -> ${institution.websiteUrl} (${institution.updateNeeded ? 'update' : 'no change'})`)
  }

  console.log(`Unmatched institutions: ${unmatched.length}`)
  for (const institution of unmatched) {
    console.log(`- ${institution.name}`)
  }

  if (!APPLY) {
    console.log('Dry run complete. Re-run with --apply to persist updates.')
    return
  }

  let updatedCount = 0
  for (const institution of matched) {
    if (!institution.updateNeeded) continue

    await supabaseRequest(`institutions?id=eq.${institution.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        website_url: institution.websiteUrl,
        icon_url: institution.iconUrl,
      }),
    })
    updatedCount += 1
  }

  console.log(`Updated institutions: ${updatedCount}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
