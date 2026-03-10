#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const configPath = path.join(root, 'docs/review-agent/config.json')
const docsRoot = path.join(root, 'docs/review-agent')

const bugRegistryPath = path.join(docsRoot, 'bug-registry.json')
const reviewHistoryPath = path.join(docsRoot, 'review-history.json')
const changeLogPath = path.join(docsRoot, 'change-log.json')
const moduleImpactPath = path.join(docsRoot, 'module-impact-index.json')

const eventPath = process.env.GITHUB_EVENT_PATH
const githubToken = process.env.GITHUB_TOKEN
const repository = process.env.GITHUB_REPOSITORY
const runId = process.env.GITHUB_RUN_ID || 'local'

const STATUS_ACTIVE = new Set(['Open', 'Under Investigation', 'Fix Proposed'])

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`)
}

async function gh(pathname) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${githubToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`GitHub API ${pathname} failed (${response.status}): ${text}`)
  }

  return response.json()
}

function inferModules(files, modulePatterns) {
  const hit = new Set()
  for (const file of files) {
    const lower = file.toLowerCase()
    for (const [moduleName, patterns] of Object.entries(modulePatterns)) {
      if (patterns.some((pattern) => lower.includes(pattern.toLowerCase()))) {
        hit.add(moduleName)
      }
    }
  }
  return [...hit]
}

function inferRisks(filesWithPatch, riskPatterns) {
  const risks = []
  for (const [riskName, patterns] of Object.entries(riskPatterns)) {
    for (const file of filesWithPatch) {
      const haystack = `${file.filename}\n${file.patch || ''}`.toLowerCase()
      if (patterns.some((pattern) => haystack.includes(pattern.toLowerCase()))) {
        risks.push(riskName)
        break
      }
    }
  }
  return risks
}

function extractMarkers(filesWithPatch) {
  const markers = []
  for (const file of filesWithPatch) {
    if (!file.patch) continue
    const lines = file.patch.split('\n')
    for (const line of lines) {
      if (line.startsWith('+') && /(TODO|FIXME|BUG)/i.test(line)) {
        markers.push({ file: file.filename, line })
      }
    }
  }
  return markers
}

function parseIssueRefs(text) {
  const refs = new Set()
  if (!text) return []
  const re = /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi
  for (const match of text.matchAll(re)) {
    refs.add(Number(match[1]))
  }
  return [...refs]
}

function parseBugFixRefs(text) {
  const refs = new Set()
  if (!text) return []
  const re = /\b(BUG-\d{4,})\b/gi
  for (const match of text.matchAll(re)) {
    refs.add(match[1].toUpperCase())
  }
  return [...refs]
}

function nextBugId(bugs) {
  const max = bugs.reduce((acc, b) => {
    const m = /BUG-(\d+)/.exec(b.id)
    if (!m) return acc
    return Math.max(acc, Number(m[1]))
  }, 0)
  return `BUG-${String(max + 1).padStart(4, '0')}`
}

function upsertManagedSection(original, section, content) {
  const start = `<!-- AGENT:START ${section} -->`
  const end = `<!-- AGENT:END ${section} -->`
  const block = `${start}\n${content}\n${end}`
  if (!original.includes(start) || !original.includes(end)) {
    return `${original.trimEnd()}\n\n${block}\n`
  }
  const re = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`, 'm')
  return `${original.replace(re, block).trimEnd()}\n`
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function renderWikiPages(machine, review, warnings) {
  const today = new Date().toISOString().slice(0, 10)
  const openBugs = machine.bugRegistry.bugs.filter((b) => STATUS_ACTIVE.has(b.status))

  const releaseBlock = [
    '| Date | PR | Feature | Impacted Modules | Migrations | Key Risks |',
    '|---|---|---|---|---|---|',
    ...machine.changeLog.entries.slice(-100).reverse().map((e) => `| ${e.date} | #${e.prNumber} | ${e.title} | ${e.impactedModules.join(', ') || 'n/a'} | ${e.migrationImpact ? 'Yes' : 'No'} | ${e.keyRisks.join(', ') || 'None'} |`),
  ].join('\n')

  const architectureBlock = [
    `Last updated: ${today}`,
    '',
    `Latest PR reviewed: #${review.pr.number} - ${review.pr.title}`,
    '',
    `Data-flow/schema impact: ${review.analysis.architectureImpact}`,
    '',
    'Recent impacted modules:',
    ...review.analysis.impactedModules.map((m) => `- ${m}`),
  ].join('\n')

  const bugBlock = [
    '| Bug ID | Title | Severity | Status | Related PRs | Modules | Last Reviewed |',
    '|---|---|---|---|---|---|---|',
    ...machine.bugRegistry.bugs.map((b) => `| ${b.id} | ${b.title} | ${b.severity} | ${b.status} | ${b.relatedPRs.map((n) => `#${n}`).join(', ')} | ${b.affectedModules.join(', ') || 'n/a'} | ${b.lastReviewedAt.slice(0, 10)} |`),
  ].join('\n')

  const findings = machine.reviewHistory.reviews
    .flatMap((r) => r.findings.filter((f) => !f.resolved).map((f) => ({ ...f, pr: r.pr.number })))
    .slice(-100)

  const findingsBlock = [
    '| PR | Finding | Severity | Recommendation |',
    '|---|---|---|---|',
    ...findings.map((f) => `| #${f.pr} | ${f.title} | ${f.severity} | ${f.recommendation} |`),
    ...(warnings.length > 0 ? ['','## Warnings', ...warnings.map((w) => `- ${w}`)] : []),
  ].join('\n')

  const homeBlock = [
    '- [Release Change Log](Release-Change-Log)',
    '- [Architecture Notes](Architecture-Notes)',
    '- [Bug Register](Bug-Register)',
    '- [Open Review Findings](Open-Review-Findings)',
    '',
    `Latest reviewed PR: #${review.pr.number}`,
  ].join('\n')

  return { releaseBlock, architectureBlock, bugBlock, findingsBlock, homeBlock, openBugsCount: openBugs.length }
}

function writeAuditLog(review, updates, warnings) {
  const dir = path.join(docsRoot, 'audit-logs')
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(dir, `${stamp}-pr-${review.pr.number}.json`)
  writeJson(file, {
    generatedAt: new Date().toISOString(),
    runId,
    trigger: { pr: review.pr.number, branch: review.pr.baseRef },
    updates,
    bugs: {
      created: review.analysis.createdBugIds,
      updated: review.analysis.updatedBugIds,
      fixed: review.analysis.fixedBugIds,
    },
    warnings,
  })
  return path.relative(root, file)
}

async function main() {
  if (!eventPath || !repository || !githubToken) {
    throw new Error('Missing required GitHub environment (GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_TOKEN).')
  }

  const config = readJson(configPath)
  const event = readJson(eventPath)
  const pr = event.pull_request

  if (!pr || !pr.merged || pr.base.ref !== config.defaultBranch) {
    console.log(`No-op: PR not merged into ${config.defaultBranch}.`)
    return
  }

  const [owner, repo] = repository.split('/')
  const prNumber = pr.number

  const files = await gh(`/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`)
  const commits = await gh(`/repos/${owner}/${repo}/pulls/${prNumber}/commits?per_page=100`)

  const changedFiles = files.map((f) => f.filename)
  const impactedModules = inferModules(changedFiles, config.modulePatterns)
  const keyRisks = inferRisks(files, config.riskPatterns)
  const markers = extractMarkers(files)
  const linkedIssues = [...new Set([...parseIssueRefs(pr.body), ...parseIssueRefs(pr.title)])]
  const bugFixRefs = [...new Set([...parseBugFixRefs(pr.body), ...parseBugFixRefs(pr.title)])]

  const reviewSummary = {
    summary: `PR #${prNumber} merged into ${config.defaultBranch}. ${changedFiles.length} files changed.`,
    impactedModules,
    risksFound: keyRisks,
    suspectedBugs: markers.map((m) => `${m.file}: ${m.line.replace(/^\+/, '').trim()}`),
    missingTests: changedFiles.some((f) => f.includes('/src/') && !changedFiles.some((x) => x.includes('__tests__') || x.includes('.test.')))
      ? ['Code changes detected without corresponding test file changes.']
      : [],
    followUpRecommendations: [
      'Confirm production monitoring for high-risk module changes.',
      'Validate migration order and rollback plan when migrations changed.',
    ],
    confidenceLevel: keyRisks.length > 5 ? 'medium' : 'high',
    architectureImpact: impactedModules.length > 0 ? `Impacts: ${impactedModules.join(', ')}` : 'No major architectural signal detected.',
    databaseSchemaImpact: changedFiles.some((f) => f.includes('migration')),
    apiContractImpact: changedFiles.some((f) => f.includes('/api/')),
    uiUxImpact: changedFiles.some((f) => f.endsWith('.tsx') && f.includes('/components/')),
    migrationRisk: keyRisks.includes('supabase-migration-sequencing') ? 'elevated' : 'normal',
    securityRisk: keyRisks.includes('missing-api-validation') ? 'elevated' : 'normal',
    dataIntegrityRisk: keyRisks.some((r) => r.includes('duplicate') || r.includes('reconciliation')) ? 'elevated' : 'normal',
  }

  const bugRegistry = readJson(bugRegistryPath)
  const reviewHistory = readJson(reviewHistoryPath)
  const changeLog = readJson(changeLogPath)
  const moduleImpact = readJson(moduleImpactPath)

  const now = new Date().toISOString()
  const createdBugIds = []
  const updatedBugIds = []
  const fixedBugIds = []

  for (const bugId of bugFixRefs) {
    const bug = bugRegistry.bugs.find((b) => b.id === bugId)
    if (bug && bug.status !== 'Fixed' && bug.status !== 'Verified' && bug.status !== 'Closed') {
      bug.status = 'Fixed'
      bug.updatedAt = now
      bug.lastReviewedAt = now
      bug.relatedPRs = [...new Set([...(bug.relatedPRs || []), prNumber])]
      bug.history = [...(bug.history || []), { at: now, action: 'marked_fixed', byPr: prNumber }]
      fixedBugIds.push(bug.id)
    }
  }

  for (const marker of markers) {
    const title = `Marker detected in ${marker.file}`
    const existing = bugRegistry.bugs.find((b) => b.title === title && STATUS_ACTIVE.has(b.status))
    if (existing) {
      existing.updatedAt = now
      existing.lastReviewedAt = now
      existing.relatedPRs = [...new Set([...(existing.relatedPRs || []), prNumber])]
      existing.affectedFiles = [...new Set([...(existing.affectedFiles || []), marker.file])]
      existing.history = [...(existing.history || []), { at: now, action: 'reobserved', byPr: prNumber }]
      updatedBugIds.push(existing.id)
    } else {
      const id = nextBugId(bugRegistry.bugs)
      bugRegistry.bugs.push({
        id,
        title,
        status: 'Under Investigation',
        severity: 'medium',
        description: marker.line.replace(/^\+/, '').trim(),
        reproductionNotes: 'Inspect merged patch context and execute impacted flow.',
        owner: null,
        relatedPRs: [prNumber],
        relatedIssues: linkedIssues,
        relatedCommits: commits.map((c) => c.sha),
        affectedFiles: [marker.file],
        affectedModules: impactedModules,
        history: [{ at: now, action: 'created', byPr: prNumber }],
        createdAt: now,
        updatedAt: now,
        lastReviewedAt: now,
      })
      createdBugIds.push(id)
    }
  }

  bugRegistry.lastUpdatedAt = now

  const reviewRecord = {
    id: `review-pr-${prNumber}`,
    reviewedAt: now,
    pr: {
      number: prNumber,
      title: pr.title,
      author: pr.user?.login,
      mergedAt: pr.merged_at,
      baseRef: pr.base.ref,
      labels: (pr.labels || []).map((l) => l.name),
      linkedIssues,
      commitRange: `${pr.base.sha}...${pr.merge_commit_sha}`,
      changedFiles,
      commits: commits.map((c) => c.sha),
    },
    analysis: {
      ...reviewSummary,
      createdBugIds,
      updatedBugIds,
      fixedBugIds,
    },
    findings: [
      ...reviewSummary.missingTests.map((msg) => ({ title: msg, severity: 'medium', recommendation: 'Add focused unit/integration tests.', resolved: false })),
      ...keyRisks.map((risk) => ({ title: `Risk flag: ${risk}`, severity: 'medium', recommendation: 'Perform manual verification and strengthen guards.', resolved: false })),
    ],
  }

  reviewHistory.reviews.push(reviewRecord)
  reviewHistory.lastUpdatedAt = now

  changeLog.entries.push({
    id: `pr-${prNumber}`,
    date: now.slice(0, 10),
    prNumber,
    title: pr.title,
    author: pr.user?.login,
    impactedModules,
    migrationImpact: reviewSummary.databaseSchemaImpact,
    keyRisks,
    linkedIssues,
    mergeCommit: pr.merge_commit_sha,
  })
  changeLog.lastUpdatedAt = now

  for (const moduleName of impactedModules) {
    const existing = moduleImpact.modules[moduleName] || { touches: 0, prs: [], lastTouchedAt: null }
    existing.touches += 1
    existing.prs = [...new Set([...existing.prs, prNumber])]
    existing.lastTouchedAt = now
    moduleImpact.modules[moduleName] = existing
  }
  moduleImpact.lastUpdatedAt = now

  writeJson(bugRegistryPath, bugRegistry)
  writeJson(reviewHistoryPath, reviewHistory)
  writeJson(changeLogPath, changeLog)
  writeJson(moduleImpactPath, moduleImpact)

  const warnings = []
  let wikiUpdated = false
  let wikiPaths = []
  try {
    const wikiDir = path.join(root, '.tmp-wiki')
    fs.rmSync(wikiDir, { recursive: true, force: true })

    const { spawnSync } = await import('node:child_process')
    const cloneUrl = `https://x-access-token:${githubToken}@github.com/${owner}/${repo}.wiki.git`
    const clone = spawnSync('git', ['clone', cloneUrl, wikiDir], { stdio: 'pipe', encoding: 'utf8' })
    if (clone.status !== 0) {
      throw new Error(`Wiki clone failed: ${clone.stderr || clone.stdout}`)
    }

    const rendered = renderWikiPages({ bugRegistry, reviewHistory, changeLog }, reviewRecord, warnings)
    const pages = [
      ['Home.md', 'home', '# WealthHouse Wiki\n\n'],
      ['Release-Change-Log.md', 'release-change-log', '# Release Change Log\n\n'],
      ['Architecture-Notes.md', 'architecture-notes', '# Architecture Notes\n\n'],
      ['Bug-Register.md', 'bug-register', '# Bug Register\n\n'],
      ['Open-Review-Findings.md', 'open-review-findings', '# Open Review Findings\n\n'],
    ]

    for (const [file, section, starter] of pages) {
      const target = path.join(wikiDir, file)
      const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : starter
      let managed = ''
      if (section === 'home') managed = rendered.homeBlock
      if (section === 'release-change-log') managed = rendered.releaseBlock
      if (section === 'architecture-notes') managed = rendered.architectureBlock
      if (section === 'bug-register') managed = rendered.bugBlock
      if (section === 'open-review-findings') managed = rendered.findingsBlock
      fs.writeFileSync(target, upsertManagedSection(existing, section, managed))
      wikiPaths.push(file)
    }

    const add = spawnSync('git', ['-C', wikiDir, 'add', '.'], { stdio: 'pipe', encoding: 'utf8' })
    if (add.status !== 0) throw new Error(add.stderr || add.stdout)

    const commit = spawnSync('git', ['-C', wikiDir, 'commit', '-m', `docs: sync wiki for PR #${prNumber}`], { stdio: 'pipe', encoding: 'utf8' })
    if (commit.status === 0) {
      const push = spawnSync('git', ['-C', wikiDir, 'push', 'origin', 'master'], { stdio: 'pipe', encoding: 'utf8' })
      if (push.status !== 0) throw new Error(push.stderr || push.stdout)
      wikiUpdated = true
    }
  } catch (error) {
    warnings.push(`Wiki sync warning: ${error.message}`)
  }

  const auditPath = writeAuditLog(reviewRecord, {
    machineFiles: [
      path.relative(root, bugRegistryPath),
      path.relative(root, reviewHistoryPath),
      path.relative(root, changeLogPath),
      path.relative(root, moduleImpactPath),
    ],
    wikiUpdated,
    wikiPages: wikiPaths,
  }, warnings)

  if (warnings.length > 0) {
    console.warn(warnings.join('\n'))
  }

  console.log(JSON.stringify({
    pr: prNumber,
    machineDocsUpdated: true,
    wikiUpdated,
    auditLog: auditPath,
    createdBugIds,
    updatedBugIds,
    fixedBugIds,
    warnings,
  }, null, 2))
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
