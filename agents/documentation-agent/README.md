# WealthHouse Documentation Agent

Autonomous post-merge governance agent for WealthHouse.

## Source of truth model
- **Machine-readable source of truth:** `docs/review-agent/*.json`
- **Human-readable projection:** GitHub Wiki pages managed from source-of-truth files.

## What it does on every merged PR to `main`
1. Reads merged PR metadata and changed file details from GitHub API.
2. Runs a structured post-merge review:
   - architecture, schema, API, UI/UX, tests, migration, security, and data integrity risk signals
   - WealthHouse domain coupling (statements, receipts, categories, transfers, ledger, household profiles, supabase migrations)
3. Updates machine-readable docs:
   - `bug-registry.json` (canonical)
   - `review-history.json`
   - `change-log.json`
   - `module-impact-index.json`
4. Detects likely bug markers (`TODO`/`FIXME`/`BUG`) and bug-fix references (`BUG-XXXX`).
5. Synchronizes wiki pages using agent-managed blocks.
6. Writes audit logs per run to `docs/review-agent/audit-logs/`.

## Wiki pages managed
- `Home.md`
- `Release-Change-Log.md`
- `Architecture-Notes.md`
- `Bug-Register.md`
- `Open-Review-Findings.md`

Each page update is constrained to markers:

```md
<!-- AGENT:START section-name -->
...
<!-- AGENT:END section-name -->
```

## Permissions and setup
Workflow file: `.github/workflows/documentation-agent.yml`

Required permissions:
- `contents: write` (commit machine docs + push wiki)
- `pull-requests: read`
- `issues: read`

The default `GITHUB_TOKEN` is used for both repository and wiki updates.

## Fallback behavior
If wiki sync fails, the workflow still:
- updates repo-side machine docs,
- records warnings in the audit log,
- preserves traceability.

## Configuration
- Runtime config and pattern mapping: `docs/review-agent/config.json`
- Data schema docs: `docs/review-agent/SCHEMAS.md` + `docs/review-agent/schemas/review-agent.schema.json`
