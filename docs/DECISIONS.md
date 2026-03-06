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
5. Receipts — Receipt pipeline (pending_confirm → confirmed), confidence scores
6. Crypto — exchange_accounts + asset_balances for crypto
7. AI Chat — Financial advisor chatbot (GPT-4o)
8. Data Health — Reconciliation, quarantine queue, audit log
9. Advances — Lending/borrowing tracking with counterparties
10. Settings — Profile (user_profiles), security, data export

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
