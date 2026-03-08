# Supervising Review Agent

This repo-local toolkit adds a blocking reviewer layer for development work.

## What it does

- reviews proposed actions before risky code or command execution
- blocks high-risk actions until the user explicitly approves them
- records unresolved reviewer findings in local session memory
- supports a checkpoint review over the current working tree

## Proposal contract

A proposal JSON file should include:

```json
{
  "action_type": "safe_local_change",
  "intent": "Update statement review category editing.",
  "paths": [
    "src/app/api/ai/statement/[importId]/rows/route.ts",
    "src/app/(dashboard)/statements/review/[importId]/page.tsx"
  ],
  "commands": [
    "npx eslint src/app/api/ai/statement/[importId]/rows/route.ts"
  ],
  "risk_flags": [],
  "validation_plan": [
    "npx eslint src/app/api/ai/statement/[importId]/rows/route.ts",
    "npx tsc --noEmit"
  ]
}
```

## Commands

Run a review:

```bash
npm run review:agent -- --proposal review-agent/example-proposal.json --format text
```

Run a checkpoint review against the current working tree:

```bash
npm run review:checkpoint -- --validation "npx eslint src/app/api/ai/statement/[importId]/rows/route.ts,npx tsc --noEmit" --format text
```

Run a reviewed command:

```bash
npm run review:exec -- --proposal review-agent/example-proposal.json -- npx eslint src/app/api/ai/statement/[importId]/rows/route.ts
```

Inspect current reviewer memory:

```bash
npm run review:memory -- --format text
```

## High-risk actions that trigger a user prompt

- destructive filesystem actions
- push, merge, reset, or rebase git actions
- schema and migration commands
- direct external admin commands such as `psql`, `curl`, or `wget`
- protected path changes such as `.env*` or migration files

## Session memory

Reviewer state is stored locally in `.review-agent/session-memory.json`.
This file is intentionally gitignored.

## Protected feature review

The policy treats statement import as a protected product capability:

- statement upload
- statement review
- statement commit / recommit
- related parsing, knowledge, and job-tracking code

If a proposal touches the statement flow directly, or touches shared platform code that could affect it (`src/app/api`, `src/lib`, generated DB types, or migrations), the reviewer expects statement regression validation in the proposal. Without that, the review agent will reject the proposal with a required fix.

This does not narrow review to statements only. Other feature work is still reviewed in the normal way:

- risky commands still require approval
- critical paths still produce stricter guidance
- validation-sensitive feature changes still need a validation plan
