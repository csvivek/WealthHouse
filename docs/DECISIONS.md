# WealthHouse — Project Decisions & Knowledge Base

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Database | Supabase (PostgreSQL) | Data storage only — no Edge Functions, no Realtime |
| Auth | Supabase Auth | Built-in, simplest integration |
| Frontend | Next.js (App Router) + TypeScript | SSR, API routes, file-based routing |
| Styling | Tailwind CSS + shadcn/ui | Best DX, accessible, composable components |
| Charts | D3.js | Full control for complex visualizations (heatmaps, allocation charts) |
| State Management | Zustand (client) + TanStack Query (server) | Zustand: minimal boilerplate. TanStack Query: caching, refetching, optimistic updates |
| Business Logic | Next.js API Routes | All server-side logic lives here, not in Supabase |
| Storage | Supabase Storage (buckets `receipts` & `statements`) | Uploaded files are kept in buckets and referenced by import records; create these buckets manually (public read with RLS) or via migration. Apply bucket policies so only the owning household/user or service role can read/write. |
| AI Agents | GPT-4o (categorization + chatbot) + Gemini 2.0 Flash (receipt parsing) | Transaction categorization (ask user if <90% confidence), financial chatbot, receipt OCR |
| Automation | n8n | Telegram notifications to start; expandable later |
| Mock Data | NONE | All pages query Supabase directly; empty states shown when no data |

## Schema Scope

Household-centric schema (actual Supabase tables):
- Core: `households`, `household_members`, `user_profiles` (auth.users bridge)
- Banking: `institutions`, `institution_profiles`, `accounts`, `account_members`, `cards`, `exchange_accounts`
- Transactions: `statement_imports`, `statement_transactions`, `statement_summaries`, `ledger_entries`
- Investments: `assets`, `assets_registry`, `asset_balances`, `asset_valuations`, `investment_transactions`, `trade_groups`
- Merchants: `merchants`, `merchant_aliases`
- Receipts: `receipts`, `receipt_items`
- Categories: `categories` (bigint id, has type + group_name)
- Advances: `advances`, `advance_repayments`, `counterparties`
- Matching: `mappings`, `transaction_links`
- Integrity: `audit_log`, `data_quarantine`, `reconciliation_runs`, `exceptions`
- NOT YET: `budgets`, `financial_goals`, `properties`, `mortgages`, `documents`, `notifications` (Coming Soon placeholders)

## Migration Source Of Truth

- Canonical migration directory is root: `supabase/migrations`.
- Legacy directory `frontend/dashboard/supabase/migrations` is retained only for historical reference.
- New migrations must be added only under `supabase/migrations` to avoid version-number drift and partial schema rollout.
- Merchant management implementation notes live in `docs/MERCHANT_MANAGEMENT.md`.

## AI Agent Behavior

- **Transaction Categorization**: Auto-categorize with confidence score. If < 90%, ask the user to confirm/correct.
- **Knowledge File**: `knowledge/categories.md` stores learned categorization mappings so the agent doesn't repeat questions.
- **Financial Advisor Chatbot**: Conversational interface for querying spending, net worth, and getting advice.

## Pages / Navigation

Sidebar (desktop):
1. Dashboard — Cash flow chart, asset allocation, recent transactions, card outstanding
2. Accounts — Linked institutions (household-scoped), cards, exchange accounts
3. Transactions — statement_transactions with filtering, search by merchant
4. Investments — asset_balances + investment_transactions, D3 donut chart
5. Receipts — Receipt pipeline (pending_confirm → confirmed), confidence scores; **upload control for merchant/fintech receipts**
6. Statements — Upload statements (PDF/ZIP/CSV) against an account, view import status and history
7. Crypto — exchange_accounts + asset_balances for crypto
8. AI Chat — Financial advisor chatbot (GPT-4o)
9. Data Health — Reconciliation, quarantine queue, audit log
10. Advances — Lending/borrowing tracking with counterparties
- Settings — Profile (user_profiles), household management (view/edit members and household name), security, data export

### Household management APIs

> **Note:** the server endpoints use the Supabase service role key (`SUPABASE_SERVICE_ROLE_KEY`) to bypass RLS for cross-profile operations. Make sure this secret is set in your environment. 


- `GET /api/household` – returns current household record (id, name).
- `PATCH /api/household` – owner-only update of household name.
- `GET /api/household/profiles` – list all profiles in the user's household (includes email).
- `PATCH /api/household/profiles/:id` – update name/role (self or owner privilege).
- `DELETE /api/household/profiles/:id` – owner-only remove a profile.

**Adding members:** there is no automatic invite mechanism yet. To add a new person, have them sign up via Supabase Auth, then run a service‑role query to set their `household_id` in `user_profiles` (or use the trigger metadata hack). The settings UI shows existing members and allows modifying roles or removing them.

### Upload requirements

- **Statements**
  - UI: choose account/institution, select one or more files (PDF, ZIP, CSV) or drag‑and-drop. Show progress and current parse status (`pending`, `completed`, `confirmed`, `rejected`).
  - Backend: Next.js API route that accepts multipart/form-data, saves file to Supabase Storage, inserts a `statement_imports` row (account_id, institution_id, file_url, parse_status=pending) and invokes parser service.
    - CSV files are parsed synchronously in the upload handler.
    - All other formats (PDF, ZIP, images) are forwarded to AI service (`lib/ai/statement-parser`) which returns JSON.
    - **Parsed transactions are stored in `statement_imports.parsed_data` (JSONB) and NOT inserted into the database until user approval**.
    - Parse results are held in memory until the user reviews and approves them.
  - Approval Flow:
    - User reviews parsed transactions in a detail modal.
    - User can reject individual transactions or the entire statement.
    - On approval, `POST /api/statements/approve` is called which:
      - Fetches `parsed_data` from the import record.
      - Runs reconciliation checks using `filterNewParsedTransactions()` to detect duplicates (date + amount + description within 2-day window).
      - Only inserts non-duplicate transactions into `statement_transactions`.
      - Updates `parse_status` to `confirmed`.
    - Duplicate detection prevents reimporting existing data.
  - Support fintechs & banks via file formats described in `skills/*.md`; allow manual uploads from merchants when APIs are unavailable.

- **Receipts**
  - UI: file input for images (JPG/PNG/PDF) plus optional mobile/Telegram upload. Mirror existing receipt table.
  - Backend: API route identical to receipts parser chain; store raw image in storage, insert into `receipts` table with source='upload', status='pending_confirm', then run OCR/AI extraction. Parsed items create `receipt_items` and may auto-categorize.

- **Mapping into Supabase**
  - All parsed transaction rows must reference the originating `statement_imports.id` or `receipts.id` and contain `account_id`/`currency`/`txn_date`/`amount` etc.
  - Duplicate detection should use `txn_hash`/`receipt_hash` to avoid reimporting the same file twice.

- **Security & RLS**
  - API routes enforce authentication and only allow uploads for the user's household.
  - Storage bucket policies should restrict access to authenticated service role and owner only.

These instructions ensure anyone implementing the feature understands the end-to-end flow: UI → API → storage → parsing → database.

## User Answers Log

| Question | Answer | Date |
|---|---|---|
| DB choice | Supabase (data only) | 2026-03-06 |
| Auth | Supabase Auth | 2026-03-06 |
| Edge Functions? | No — Next.js API routes only | 2026-03-06 |
| UI library | My choice → shadcn/ui | 2026-03-06 |
| Charts | D3.js | 2026-03-06 |
| Framework | Next.js | 2026-03-06 |
| State mgmt | My choice → Zustand + TanStack Query | 2026-03-06 |
| Real estate + financial? | Both | 2026-03-06 |
| Agentic AI | Auto-categorize (ask <90%), chatbot, knowledge .md | 2026-03-06 |
| n8n scope | Telegram message to start | 2026-03-06 |
| API providers | Not chosen — no mock data, fetch from Supabase | 2026-03-06 |
| Primary locale | Singapore (en-SG, SGD) + India (INR) | 2026-03-06 |
| No mock data | All pages fetch from Supabase, show empty states | 2026-03-06 |
