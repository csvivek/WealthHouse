#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import cp from 'node:child_process'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const SCRIPT_FILE = fileURLToPath(import.meta.url)
const SCRIPT_DIR = path.dirname(SCRIPT_FILE)
const APP_ROOT = path.resolve(SCRIPT_DIR, '..')
const DEFAULT_POLICY_PATH = path.join(APP_ROOT, 'review-agent', 'policy.json')
const DEFAULT_MEMORY_PATH = path.join(APP_ROOT, '.review-agent', 'session-memory.json')

function main() {
  const [, , command, ...rest] = process.argv

  switch (command) {
    case 'review':
      return handleReview(rest)
    case 'exec':
      return handleExec(rest)
    case 'checkpoint':
      return handleCheckpoint(rest)
    case 'memory':
      return handleMemory(rest)
    case 'help':
    case undefined:
      printHelp()
      return
    default:
      console.error(`Unknown command: ${command}`)
      printHelp()
      process.exitCode = 1
  }
}

function printHelp() {
  console.log(`review-agent usage:
  node scripts/review-agent.mjs review --proposal proposal.json [--memory path] [--format json|text]
  node scripts/review-agent.mjs exec --proposal proposal.json -- <command> [args...]
  node scripts/review-agent.mjs checkpoint [--validation "npm run lint,npx tsc --noEmit"] [--format json|text]
  node scripts/review-agent.mjs memory [--memory path] [--format json|text]
`)
}

function handleReview(args) {
  const parsed = parseArgs(args)
  const proposalPath = requireOption(parsed.options.proposal, '--proposal is required')
  const proposal = readJson(resolveFromCwd(proposalPath))
  const context = buildContext(parsed.options)
  const decision = reviewProposal(proposal, context)
  writeMemory(context.memoryPath, context.memory)
  printDecision(decision, parsed.options.format || 'json')
  process.exitCode = exitCodeForDecision(decision.decision)
}

function handleExec(args) {
  const separatorIndex = args.indexOf('--')
  if (separatorIndex === -1) {
    throw new Error('exec requires -- followed by the command to run')
  }

  const reviewArgs = args.slice(0, separatorIndex)
  const commandParts = args.slice(separatorIndex + 1)
  if (commandParts.length === 0) {
    throw new Error('No command provided after --')
  }

  const parsed = parseArgs(reviewArgs)
  const proposalPath = requireOption(parsed.options.proposal, '--proposal is required')
  const proposal = readJson(resolveFromCwd(proposalPath))
  proposal.commands = proposal.commands && proposal.commands.length > 0
    ? proposal.commands
    : [commandParts.join(' ')]

  const context = buildContext(parsed.options)
  const decision = reviewProposal(proposal, context)
  writeMemory(context.memoryPath, context.memory)
  printDecision(decision, parsed.options.format || 'text')

  if (decision.decision !== 'approve' && decision.decision !== 'approve_with_guidance') {
    process.exitCode = exitCodeForDecision(decision.decision)
    return
  }

  const result = cp.spawnSync(commandParts[0], commandParts.slice(1), {
    cwd: APP_ROOT,
    stdio: 'inherit',
    shell: false,
  })

  if (typeof result.status === 'number') {
    process.exitCode = result.status
  } else if (result.error) {
    throw result.error
  }
}

function handleCheckpoint(args) {
  const parsed = parseArgs(args)
  const repoRoot = getRepoRoot()
  const statusOutput = cp.execFileSync('git', ['-C', repoRoot, 'status', '--short'], { encoding: 'utf8' })
  const changedPaths = statusOutput
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .map((filePath) => normalizeRepoPath(path.relative(APP_ROOT, path.resolve(repoRoot, filePath))))

  const validationPlan = (parsed.options.validation || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  const proposal = {
    action_type: 'checkpoint_review',
    intent: 'Review the current working tree before finalizing changes.',
    paths: changedPaths,
    commands: [],
    risk_flags: [],
    validation_plan: validationPlan,
  }

  const context = buildContext(parsed.options)
  const decision = reviewProposal(proposal, context)
  writeMemory(context.memoryPath, context.memory)
  printDecision(decision, parsed.options.format || 'json')
  process.exitCode = exitCodeForDecision(decision.decision)
}

function handleMemory(args) {
  const parsed = parseArgs(args)
  const memoryPath = resolveMemoryPath(parsed.options.memory)
  const memory = readMemory(memoryPath)

  if ((parsed.options.format || 'json') === 'text') {
    console.log(`Session memory: ${memoryPath}`)
    console.log(`Open findings: ${memory.findings.filter((finding) => finding.status === 'open').length}`)
    for (const finding of memory.findings.filter((item) => item.status === 'open')) {
      console.log(`- [${finding.severity}] ${finding.rule_id}: ${finding.finding}`)
    }
    return
  }

  console.log(JSON.stringify(memory, null, 2))
}

function buildContext(options) {
  const policyPath = resolveFromCwd(options.policy || DEFAULT_POLICY_PATH)
  const memoryPath = resolveMemoryPath(options.memory)
  return {
    policy: readJson(policyPath),
    memoryPath,
    memory: readMemory(memoryPath),
  }
}

function reviewProposal(proposal, context) {
  const normalizedProposal = normalizeProposal(proposal)
  const findings = []
  const reasons = []
  const guidance = []

  for (const field of context.policy.requiredProposalFields || []) {
    if (!normalizedProposal[field]) {
      findings.push(buildFinding('missing_required_field', 'high', `Proposal is missing required field \`${field}\`.`, [], `Populate \`${field}\` before retrying review.`))
    }
  }

  const commandRisk = assessCommandRisk(normalizedProposal.commands, context.policy)
  const pathRisk = assessPathRisk(normalizedProposal.paths, context.policy)
  const flagRisk = assessFlagRisk(normalizedProposal.risk_flags, context.policy)
  const featureRisk = assessFeatureProtections(normalizedProposal, context.policy)

  if (commandRisk.requiresUserApproval || pathRisk.requiresUserApproval || flagRisk.requiresUserApproval) {
    reasons.push('The proposal includes a high-risk action that must be explicitly approved by the user before execution.')
  }

  if (pathRisk.protectedPaths.length > 0) {
    guidance.push(`Protected paths touched: ${pathRisk.protectedPaths.join(', ')}`)
  }

  for (const protectedFeature of featureRisk.impactedFeatures) {
    guidance.push(
      `Protected feature review: ${protectedFeature.name}. Recommended validation: ${protectedFeature.recommendedValidation.join(' | ')}`,
    )
  }

  if (pathRisk.validationRequiredPaths.length > 0 && normalizedProposal.validation_plan.length === 0) {
    findings.push(buildFinding(
      'missing_validation_plan',
      'medium',
      'The proposal touches review-sensitive code paths without a validation plan.',
      pathRisk.validationRequiredPaths,
      'Add at least one validation step such as lint, typecheck, targeted tests, or a boot check.'
    ))
  }

  if (normalizedProposal.action_type === 'safe_local_change' && (commandRisk.requiresUserApproval || flagRisk.requiresUserApproval)) {
    findings.push(buildFinding(
      'misclassified_action_type',
      'medium',
      'The proposal is marked as safe_local_change but includes a high-risk action.',
      normalizedProposal.paths,
      'Use a more specific action_type and re-run review.'
    ))
  }

  for (const protectedFeature of featureRisk.missingValidationFeatures) {
    findings.push(buildFinding(
      protectedFeature.ruleId,
      'high',
      protectedFeature.requiredValidationMessage,
      protectedFeature.affectedPaths,
      `Include one of: ${protectedFeature.recommendedValidation.join(' | ')}`
    ))
  }

  const repeatFindings = detectRepeatedIssues(context.memory, findings, normalizedProposal.paths)
  for (const finding of repeatFindings) {
    findings.push(finding)
  }

  let decision = 'approve'
  if (commandRisk.requiresUserApproval || pathRisk.requiresUserApproval || flagRisk.requiresUserApproval) {
    decision = 'require_user_approval'
  } else if (findings.length > 0) {
    decision = 'reject_with_fix'
  } else if (guidance.length > 0 || pathRisk.criticalPaths.length > 0) {
    decision = 'approve_with_guidance'
  }

  const decisionRecord = {
    reviewed_at: new Date().toISOString(),
    decision,
    proposal: normalizedProposal,
    reasons,
    guidance,
    findings,
    requires_user_prompt: decision === 'require_user_approval',
    prompt_payload: decision === 'require_user_approval'
      ? {
          summary: normalizedProposal.intent,
          action_type: normalizedProposal.action_type,
          commands: normalizedProposal.commands,
          paths: normalizedProposal.paths,
          risk_flags: normalizedProposal.risk_flags,
        }
      : null,
  }

  rememberDecision(context.memory, decisionRecord)
  rememberFindings(context.memory, findings)

  return decisionRecord
}

function assessCommandRisk(commands, policy) {
  const requiresUserApproval = []
  for (const command of commands) {
    const parts = command.trim().split(/\s+/).filter(Boolean)
    for (const prefix of policy.highRiskCommandPrefixes || []) {
      if (startsWithPrefix(parts, prefix)) {
        requiresUserApproval.push(command)
        break
      }
    }
  }
  return { requiresUserApproval: requiresUserApproval.length > 0, matchedCommands: requiresUserApproval }
}

function assessPathRisk(paths, policy) {
  const criticalPaths = []
  const validationRequiredPaths = []
  const protectedPaths = []

  for (const candidate of paths) {
    const repoPath = normalizeRepoPath(candidate)
    if ((policy.criticalPathPrefixes || []).some((prefix) => repoPath.startsWith(prefix))) {
      criticalPaths.push(repoPath)
    }
    if ((policy.validationRequiredPrefixes || []).some((prefix) => repoPath.startsWith(prefix))) {
      validationRequiredPaths.push(repoPath)
    }
    if ((policy.protectedPathFragments || []).some((fragment) => repoPath.includes(fragment))) {
      protectedPaths.push(repoPath)
    }
  }

  const requiresUserApproval = protectedPaths.some((repoPath) => repoPath.includes('.env') || repoPath.includes('supabase/migrations/'))

  return {
    requiresUserApproval,
    criticalPaths: unique(criticalPaths),
    validationRequiredPaths: unique(validationRequiredPaths),
    protectedPaths: unique(protectedPaths),
  }
}

function assessFeatureProtections(proposal, policy) {
  const impactedFeatures = []
  const missingValidationFeatures = []

  for (const feature of policy.protectedFeatureSets || []) {
    const directlyTouched = proposal.paths.filter((repoPath) =>
      (feature.pathPrefixes || []).some((prefix) => repoPath.startsWith(prefix))
    )
    const sharedRiskTouched = proposal.paths.filter((repoPath) =>
      (feature.sharedRiskPrefixes || []).some((prefix) => repoPath.startsWith(prefix))
    )

    const affectedPaths = unique([...directlyTouched, ...sharedRiskTouched])
    if (affectedPaths.length === 0) {
      continue
    }

    const validationPlanText = proposal.validation_plan.join(' ').toLowerCase()
    const hasFeatureValidation = (feature.validationMatchers || []).some((matcher) =>
      validationPlanText.includes(String(matcher).toLowerCase())
    )

    const record = {
      ruleId: feature.ruleId || 'protected_feature_validation',
      name: feature.name || 'Protected feature',
      affectedPaths,
      recommendedValidation: feature.recommendedValidation || [],
      requiredValidationMessage: feature.requiredValidationMessage || `Add regression validation for ${feature.name || 'the protected feature'}.`,
    }

    impactedFeatures.push(record)

    if (!hasFeatureValidation) {
      missingValidationFeatures.push(record)
    }
  }

  return {
    impactedFeatures,
    missingValidationFeatures,
  }
}

function assessFlagRisk(riskFlags, policy) {
  const risky = riskFlags.filter((flag) => (policy.highRiskFlags || []).includes(flag))
  return { requiresUserApproval: risky.length > 0, matchedFlags: risky }
}

function detectRepeatedIssues(memory, findings, proposalPaths) {
  const repeated = []
  for (const existing of memory.findings.filter((item) => item.status === 'open')) {
    const samePath = existing.affected_paths.some((item) => proposalPaths.includes(item))
    const sameRule = findings.some((finding) => finding.rule_id === existing.rule_id)
    if (sameRule || samePath) {
      repeated.push(buildFinding(
        'repeated_issue',
        'high',
        `This proposal repeats an unresolved reviewer concern: ${existing.finding}`,
        existing.affected_paths,
        existing.recommended_fix || 'Resolve the earlier reviewer finding before retrying.'
      ))
    }
  }
  return repeated
}

function rememberDecision(memory, decisionRecord) {
  memory.decisions.push(decisionRecord)
  memory.updated_at = new Date().toISOString()
}

function rememberFindings(memory, findings) {
  for (const finding of findings) {
    const existing = memory.findings.find((item) => item.rule_id === finding.rule_id && item.status === 'open')
    if (existing) {
      existing.repeat_count = (existing.repeat_count || 1) + 1
      existing.updated_at = new Date().toISOString()
      continue
    }

    memory.findings.push({
      id: `${finding.rule_id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'open',
      repeat_count: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...finding,
    })
  }
  memory.updated_at = new Date().toISOString()
}

function buildFinding(ruleId, severity, finding, affectedPaths, recommendedFix) {
  return {
    rule_id: ruleId,
    severity,
    finding,
    affected_paths: unique(affectedPaths),
    recommended_fix: recommendedFix,
  }
}

function normalizeProposal(proposal) {
  return {
    action_type: typeof proposal.action_type === 'string' ? proposal.action_type.trim() : '',
    intent: typeof proposal.intent === 'string' ? proposal.intent.trim() : '',
    paths: unique(asStringArray(proposal.paths).map(normalizeRepoPath)),
    commands: unique(asStringArray(proposal.commands)),
    risk_flags: unique(asStringArray(proposal.risk_flags)),
    validation_plan: unique(asStringArray(proposal.validation_plan)),
  }
}

function asStringArray(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
}

function parseArgs(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith('--')) continue
    const key = current.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      options[key] = 'true'
      continue
    }
    options[key] = next
    index += 1
  }
  return { options }
}

function requireOption(value, message) {
  if (!value) throw new Error(message)
  return value
}

function resolveFromCwd(targetPath) {
  if (path.isAbsolute(targetPath)) return targetPath
  return path.resolve(process.cwd(), targetPath)
}

function resolveMemoryPath(candidate) {
  return resolveFromCwd(candidate || DEFAULT_MEMORY_PATH)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readMemory(memoryPath) {
  if (!fs.existsSync(memoryPath)) {
    return {
      session_id: path.basename(memoryPath, path.extname(memoryPath)),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      findings: [],
      decisions: [],
    }
  }

  return readJson(memoryPath)
}

function writeMemory(memoryPath, memory) {
  const payload = `${JSON.stringify(memory, null, 2)}\n`

  try {
    fs.mkdirSync(path.dirname(memoryPath), { recursive: true })
    fs.writeFileSync(memoryPath, payload)
    return
  } catch (error) {
    if (!error || !['EACCES', 'EPERM'].includes(error.code)) {
      throw error
    }
  }

  const fallbackPath = path.join(os.tmpdir(), path.basename(memoryPath))
  fs.mkdirSync(path.dirname(fallbackPath), { recursive: true })
  fs.writeFileSync(fallbackPath, payload)
  console.warn(`Review agent memory path was not writable. Falling back to ${fallbackPath}`)
}

function printDecision(decision, format) {
  if (format === 'text') {
    console.log(`Decision: ${decision.decision}`)
    if (decision.reasons.length > 0) {
      console.log('Reasons:')
      for (const reason of decision.reasons) {
        console.log(`- ${reason}`)
      }
    }
    if (decision.guidance.length > 0) {
      console.log('Guidance:')
      for (const item of decision.guidance) {
        console.log(`- ${item}`)
      }
    }
    if (decision.findings.length > 0) {
      console.log('Findings:')
      for (const finding of decision.findings) {
        console.log(`- [${finding.severity}] ${finding.rule_id}: ${finding.finding}`)
      }
    }
    return
  }

  console.log(JSON.stringify(decision, null, 2))
}

function exitCodeForDecision(decision) {
  if (decision === 'approve') return 0
  if (decision === 'approve_with_guidance') return 0
  if (decision === 'require_user_approval') return 2
  return 3
}

function startsWithPrefix(parts, prefix) {
  if (parts.length < prefix.length) return false
  return prefix.every((value, index) => parts[index] === value)
}

function getRepoRoot() {
  return cp.execFileSync('git', ['-C', APP_ROOT, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
}

function normalizeRepoPath(candidate) {
  return candidate.split(path.sep).join('/').replace(/^\.\//, '')
}

function unique(values) {
  return [...new Set(values)]
}

main()
