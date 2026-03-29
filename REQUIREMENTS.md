# WealthHouse — Product Requirements Document

**Version:** 1.0
**Date:** March 2026
**Stack:** Next.js 16 · React 19 · TypeScript · Supabase · OpenAI GPT-4o · Google Gemini 2.5 Flash

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Tech Stack & Architecture](#2-tech-stack--architecture)
3. [Authentication & User Management](#3-authentication--user-management)
4. [Household & Multi-User Management](#4-household--multi-user-management)
5. [Account Management](#5-account-management)
6. [Statement Import Pipeline](#6-statement-import-pipeline)
7. [Receipt Capture Pipeline](#7-receipt-capture-pipeline)
8. [Transaction Management](#8-transaction-management)
9. [Category System](#9-category-system)
10. [Tag System](#10-tag-system)
11. [Merchant Intelligence](#11-merchant-intelligence)
12. [Dashboard & Analytics](#12-dashboard--analytics)
13. [AI Chat (Financial Assistant)](#13-ai-chat-financial-assistant)
14. [Asset Tracking](#14-asset-tracking)
15. [Advances (Personal Loans)](#15-advances-personal-loans)
16. [Data Health & Integrity](#16-data-health--integrity)
17. [Settings & Preferences](#17-settings--preferences)
18. [Planned / Placeholder Features](#18-planned--placeholder-features)
19. [API Reference](#19-api-reference)
20. [Database Schema](#20-database-schema)
21. [AI Models & Capabilities](#21-ai-models--capabilities)
22. [Non-Functional Requirements](#22-non-functional-requirements)

---

## 1. Product Overview

WealthHouse is a personal finance management dashboard for households in Singapore and India. It enables users to:

- Import and parse bank statements and receipts using AI
- Track spending, income, and net worth across multiple accounts and asset classes
- Organize transactions with a rich category, tag, and merchant system
- Get AI-powered financial insights via a conversational chat interface
- Collaborate with household members on shared financial data

**Target Users:** Individuals and households in Singapore (SGD primary) and India (INR fallback) with multiple bank accounts, credit cards, investment accounts, and crypto holdings.

**Core Value Proposition:** Zero-friction financial tracking — upload a statement or receipt photo and the AI does the rest.

---

## 2. Tech Stack & Architecture

### Frontend
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 (strict) |
| UI Library | React 19 |
| Styling | Tailwind CSS 4 |
| Components | Radix UI / shadcn |
| Icons | Lucide React |
| State (client) | Zustand 5 |
| State (server) | TanStack React Query 5 |
| Charts | D3.js 7 |
| Notifications | Sonner |
| Markdown | react-markdown + remark-gfm |

### Backend & Data
| Layer | Technology |
|-------|-----------|
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email + Google OAuth) |
| File Storage | Supabase Storage (statements & receipts buckets) |
| Realtime | Supabase Realtime subscriptions |
| API | Next.js App Router route handlers (62 endpoints) |

### AI/ML
| Purpose | Model |
|---------|-------|
| Statement parsing (OCR) | Google Gemini 2.5 Flash |
| Receipt OCR | Google Gemini 2.5 Flash |
| Transaction categorization | OpenAI GPT-4o |
| Chat orchestration (routing) | OpenAI GPT-4o-mini |
| Chat orchestration (planning) | OpenAI GPT-4o-mini |
| Chat response generation | OpenAI GPT-4o |
| Financial advisor | OpenAI GPT-4o |
| Receipt classification | OpenAI GPT-4o-mini |
| Merchant intelligence | OpenAI GPT-4o |

### Navigation Structure
```
Sidebar Groups:
├── Overview       → Dashboard
├── Money          → Accounts, Transactions, Advances
├── Import         → Statements, Receipts
├── Assets         → Investments, Crypto
├── Manage         → Categories, Tags, Merchants
├── System         → Data Health, Settings
└── Footer         → AI Chat (always visible)
```

---

## 3. Authentication & User Management

### 3.1 Login (`/login`)
- Email + password via Supabase `signInWithPassword()`
- Google OAuth via `signInWithOAuth()` → redirects to `/auth/callback`
- Validation with user-friendly error messages
- Redirects to `/dashboard` on success

### 3.2 Signup (`/signup`)
- Email + password registration via Supabase `signUp()`
- Captures full name in auth metadata
- Email confirmation required (shows confirmation message post-signup)
- Google OAuth option available
- On completion: profile auto-created, default household created

### 3.3 OAuth Callback (`/auth/callback`)
- Exchanges OAuth code for session via `exchangeCodeForSession(code)`
- Calls `ensureProfile()` RPC (Supabase function) to create profile if missing
- Handles pending household invitations for the email
- Redirects to `/dashboard` (or `?next=` param if specified)
- On failure: redirects to `/login?error=auth_failed`

### 3.4 Session Management
- Next.js middleware (`src/middleware.ts`) refreshes session on every request
- Cookie-based session storage with Supabase SSR
- Protected routes: All `/dashboard/*` routes require active session
- Unauthenticated users redirected to `/login`
- Three Supabase clients: browser (anon), server (anon + cookies), service (privileged)

### 3.5 Auth State (Zustand)
- `auth-store.ts` tracks: `user` (Supabase auth.user), `profile` (user_profiles row), `isLoading`
- Profile contains: id, email, full_name, avatar_url, role (owner|member)

---

## 4. Household & Multi-User Management

### 4.1 Household Model
- Every user belongs to exactly one household
- Created automatically on first signup
- Has a name and a base currency (default: INR)
- Supports multiple user accounts (members) sharing the same financial data

### 4.2 Roles
| Role | Capabilities |
|------|-------------|
| **owner** | Full access; manage members, invites, household settings |
| **member** | View and edit financial data; cannot manage members |

### 4.3 Invitation Workflow
1. Owner enters invitee email + display name on Settings → Household tab
2. Invitation record created in `household_user_invites`
3. Invitee receives email (via Supabase Auth email or external service)
4. On invitee's first login, `ensure_user_profile()` RPC resolves pending invite
5. Invitee's profile linked to the household
6. Owner can revoke pending invitations before acceptance

### 4.4 Member Management
- Owner can edit any member's display name and role
- Owner can remove members (cannot remove self)
- Members table shows: name, email, role, edit/remove actions
- Pending invites table shows: email, name, role, invite date, revoke action

### 4.5 Household Members vs User Profiles
- `household_members` = physical people in a household (self, spouse, child, parent, other) — not necessarily app users
- `user_profiles` = app users linked to `auth.users` — these can be owners or members

---

## 5. Account Management

### 5.1 Account Types
| Type | Description |
|------|-------------|
| `savings` | Savings/checking bank account |
| `current` | Current/business account |
| `credit_card` | Credit card account |
| `investment` | Brokerage/investment account |
| `crypto_exchange` | Cryptocurrency exchange account |
| `loan` | Loan/mortgage account |
| `fixed_deposit` | Fixed deposit / term deposit |

### 5.2 Creating an Account
Required fields:
- Institution (with brand matching via `InstitutionBrandPicker`)
- Product name (e.g., "DBS Multiplier Account")
- Account type
- Currency (SGD, USD, EUR, INR, GBP)

Optional fields:
- Nickname (user-friendly label)
- Identifier hint (masked account number or last-4)
- For credit cards: card name, last 4 digits

### 5.3 Account List View
- Summary stats: Active accounts count, credit card count, total outstanding balance
- Account cards grid showing: institution logo, nickname, type badge, identifier hint
- Credit card cards additionally show: outstanding balance, card name
- Edit button per card opens inline dialog

### 5.4 Institution Branding
- `institutions` table stores institution metadata (name, type, country, icon_url)
- `InstitutionBrandPicker` component detects institution from name input
- Stores brand code + decision type (verified vs generic)

---

## 6. Statement Import Pipeline

### 6.1 Supported Formats
- PDF bank statements
- CSV/Excel exports
- ZIP archives (containing PDFs or images)

### 6.2 Supported Institutions
- DBS Bank (savings + credit cards + multi-account consolidated)
- OCBC Bank
- UOB
- Trust Bank
- HSBC
- Citibank (incl. Ready Credit loan detection)
- Wise
- Unknown / Generic fallback

### 6.3 Upload Flow
1. User selects file on Statements page
2. `POST /api/ai/statement` — file uploaded to `statements` storage bucket
3. SHA256 hash checked for duplicates (409 if duplicate exists)
4. `file_imports` row created with status `received`
5. Background parse job queued

### 6.4 Parse Job (AI-Powered)
- Gemini 2.5 Flash processes PDF/image/CSV
- Extracts:
  - Institution code and name
  - Statement date and period (start/end)
  - Account details (type, product name, identifier, currency)
  - All transactions with: date, posting_date, description, merchant, amount, currency, statement_type, category_hint
  - Summary data: opening/closing balance, due date, minimum payment
- Results stored in `file_imports.raw_parse_result` (JSON)
- `import_staging` rows created (one per transaction)
- Status updated: `parsing` → `in_review`

### 6.5 Statement Types (per transaction)
`purchase`, `credit_card_payment`, `paynow`, `transfer_in`, `transfer_out`, `giro`, `fee`, `interest`, `refund`, `withdrawal`, `deposit`, `salary`, `dividend`, `reversal`, `loan_repayment`, `wallet_topup`, `unknown`

### 6.6 Review Workflow
- User sees all parsed transactions in a staging table
- Each row shows: date, merchant, description, amount, type, status
- User can:
  - Approve individual rows
  - Reject individual rows with notes
  - Edit merchant name, amount, date
  - Bulk approve / bulk reject
  - View duplicate warnings (transactions with same hash)
- All actions logged in `approval_log`

### 6.7 Commit
- Approved rows committed to `statement_transactions` table
- `file_imports` status → `committed`
- `statement_imports` row finalized with counters
- Duplicate rows skipped (same `txn_hash` per account)

### 6.8 Statements Overview (`/statements/overview`)
- Groups statements by institution (DBS, OCBC, Citi, HSBC, etc.)
- Sub-groups by type (Credit Card, Savings, Credit Line, etc.)
- Per-statement card shows:
  - Bank name with color indicator
  - Status badge (Committed / In Review)
  - Opening/closing balance, transaction count, dates
  - For credit cards: due date, minimum payment, outstanding balance
- Metric tiles: total liability, committed vs in-review totals

### 6.9 Statement Direction Normalization
**Credit (income):** payment, refund, reversal, interest, salary, transfer_in, deposit
**Debit (expense):** purchase, fee, transfer_out, giro, withdrawal, wallet_topup

---

## 7. Receipt Capture Pipeline

### 7.1 Supported Input
- JPEG/PNG receipt photos
- PDF receipts
- Drag-and-drop or file picker upload

### 7.2 Upload Flow
1. User uploads image on Receipts page
2. `POST /api/receipts/upload` — file uploaded to `receipts` storage bucket
3. SHA256 hash checked for duplicates (409 if duplicate)
4. `receipt_uploads` row created with status `uploaded`
5. Background classification job runs

### 7.3 AI Extraction (Gemini 2.5 Flash OCR)
Extracts from receipt image:
- Merchant name
- Transaction date + payment time
- Total amount, tax amount
- Payment type (card, cash, wallet, bank_transfer, unknown)
- Payment breakdown (cash + card splits)
- Receipt/invoice reference number
- Line items: name, quantity, unit price, line total, discount
- Extraction confidence score (0–1, minimum 0.55)
- Warnings: missing merchant, low image quality, etc.

### 7.4 Classification Pipeline (Cascading Priority)
For each receipt, the system runs these stages in order until confidence ≥ 0.7:

| Stage | Method | Confidence |
|-------|--------|-----------|
| 1 | Knowledge base lookup (`receipt_merchant_kb` + `receipt_item_kb`) | 1.0 |
| 2 | Heuristic keyword matching (NTUC/FairPrice → Groceries, Starbucks → Dining, etc.) | 0.70–0.72 |
| 3 | Web search enrichment (merchant name + "singapore business type") | 0.76 |
| 4 | LLM classification (GPT-4o-mini with structured JSON output) | 0.65–0.85 |

**Category resolution:**
- Dominant category calculated from item-level results (weighted by line total)
- Mixed basket flag set if top category < 75% of spend AND second ≥ 20%
- High-confidence results (≥ 0.85) auto-saved to knowledge base

### 7.5 Duplicate Detection
- System checks for existing receipts with matching: date ± 1 day, amount, merchant
- `receipt_duplicate_candidates` rows created with similarity score + signals
- User resolves: "This is a duplicate" or "These are different transactions"

### 7.6 Review UI (`/receipts/review/[uploadId]`)
- Receipt image display
- Extracted header: merchant, date, total, payment type
- Line items table (editable): name, qty, unit price, line total, category
- Duplicate candidates with similarity scores
- Category selector (from `receipt_categories`)
- Tag selector
- Inline tag creation
- Approve or send back for re-classification

### 7.7 AI Chat for Receipts
- `POST /api/receipts/review/[uploadId]/chat`
- Multi-turn conversational interface to correct extracted data
- SSE streaming for response chunks
- E.g., "The merchant should be 'FairPrice Xtra'" or "Item 3 is pet food, not groceries"

### 7.8 Receipts List (`/receipts`)
Upload queue metrics (6 status tiles):
- Total, Parsing, Needs Review, Ready, Committed, Final

Latest uploads table (12 rows): filename, size, status badge, error, review link

Approved receipts table: date, merchant, amount, tags, status, edit-tags button

**Bulk Operations:**
- Multi-select receipts
- Bulk add/remove tags
- Inline tag creation

### 7.9 Receipt Categories
Pre-seeded global categories:
Groceries, Household Supplies, Personal Care, Dining, Electronics, Clothing, Home Furnishing, Medical/Pharmacy, Kids/School, Gifts/Flowers, Hardware/DIY, Automotive, Pet Supplies, Mixed Basket

Households can have custom receipt categories.

---

## 8. Transaction Management

### 8.1 Transaction Explorer (`/transactions`)
- Full transaction list across all accounts
- Search by merchant, description, amount
- Filter by account, category, date range, tag, type
- Paginated table (25 per page)
- Bulk categorization
- Bulk tagging
- Per-transaction edit: merchant, category, tags, notes

### 8.2 Transaction Data Model
Each `statement_transaction` has:
- Date (txn_date + posting_date)
- Merchant (raw and normalized)
- Description
- Amount + currency
- Type (debit/credit/transfer)
- Category (FK → categories)
- Merchant (FK → merchants)
- Tags (junction table)
- Statement import reference
- Account reference

### 8.3 Transfer Detection
- System automatically identifies internal transfers between accounts
- Transfer types detected: `internal_transfer`, `credit_card_payment`, `loan_repayment`
- Detection logic: matching amount + date proximity (within N days) + direction
- `transaction_links` table stores debit/credit pairs
- Transfer chain visualization: origin → passthrough → terminal nodes

### 8.4 Transfer Chain Grouping
- Multi-hop transfers grouped into chains
- Each chain has: origin, passthrough nodes, terminal(s)
- `transfer_chain_id` links related transactions
- Ledger views:
  - `spending` — regular expense transactions
  - `cash_flow` — income and outbound payments (salary, CC payments)
  - `excluded` — internal transfers (no double counting)

### 8.5 Category Compatibility
- Credit transactions: can only be assigned `income` or `transfer` categories
- Debit transactions: can only be assigned `expense` or `transfer` categories
- Validation enforced at UI and API level

### 8.6 Receipt-to-Transaction Linking
- Users can match a committed receipt to a statement transaction
- Creates record in `mappings` table (`statement_transaction_id` ↔ `receipt_id`)
- Match source tracked: `system` (AI) or `user` (manual)

---

## 9. Category System

### 9.1 Category Hierarchy (3 levels)
```
Category Group (e.g., Food & Dining)
  └── Category Subgroup (e.g., Groceries)
        └── Category (e.g., FairPrice, Cold Storage)
```

### 9.2 Category Types
- `expense` — Debit/spending transactions
- `income` — Credit/income transactions
- `transfer` — Internal moves between accounts

### 9.3 Category Properties
| Property | Description |
|----------|-------------|
| name | Display name |
| type | expense / income / transfer |
| group_id | FK → category_groups |
| subgroup_id | FK → category_subgroups |
| payment_subtype | E.g., income_salary, income_investment |
| ledger_view | spending / cash_flow / excluded |
| icon_key | Icon identifier |
| color_token | Design system color |
| color_hex | Hex fallback |
| is_active | Active/inactive |
| household_id | NULL = system default; UUID = household-specific |

### 9.4 Categories Page (`/categories`)
- Hierarchical display: Group → Subgroup → Categories
- Search and filter (by domain: statement or receipt)
- Create new group with domain
- Create new subgroup with parent group
- Edit category (name, icon, color, status)
- Mark active/inactive
- Transaction count per group/subgroup

### 9.5 Taxonomy Management (Settings → Taxonomy tab)
- View all ~100+ system categories with group/subgroup mappings
- Create custom groups for household
- Create custom subgroups under any group
- View full domain hierarchy table

---

## 10. Tag System

### 10.1 Tag Properties
| Property | Description |
|----------|-------------|
| name | Tag label |
| source | system / user / inline |
| color_token | Design system color |
| color_hex | Hex override |
| icon_key | Icon identifier |
| is_active | Active/inactive |

### 10.2 Tag Sources
- `system` — Pre-defined system tags
- `user` — Created by user in the Tags page
- `inline` — Created inline during statement/receipt review

### 10.3 Tags Page (`/tags`)
- Search by name
- Filter by source (all, default, member, custom, system)
- Sort by name, created_at, usage_count
- Usage counts: statements, receipts, total
- Create tag with: name, icon, color token, hex override, description, live preview
- Edit tag
- Merge tag into another (select survivor)
- Delete/deactivate tag

### 10.4 Tag Application
Tags can be applied to:
- Statement transactions (individually or in bulk)
- Receipts (individually or in bulk)
- During review workflows (inline tag creation)

---

## 11. Merchant Intelligence

### 11.1 Merchant Data Model
| Field | Description |
|-------|-------------|
| name | Canonical display name |
| normalized_name | Lowercase, punctuation-stripped (for matching) |
| family_name | Parent brand/chain (e.g., "GRAB") |
| business_type | Category type (restaurant, retail, subscription, etc.) |
| category_id | FK → preferred expense category |
| aliases | Array of known alternate names |
| web_summary | AI-enriched description from web search |
| is_active | Active/inactive |

### 11.2 Merchant Knowledge Base (`statement_merchant_kb`)
Per-household knowledge base with:
- Normalized → canonical name mapping
- Category assignment + confidence score (0–100)
- Decision source: `knowledge_base`, `alias_resolution`, `genai_suggestion`, `manual_override`, `web_enriched`
- Usage count + first/last seen dates

### 11.3 Merchant Resolution Pipeline
1. **Bundled knowledge** — `knowledge/merchant_categories.json` (pre-loaded common merchants)
2. **Household KB lookup** — `statement_merchant_kb` per household
3. **Alias resolution** — Match raw name to known aliases
4. **Web enrichment** — Search "{merchant} singapore business type" for unknowns
5. **LLM suggestion** — GPT-4o infers category from name + context
6. **Manual override** — User confirmation always wins

### 11.4 Merchants Page (`/merchants`)
- Search and filter (status: active/inactive)
- Sort by: updated_at, name, alias count, transaction count, receipt count, total spend
- Bulk selection with merge option
- **Create merchant:** name, status, notes, icon (10 options), color, manual aliases
- **Merchant detail modal:** all metadata, alias list with source + timestamp, usage counters
- **Merge dialog:**
  - Select multiple merchants to merge
  - Pick survivor
  - Impact preview: aliases, transactions, receipts, ledger entries affected
  - Confirmation required
- **Backfill action:** Auto-link all existing transactions/receipts to merchants retroactively

---

## 12. Dashboard & Analytics

### 12.1 Main Dashboard (`/dashboard`)

**Period selector:** Month, Quarter, Year, All History
Auto-expands to All History if current period has no data.

**Scope filter drawer:**
- Filter by specific account(s) or all
- Filter by category group / subgroup / individual category
- Custom date range override

**4 KPI cards:**
1. Net Worth — household assets minus liabilities (live)
2. Period Spend — total debit spend in period
3. Period Income — total credit income in period
4. Pending Advances — outstanding advance total

**Visualizations:**
- Net Worth Proxy Trend — line chart of approximate trend
- Spend Breakdown — category-wise distribution chart
- Account Snapshot — top 5 accounts by value

**Recent Transactions Ledger:**
- 8 most recent transactions
- Date, merchant, category, amount, currency
- Color-coded by category

### 12.2 Drilldown (`/dashboard/drilldown`)
- Triggered from dashboard charts by clicking a category/merchant/period
- 4 summary cards: period label, subtotal, transaction count, busiest day
- Paginated transaction table (25/page, URL-based pagination)
- Breadcrumb back to dashboard (preserves original tab/filter/dimension state)

### 12.3 Ledger Views
| View | What it shows |
|------|--------------|
| `spending` | Regular expense transactions |
| `cash_flow` | Income + outbound payments |
| `excluded` | Internal transfers (hidden from spend calculations) |

---

## 13. AI Chat (Financial Assistant)

### 13.1 Chat Interface (`/chat`)
- Persistent chat interface in sidebar footer
- Message history with user/assistant avatars
- Markdown rendering for assistant responses (tables, lists, bold)
- Quick-start prompt chips on first load
- New chat / reset button
- Input disabled during streaming

### 13.2 Chat Orchestration (3-Stage Pipeline)

**Stage 1 — Router (GPT-4o-mini)**
- Classifies query into intents: `spending`, `net_worth`, `cash_flow`, `advances`, `transactions`, `financial_advice`, `general`
- Parses date ranges from natural language ("last month", "Q1 2025")
- Extracts filters: account IDs, merchant names, category names
- Sets groupBy: merchant / category / month / account / none
- Sets currency mode: single_currency / segment_by_currency
- Paginates: limit (1–25, default 8), cursor (base64-encoded)

**Stage 2 — Planner (GPT-4o-mini)**
- Decides which data tools to call (max 3 per turn)
- Available tools:
  - `get_spending_summary` — debits grouped by merchant/category
  - `get_net_worth` — account balances by currency
  - `get_cash_flow` — income/expenses with monthly breakdown
  - `get_advances` — outstanding advances with counterparties
  - `get_transactions` — paginated transaction list with cursor
  - `get_account_summary` — latest balances, holdings, card details

**Stage 3 — Finalizer (GPT-4o)**
- Receives tool results + full conversation context
- Streams response as Server-Sent Events (SSE)
- Returns `ChatAssistantContext` metadata for follow-up queries

### 13.3 Session Context (`GET /api/ai/chat/session`)
Loaded on page open:
- User display name + household info
- Base currency
- All accounts summary
- Prompt chip suggestions: "What's my net worth?", "Show top merchants this month", etc.
- Coverage ranges: earliest/latest transactions, ledger entries, statement summaries

### 13.4 SSE Event Types
| Event | Payload |
|-------|---------|
| `status` | Loading indicator text |
| `delta` | Text chunk to append |
| `done` | Final assistantContext object |
| `error` | Error message |

### 13.5 Financial Advisor Context
- Singapore/India-specific knowledge: CPF, EPF, HDB, SRS, SSB, local bank products
- Primary currency: SGD (S$)
- Does NOT give specific buy/sell recommendations for stocks or crypto
- Disclaims as general guidance, not licensed financial advice
- Max response: 800 tokens

---

## 14. Asset Tracking

### 14.1 Investments (`/investments`)
- Holdings summary: total assets count, recent trades count
- Asset allocation donut chart (D3, color-coded by symbol)
- Holdings table: symbol, asset type badge, balance
- Empty state: prompt to import brokerage statement

**Supported asset types:** stocks, ETFs, bonds, mutual funds, REITs

### 14.2 Crypto (`/crypto`)
- Exchange accounts list: name, product, status badge
- Crypto holdings table: symbol, asset name, balance
- Summary cards: exchange count, positions count
- Empty state: prompt to add crypto exchange account

### 14.3 Asset Data Model (`asset_balances`)
- Per account, per date snapshot of holdings
- `assets` JSONB array with: symbol, asset_name, asset_type, balance, quantity, unit_price
- Net asset value computed from latest balances

### 14.4 Properties (`/properties`)
**Status: Planned** — Route visible, empty state placeholder (Building icon)

---

## 15. Advances (Personal Loans)

### 15.1 Overview
Track money lent to or borrowed from others (friends, family, colleagues).

### 15.2 Advance Data Model
| Field | Description |
|-------|-------------|
| is_recoverable | true = owed to user; false = user owes |
| expected_recovery_amount | Total advance amount |
| status | `pending`, `partial`, `settled`, `written_off` |
| due_date | Expected repayment date |
| counterparty | Name + relationship |
| notes | Free text |

### 15.3 Advances Page (`/advances`)
- Summary cards: total count, total outstanding (pending + partial)
- Advances table: counterparty, relationship, amount, due date, recoverable flag, status badge
- Status colors: pending (yellow), partial (blue), settled (green), written_off (grey)
- Empty state if no advances

### 15.4 Repayments
- `advance_repayments` records partial/full repayments
- Fields: repayment_date, amount, method (cash, transfer, etc.), notes
- Advance status computed from total repayments vs expected amount

---

## 16. Data Health & Integrity

### 16.1 Reconciliation Checks (`/data-health`)
**Run Reconciliation** triggers 3 checks:
1. **Balance Check** — Verify account balances match transaction sum
2. **Duplicate Check** — Detect duplicate transactions (same date/amount/merchant)
3. **Anomaly Scan** — Flag statistically unusual transactions

Results displayed as pass / warning / fail with summary messages.

### 16.2 Health Score Display
- Overall health indicator: Healthy / Needs Attention / Issues Found
- 4 metric cards: Overall Health (ShieldCheck/ShieldAlert), Balance Check, Duplicate Check, Anomaly Scan

### 16.3 Quarantine Queue
- AI-generated entries flagged during import that need human review
- Per item: severity (low / medium / high / critical), reason, table name, source, timestamp
- Actions: Approve (add to live data) or Reject (discard)
- Reject confirmation dialog prevents accidental removal

### 16.4 Audit Log
- Rolling log of all data changes (insert, update, delete)
- Shows: action type, table affected, source (import/manual/AI), relative timestamp
- Scrollable, 20 most recent entries
- Provides accountability and change traceability

---

## 17. Settings & Preferences

### 17.1 Profile Tab
- Edit display name, avatar URL
- Email (read-only, from Supabase auth)
- Save persists to `user_profiles`

### 17.2 Household Tab (Owner only for management)
- Invite users: email + display name
- Members table: name, email, role, edit, remove
- Pending invitations: email, name, role, date, revoke
- Edit member dialog: name + role (owner/member)
- Edit household name dialog

### 17.3 Security Tab
- Change password (current, new, confirm)
- Two-factor authentication toggle
- Active sessions list with device names + revoke capability
- *(Partially implemented — security features are UI-ready but not fully wired)*

### 17.4 Preferences Tab
- Base currency selector (SGD, INR, USD, EUR, GBP)
- Theme selector (light / dark)
- Notification toggles:
  - Email alerts
  - Budget alerts

### 17.5 Data Tab
- Export all data as CSV
- Delete account (danger zone with typed confirmation)

### 17.6 Taxonomy Tab
Sub-tabs:
- **Categories** — List all ~100+ categories with type and group/subgroup
- **Groups** — List groups with transaction counts, create new group with domain
- **Subgroups** — List subgroups with parent and counts, create new with parent selection
- **Hierarchy** — Full domain → group → subgroup → category table

---

## 18. Planned / Placeholder Features

These routes exist in the navigation but show empty state placeholders:

| Feature | Route | Status |
|---------|-------|--------|
| Budgets | `/budgets` | Planned (PieChart placeholder) |
| Goals | `/goals` | Planned (Target placeholder) |
| Properties | `/properties` | Planned (Building placeholder) |
| Documents | `/documents` | Planned (FileText placeholder) |
| Notifications | `/notifications` | Planned (Bell placeholder) |

---

## 19. API Reference

### Authentication
All endpoints require Supabase auth session (cookie-based). Service endpoints use service role key.

### Chat APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ai/chat/session` | Load session context, accounts, prompt chips |
| POST | `/api/ai/chat` | Send message, receive SSE stream |

### Statement APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/statement` | Upload statement file |
| GET | `/api/ai/statement/[importId]` | Get parsed statement details |
| POST | `/api/ai/statement/[importId]/rows` | Get staging transaction rows |
| POST | `/api/ai/statement/commit` | Commit approved transactions |
| POST | `/api/ai/statement/[importId]/links` | Link statement txns to receipts |

### Categorization APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/categorize` | Auto-categorize a transaction |
| PUT | `/api/ai/categorize` | Confirm/correct + update knowledge base |

### Receipt APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/receipts/upload` | Upload receipt image |
| GET | `/api/receipts/review/[uploadId]` | Get receipt for review |
| PATCH | `/api/receipts/review/[uploadId]` | Update receipt details |
| POST | `/api/receipts/classification/[uploadId]` | Trigger AI classification |
| POST | `/api/receipts/review/[uploadId]/approve` | Approve and commit receipt |
| POST | `/api/receipts/review/[uploadId]/chat` | AI chat for receipt correction |
| GET | `/api/receipts` | List committed receipts |
| GET | `/api/receipts/uploads` | List all upload history |
| GET | `/api/receipts/[id]/tags` | Get tags for receipt |
| POST | `/api/receipts/[id]/tags` | Apply tags to receipt |
| POST | `/api/receipts/tags/bulk` | Bulk tag receipts |

### Statement Transaction APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/statement-transactions/[id]/tags` | Add tags to transaction |
| POST | `/api/statement-transactions/tags/bulk` | Bulk tag transactions |

### Account & Merchant APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/accounts` | List / create accounts |
| PATCH | `/api/accounts/[id]` | Update account |
| GET | `/api/merchants` | List merchants |
| POST | `/api/merchants` | Create merchant |
| PATCH/DELETE | `/api/merchants/[id]` | Update / delete merchant |
| GET | `/api/merchants/[id]` | Merchant detail with aliases |
| POST | `/api/merchants/[id]/merge` | Merge merchant (preview + execute) |
| POST | `/api/merchants/backfill` | Backfill transactions to merchants |

### Category & Tag APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/categories/taxonomy` | Full category taxonomy |
| GET/POST | `/api/categories` | List / create categories |
| GET/PATCH/DELETE | `/api/categories/[domain]/[id]` | Category CRUD |
| POST | `/api/categories/[domain]/[id]/merge` | Merge categories |
| GET/POST | `/api/tags` | List / create tags |
| PATCH/DELETE | `/api/tags/[id]` | Update / delete tag |
| POST | `/api/tags/[id]/merge` | Merge tag |

### Household APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/PATCH | `/api/household` | Get/update household |
| GET | `/api/household/profiles` | List members |
| PATCH/DELETE | `/api/household/profiles/[id]` | Edit / remove member |
| GET/POST | `/api/household/invitations` | List / create invitations |
| DELETE | `/api/household/invitations/[id]` | Revoke invitation |

### Integrity APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/integrity/reconcile` | Run / view reconciliation |
| GET/PUT | `/api/integrity/quarantine` | Manage quarantine items |
| GET | `/api/integrity/audit-log` | Fetch audit log |

### Institution APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/institutions` | List institutions |
| GET | `/api/institutions/[id]/brand-preview` | Preview institution brand |

---

## 20. Database Schema

> Schema derived from the live Supabase PostgreSQL instance. All tables are in the `public` schema with Row-Level Security enabled. Multi-tenancy is enforced via `household_id` on every data table.

---

### 20.1 Household & User Management

#### `households`
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid PK | gen_random_uuid() | |
| name | text NOT NULL | | |
| base_currency | text NOT NULL | `'SGD'` | |
| created_at | timestamptz | now() | |

#### `user_profiles`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | = auth.users.id |
| household_id | uuid FK → households | |
| display_name | text | |
| avatar_url | text | |
| role | text | `'owner'` or `'member'` |
| created_at / updated_at | timestamptz | |

#### `household_members`
Physical people in a household (not necessarily app users).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| household_id | uuid FK → households | |
| display_name | text NOT NULL | |
| role | enum `member_role` | `self / spouse / child / parent / other` |
| is_active | boolean | Default true |
| created_at | timestamptz | |

#### `household_user_invites`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| household_id | uuid FK → households | |
| email | text NOT NULL | |
| normalized_email | text NOT NULL | Lowercased |
| display_name | text | |
| role | text | Default `'member'` |
| invited_by | uuid FK → user_profiles | |
| accepted_user_id | uuid FK → user_profiles | Set on acceptance |
| accepted_at | timestamptz | |
| revoked_at | timestamptz | |
| created_at / updated_at | timestamptz | |

---

### 20.2 Institutions & Accounts

#### `institutions`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text NOT NULL UNIQUE | DBS, OCBC, UOB, etc. |
| type | enum `institution_type` | Default `'bank'` |
| country_code | text | SG, IN, etc. |
| household_id | uuid FK → households | NULL = global |
| website_url | text | |
| icon_url | text | |
| created_at | timestamptz | |

#### `institution_profiles`
Parsing configuration per institution (format, column mappings, FX rules).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| institution_id | uuid FK → institutions | |
| format | text | `pdf / csv / manual` |
| country_code / currency | text | |
| fx_prompt_required | boolean | |
| date_format | text | Expected date format |
| amount_convention | text | `absolute / signed / debit_credit_columns` |
| debit_column / credit_column | text | For CSV |
| column_mapping | jsonb | Custom field mappings |
| parsing_hints | jsonb | OCR/parsing hints |
| account_types_supported | text[] | |
| is_active | boolean | |

#### `accounts`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| household_id | uuid FK → households | |
| institution_id | uuid FK → institutions | |
| account_type | enum `account_type` | savings / current / credit_card / investment / crypto_exchange / loan / fixed_deposit |
| product_name | text NOT NULL | |
| nickname | text | User-friendly label |
| identifier_hint | text | Masked account number |
| currency | text NOT NULL | Default `'SGD'` |
| is_active | boolean | Default true |
| country_code | text | |
| created_at | timestamptz | |

#### `account_members`
Maps accounts to household members with ownership details.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| account_id | uuid FK → accounts | |
| member_id | uuid FK → household_members | |
| role | enum `account_member_role` | Default `'primary_owner'` |
| ownership_percent | numeric | 0–100, nullable |
| created_at | timestamptz | |

#### `cards`
Credit card details (one-to-one with account).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| account_id | uuid FK → accounts UNIQUE | |
| card_name | text NOT NULL | |
| card_number_masked | text | |
| card_type | enum `card_type` | Default `'unknown'` |
| card_last4 | text NOT NULL | Exactly 4 chars |
| previous_balance | numeric | ≥ 0 |
| new_transactions | numeric | ≥ 0 |
| total_outstanding | numeric | ≥ 0 |
| minimum_payment | numeric | ≥ 0 |
| created_at | timestamptz | |

#### `exchange_accounts`
Crypto exchange details (one-to-one with account).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| account_id | uuid FK → accounts UNIQUE | |
| exchange_name | text | |
| account_label | text | |
| created_at | timestamptz | |

---

### 20.3 Statement Import Pipeline

#### `file_imports`
Central record for each uploaded statement file.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| household_id | uuid FK → households | |
| account_id | uuid FK → accounts | |
| uploaded_by | uuid FK → user_profiles | |
| file_name | text NOT NULL | |
| file_sha256 | text NOT NULL | SHA-256 hash for dedup |
| mime_type | text NOT NULL | |
| file_size_bytes | bigint NOT NULL | |
| status | enum `file_import_status` | `received → parsing → in_review → committing → committed → rejected / duplicate / failed` |
| duplicate_of_file_import_id | uuid FK → file_imports | Set if duplicate |
| institution_code | text | dbs_bank, ocbc, uob, etc. |
| institution_id | uuid FK → institutions | |
| statement_date | date | |
| statement_period_start / end | date | |
| currency | text | |
| parse_confidence | numeric | |
| raw_parse_result | jsonb | Full AI parse output |
| summary_json | jsonb | Statement summary metadata |
| card_info_json | jsonb | Card-specific data |
| parse_error | text | Error details if failed |
| total_rows / approved_rows / rejected_rows / duplicate_rows / committed_rows | integer | Running counters |
| committed_statement_import_id | uuid | FK → statement_imports |
| committed_at | timestamptz | |
| storage_bucket / storage_path | text | Supabase Storage location |
| created_at / updated_at | timestamptz | |

#### `statement_parse_sessions`
Temporary session for multi-account statement resolution (24 hr TTL).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| household_id | uuid FK → households | |
| user_id | uuid FK → user_profiles | |
| file_name / file_sha256 / mime_type / file_size_bytes | various | File metadata |
| selected_account_id | uuid FK → accounts | Pre-selected account |
| parsed_payload | jsonb NOT NULL | Raw AI parse result |
| unresolved_descriptors | jsonb | Accounts not yet matched |
| suggested_existing_accounts | jsonb | AI account match suggestions |
| status | text | `needs_account_resolution / resolved / expired` |
| expires_at | timestamptz | now() + 24h |
| resolved_at | timestamptz | |
| storage_bucket / storage_path | text | |
| created_at / updated_at | timestamptz | |

#### `import_staging`
One row per parsed transaction, held for user review before commit.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| file_import_id | uuid FK → file_imports | |
| household_id | uuid FK → households | |
| account_id | uuid FK → accounts | |
| row_index | integer NOT NULL | Order in file |
| review_status | enum `staging_review_status` | `pending / approved / rejected / committed` |
| duplicate_status | enum `staging_duplicate_status` | `none / existing_final / within_import` |
| duplicate_transaction_id | uuid | FK to existing txn if duplicate |
| txn_hash | text NOT NULL | Dedup key |
| source_txn_hash | text NOT NULL | Original hash before edits |
| txn_date | date NOT NULL | |
| posting_date | date | |
| merchant_raw | text NOT NULL | Raw name from statement |
| description | text | Full row description |
| reference | text | Statement reference number |
| amount | numeric NOT NULL | |
| txn_type | text NOT NULL | `debit / credit / unknown` |
| currency | text NOT NULL | |
| original_amount / original_currency | numeric/text | Pre-FX-conversion values |
| confidence | numeric | Parse confidence |
| original_data | jsonb NOT NULL | Raw row from parser |
| is_edited | boolean | Default false |
| review_note | text | Reviewer comment |
| last_reviewed_by | uuid FK → user_profiles | |
| last_reviewed_at | timestamptz | |
| committed_transaction_id | uuid | FK → statement_transactions |
| created_at / updated_at | timestamptz | |

#### `approval_log`
Immutable audit trail for all review actions on import_staging rows.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| household_id | uuid FK → households | |
| file_import_id | uuid FK → file_imports | |
| staging_id | uuid FK → import_staging | |
| actor_user_id | uuid FK → user_profiles | |
| action | enum `approval_action` | `edit / approve / reject / bulk_approve / bulk_reject / commit` |
| old_data / new_data | jsonb | Before/after snapshot |
| note | text | |
| created_at | timestamptz | |

#### `statement_imports`
Finalized import record created on commit.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| account_id | uuid FK → accounts | |
| institution_id | uuid FK → institutions | |
| file_import_id | uuid FK → file_imports | |
| statement_period_start / end | date | |
| statement_name | text NOT NULL | |
| source | text | Default `'telegram'` |
| parse_status | enum `parse_status` | Default `'received'` |
| parse_confidence | numeric | 0–1 |
| created_at | timestamptz | |

#### `statement_summaries`
Per-statement financial summary (balances, due dates, limits).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| statement_import_id | uuid FK → statement_imports UNIQUE | |
| account_id | uuid FK → accounts | |
| card_id | uuid FK → cards | |
| statement_date | date NOT NULL | |
| credit_limit | numeric | ≥ 0 |
| payment_due_date | date | |
| minimum_payment | numeric | ≥ 0 |
| grand_total | numeric | |
| opening_balance / closing_balance | numeric | |
| created_at | timestamptz | |

#### `staging_transaction_links`
Transfer/link detection during staging (before commit).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| file_import_id | uuid FK → file_imports | |
| household_id | uuid FK → households | |
| from_staging_id | uuid FK → import_staging | Source staging row |
| to_staging_id | uuid FK → import_staging | Target staging row (same import) |
| to_transaction_id | uuid FK → statement_transactions | Target committed txn |
| link_type | enum `link_type` | internal_transfer / credit_card_payment / loan_repayment |
| link_score | numeric | 0–1 match confidence |
| link_reason | jsonb | Match signals |
| status | enum `mapping_status` | `needs_review / confirmed / rejected` |
| matched_by | text | `system / user` |
| matched_by_user_id | uuid FK → user_profiles | |
| reviewed_by / reviewed_at | uuid/timestamptz | |
| transfer_chain_id | uuid | Groups multi-hop transfers |
| allocated_amount | numeric | > 0 for splits |
| created_at / updated_at | timestamptz | |

---

### 20.4 Committed Transactions

#### `statement_transactions`
Final committed transaction records. Uniqueness enforced by `(account_id, txn_hash)`.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| statement_import_id | uuid FK → statement_imports | |
| account_id | uuid FK → accounts | |
| card_id | uuid FK → cards | |
| txn_date | date NOT NULL | |
| posting_date | date | |
| merchant_raw | text | Raw merchant name |
| description | text | Full description |
| amount | numeric NOT NULL | Absolute value |
| currency | text NOT NULL | |
| txn_type | text | `debit / credit / unknown` |
| txn_hash | text NOT NULL | Dedup key |
| category_id | bigint FK → categories | |
| merchant_id | uuid FK → merchants | |
| Unique | (account_id, txn_hash) | Prevents duplicate imports |

#### `statement_transaction_tags`
Junction table linking transactions to tags.

| Column | Type |
|--------|------|
| household_id | uuid FK → households |
| statement_transaction_id | uuid FK → statement_transactions |
| tag_id | uuid FK → tags |
| created_by | uuid FK → user_profiles |
| created_at | timestamptz |
| PK | (statement_transaction_id, tag_id) |

#### `ledger_entries`
Unified financial ledger. Each entry represents one financial event (statement txn, receipt, or manual entry).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| entry_date | date NOT NULL | |
| merchant_id | uuid FK → merchants | |
| merchant_display | text | Display name override |
| category_id | bigint FK → categories NOT NULL | |
| amount | numeric NOT NULL | |
| currency | text | Default `'SGD'` |
| payment_account_id | uuid FK → accounts | |
| receipt_id | uuid FK → receipts | |
| statement_transaction_id | uuid FK → statement_transactions | |
| source_priority | enum `ledger_source_priority` | Default `'statement'` |
| status | enum `ledger_status` | Default `'active'` |
| notes | text | |
| attributed_to_member_id | uuid FK → household_members | For per-member expense attribution |
| created_at | timestamptz | |

---

### 20.5 Receipt Capture Pipeline

#### `receipt_uploads`
One row per uploaded receipt file.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| household_id | uuid FK → households | |
| uploaded_by | uuid FK → user_profiles | |
| storage_bucket / storage_path | text NOT NULL | |
| original_filename | text NOT NULL | |
| mime_type | text NOT NULL | |
| file_size_bytes | bigint NOT NULL | |
| file_sha256 | text NOT NULL | Dedup key |
| status | enum `receipt_upload_status` | `uploaded → parsing → needs_review → ready_for_approval → committed → failed` |
| parser_version | text | |
| parse_started_at / parse_completed_at | timestamptz | |
| committed_receipt_id | uuid FK → receipts | Set after approval |
| error_code / error_message / parse_error | text | |
| created_at / updated_at | timestamptz | |

#### `receipt_staging_transactions`
Extracted receipt header data, held for review (one-to-one with upload).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| upload_id | uuid FK → receipt_uploads UNIQUE | |
| household_id | uuid FK → households | |
| review_status | text | `pending / needs_review / ready / approved / committed / failed` |
| duplicate_status | text | `none / needs_review / resolved` |
| merchant_name | text | AI-extracted merchant |
| txn_date | date | |
| payment_time | time | |
| transaction_total | numeric | |
| payment_information | text | Raw payment info |
| payment_type | text | card / cash / wallet / bank_transfer / unknown |
| payment_breakdown_json | jsonb | Splits (cash + card amounts) |
| receipt_reference | text | Invoice/receipt number |
| tax_amount | numeric | |
| currency | text | Default `'SGD'` |
| notes | text | |
| raw_extraction_json | jsonb | Full AI OCR output |
| extraction_confidence | numeric | 0–1 |
| confidence_warnings_json | jsonb | Array of warning strings |
| receipt_category_id | uuid FK → receipt_categories | |
| classification_source | enum `receipt_classification_source` | |
| classification_confidence | numeric | 0–1 |
| classification_version | text | |
| is_mixed_basket | boolean | Default false |
| requires_manual_review | boolean | Default true |
| user_confirmed_low_confidence | boolean | Default false |
| reviewed_by | uuid FK → user_profiles | |
| reviewed_at | timestamptz | |
| committed_receipt_id | uuid FK → receipts | |
| tag_ids_json | jsonb | Array of tag IDs |
| tag_suggestions_json | jsonb | AI-suggested tags |
| created_at / updated_at | timestamptz | |

#### `receipt_staging_items`
Line items extracted from a receipt (linked to staging transaction).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| staging_transaction_id | uuid FK → receipt_staging_transactions | |
| line_number | integer | Default 1 |
| item_name | text | |
| quantity / unit_price / line_total / line_discount | numeric | ≥ 0 |
| metadata | jsonb | Default `{}` |
| raw_line_json | jsonb | Raw OCR line |
| confidence | numeric | 0–1 |
| receipt_category_id | uuid FK → receipt_categories | |
| classification_source | enum `receipt_classification_source` | |
| classification_confidence | numeric | 0–1 |
| is_edited | boolean | Default false |
| created_at / updated_at | timestamptz | |

#### `receipt_classification_runs`
Audit record for each AI classification run on a receipt.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| household_id | uuid FK → households | |
| staging_transaction_id | uuid FK → receipt_staging_transactions | |
| run_version | text | Default `'receipt-classifier-v1'` |
| classified_by | enum | knowledge_base / heuristic / web / llm / user / mixed |
| classification_confidence | numeric | 0–1 |
| model | text | e.g. `'gpt-4o-mini'` |
| rationale | text | Explanation |
| web_summary | text | Web enrichment result |
| input_snapshot / output_snapshot | jsonb | Full request/response |
| created_by | uuid FK → user_profiles | |
| created_at | timestamptz | |

#### `receipt_item_classifications`
Per-item classification result linked to a classification run.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| classification_run_id | uuid FK → receipt_classification_runs | |
| staging_item_id | uuid FK → receipt_staging_items | |
| receipt_category_id | uuid FK → receipt_categories | |
| classified_by | enum | |
| confidence | numeric | 0–1 |
| rationale | text | |
| created_at | timestamptz | |

#### `receipt_duplicate_candidates`
Potential duplicate receipts flagged for user resolution.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| household_id | uuid FK → households | |
| upload_id | uuid FK → receipt_uploads | |
| staging_transaction_id | uuid FK → receipt_staging_transactions | |
| candidate_receipt_id | uuid FK → receipts | Existing receipt (nullable) |
| score | numeric | 0–1 similarity score |
| signals_json | jsonb | Matching signals (date, amount, merchant) |
| status | enum `receipt_duplicate_resolution_status` | `suggested / user_confirmed_duplicate / user_marked_distinct / dismissed` |
| reviewed_by | uuid FK → user_profiles | |
| reviewed_at | timestamptz | |
| created_at / updated_at | timestamptz | |

#### `receipts`
Committed receipt records (final state after approval).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| household_id | uuid FK → households | |
| receipt_datetime | timestamptz | |
| merchant_raw | text NOT NULL | |
| merchant_id | uuid FK → merchants | |
| total_amount | numeric NOT NULL | ≥ 0 |
| tax_amount / service_charge | numeric | ≥ 0 |
| currency | text | Default `'SGD'` |
| payment_method_raw | text | |
| suggested_account_id | uuid FK → accounts | |
| source | text | Default `'telegram'`; also `'upload'` |
| source_upload_id | uuid FK → receipt_uploads | |
| receipt_hash | text UNIQUE | Content dedup key |
| receipt_category_id | uuid FK → receipt_categories | |
| receipt_reference | text | Invoice number |
| payment_type | text | |
| payment_breakdown_json | jsonb | |
| raw_extraction_json | jsonb | |
| parse_warnings_json | jsonb | |
| classification_source | enum | |
| classification_confidence | numeric | 0–1 |
| is_mixed_basket | boolean | |
| status | enum `receipt_status` | Default `'pending_confirm'` |
| approved_by | uuid FK → user_profiles | |
| approved_at | timestamptz | |
| purchased_by_member_id | uuid FK → household_members | |
| extraction_confidence | numeric | 0–1 |
| created_at / updated_at | timestamptz | |

#### `receipt_items`
Committed receipt line items.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| receipt_id | uuid FK → receipts | |
| item_name_raw / item_name_normalized | text | |
| quantity | numeric | ≥ 0 |
| unit_price | numeric | ≥ 0 |
| line_total | numeric NOT NULL | ≥ 0 |
| line_discount | numeric | |
| line_metadata_json | jsonb | |
| category_id | bigint FK → categories | |
| receipt_category_id | uuid FK → receipt_categories | |
| classification_source | enum | |
| classification_confidence | numeric | 0–1 |
| created_at / updated_at | timestamptz | |

#### `receipt_tags`
Junction table linking receipts to tags.

| Column | Type |
|--------|------|
| household_id | uuid FK → households |
| receipt_id | uuid FK → receipts |
| tag_id | uuid FK → tags |
| created_by | uuid FK → user_profiles |
| created_at | timestamptz |
| PK | (receipt_id, tag_id) |

#### `mappings`
Links a committed receipt to a statement transaction (receipt-to-transaction matching).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| statement_transaction_id | uuid FK → statement_transactions | |
| receipt_id | uuid FK → receipts | |
| match_score | numeric | 0–1 |
| match_type | enum `match_type` | Default `'fuzzy'` |
| match_reason | jsonb | Matching signals |
| status | enum `mapping_status` | `needs_review / confirmed / rejected` |
| matched_by | enum `match_actor` | `system / user` |
| matched_by_user_id | uuid FK → user_profiles | |
| reviewed_at | timestamptz | |
| notes | text | |
| created_at / updated_at | timestamptz | |

---

### 20.6 Knowledge Bases

#### `statement_merchant_kb`
Per-household learned merchant → category mappings for statement transactions.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| household_id | uuid FK → households | |
| merchant_id | uuid FK → merchants | |
| normalized_merchant_name | text NOT NULL | |
| canonical_merchant_name | text NOT NULL | |
| family_name | text NOT NULL | Brand/chain |
| aliases | text[] | Known alternate names |
| business_type | text | |
| approved_category_id | bigint FK → categories | |
| approved_category_name | text NOT NULL | Denormalized for speed |
| confidence | numeric | 0–1 |
| decision_source | text | `knowledge_base / alias_resolution / genai_suggestion / manual_override / web_enriched` |
| usage_count | integer | |
| first_seen_date / last_reviewed_date | timestamptz | |
| notes | text | |
| created_at / updated_at | timestamptz | |

#### `receipt_merchant_kb`
Per-household learned merchant → receipt category mappings.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| household_id | uuid FK → households | |
| merchant_id | uuid FK → merchants | |
| normalized_merchant_name | text NOT NULL | |
| canonical_merchant_name | text NOT NULL | |
| aliases | text[] | Default `{}` |
| receipt_category_id | uuid FK → receipt_categories NOT NULL | |
| confidence | numeric | 0–1 |
| source | enum `receipt_classification_source` | Default `'user'` |
| usage_count | integer | |
| notes | text | |
| created_at / updated_at | timestamptz | |
| Unique | (household_id, normalized_merchant_name) | |

#### `receipt_item_kb`
Per-household learned item name → receipt category mappings.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| household_id | uuid FK → households | |
| normalized_item_pattern | text NOT NULL | |
| canonical_item_name | text NOT NULL | |
| receipt_category_id | uuid FK → receipt_categories NOT NULL | |
| confidence | numeric | 0–1, default 1 |
| source | enum `receipt_classification_source` | Default `'user'` |
| usage_count | integer | |
| notes | text | |
| created_at / updated_at | timestamptz | |
| Unique | (household_id, normalized_item_pattern) | |

---

### 20.7 Categories & Tags

#### `categories`
Master category list (system-wide; no per-household scoping on the main table).

| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK (serial) | |
| name | text NOT NULL UNIQUE | |
| type | enum `category_type` | expense / income / transfer |
| domain_type | enum `category_domain_type` | Default `'payment'` |
| payment_subtype | enum | income_salary / income_investment / etc. |
| group_name | text | Legacy flat grouping |
| group_id | bigint FK → category_groups | Hierarchy level 1 |
| subgroup_id | bigint FK → category_subgroups | Hierarchy level 2 |
| ledger_view | enum `ledger_view` | `spending / cash_flow / excluded` |
| icon_key | text | Default `'tag'` |
| color_token | text | Default `'slate'` |
| color_hex | text | |
| is_active | boolean | Default true |
| is_archived | boolean | Default false |
| is_system | boolean | Default false |
| description | text | |
| display_order | integer | |
| parent_category_id | integer FK → categories | For hierarchy |
| merged_into_category_id | integer FK → categories | Set on merge |
| created_by / updated_by | uuid FK → user_profiles | |

#### `category_groups`
Top-level category groupings (e.g., "Food & Dining", "Transport").

| Column | Type |
|--------|------|
| id | bigint PK (serial) |
| name | text NOT NULL |
| domain | text |
| subtype | text |
| sort_order | integer |
| created_at | timestamptz |

#### `category_subgroups`
Second-level groupings under a `category_groups` entry.

| Column | Type |
|--------|------|
| id | bigint PK (serial) |
| group_id | bigint FK → category_groups |
| name | text NOT NULL |
| domain | text |
| subtype | text |
| sort_order | integer |
| created_at | timestamptz |

#### `payment_category_groups`
Household-specific groupings for payment/statement categories.

| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK (serial) | |
| household_id | uuid FK → households | |
| name | text NOT NULL | |
| payment_subtype | enum | |
| sort_order | integer | |
| is_archived | boolean | |
| is_system_seeded | boolean | |
| template_key | text | |
| description | text | |
| created_by / updated_by | uuid FK → user_profiles | |
| created_at / updated_at | timestamptz | |

#### `payment_category_group_memberships`
Maps a category to a household's payment category group.

| Column | Type |
|--------|------|
| household_id | uuid FK → households |
| category_id | bigint FK → categories |
| group_id | bigint FK → payment_category_groups |
| sort_order | integer |
| PK | (household_id, category_id) |

#### `receipt_category_groups`
Household-specific groupings for receipt categories.

| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK (serial) | |
| household_id | uuid FK → households | |
| name | text NOT NULL | |
| sort_order | integer | |
| is_archived | boolean | |
| is_system_seeded | boolean | |
| template_key | text | |
| description | text | |
| created_by / updated_by | uuid FK → user_profiles | |
| created_at / updated_at | timestamptz | |

#### `receipt_categories`
Categories specific to receipt items (separate from payment categories).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| household_id | uuid FK → households | NULL = global default |
| name | text NOT NULL | |
| category_family | text | Broad grouping |
| description | text | |
| is_active | boolean | |
| sort_order | integer | Default 100 |
| icon_key / color_token / color_hex | text | |
| source_category_id | uuid FK → receipt_categories | For derived categories |
| created_at / updated_at | timestamptz | |
| Unique | (COALESCE(household_id,'global'), lower(name)) | |

#### `receipt_category_group_memberships`
Maps a receipt category to a household's receipt category group.

| Column | Type |
|--------|------|
| household_id | uuid FK → households |
| receipt_category_id | uuid FK → receipt_categories |
| group_id | bigint FK → receipt_category_groups |
| sort_order | integer |
| PK | (household_id, receipt_category_id) |

#### `tags`
Reusable labels applied to both statement transactions and receipts.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| household_id | uuid FK → households | |
| name | text NOT NULL | |
| source | text | `system / user / inline` |
| color_token / color_hex / icon_key | text | |
| is_active | boolean | Default true |
| created_at / updated_at | timestamptz | |

---

### 20.8 Merchants

#### `merchants`
Canonical merchant records with branding and default category.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text NOT NULL UNIQUE | Canonical name |
| normalized_name | text | Lowercase, punctuation-stripped |
| household_id | uuid FK → households | NULL = global |
| default_category_id | bigint FK → categories | |
| icon_key | text | Default `'store'` |
| color_token / color_hex | text | |
| notes | text | |
| merged_into_merchant_id | uuid FK → merchants | Set on merge |
| is_active | boolean | Default true |
| created_by / updated_by | uuid FK → user_profiles | |
| created_at / updated_at | timestamptz | |

#### `merchant_aliases`
Known alternate names / raw transaction strings for merchant matching.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| merchant_id | uuid FK → merchants | |
| household_id | uuid FK → households | Scoped or global |
| raw_name | text | Raw name from statement |
| normalized_raw_name | text | Normalized version |
| pattern | text | Regex/glob pattern (optional) |
| source_type | text | Default `'manual'` |
| source | text | Default `'both'` (statements + receipts) |
| priority | integer | Default 100 |
| confidence | numeric | |
| created_at / updated_at | timestamptz | |

#### `merchant_merge_audit`
Audit trail for all merchant merge operations.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| victim_merchant_id | uuid FK → merchants | Merged away |
| survivor_merchant_id | uuid FK → merchants | Kept |
| moved_counts | jsonb | Records moved: aliases, txns, receipts |
| actor_user_id | uuid FK → user_profiles | |
| created_at | timestamptz | |

---

### 20.9 Assets & Investments

#### `assets`
Tradeable asset registry (stocks, crypto tokens, ETFs).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| symbol | text NOT NULL UNIQUE | e.g. AAPL, BTC |
| name | text | |
| asset_type | enum `asset_type` | stock / etf / crypto / bond / etc. |
| decimals | integer | Default 8 |
| created_at | timestamptz | |

#### `assets_registry`
Broader asset registry for real-world assets (property, insurance, etc.).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text NOT NULL | |
| asset_class | enum `asset_class` | |
| country_code | text NOT NULL | |
| notes | text | |
| created_at | timestamptz | |

#### `asset_balances`
Point-in-time balance for a specific asset in an account.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| account_id | uuid FK → accounts | |
| asset_id | uuid FK → assets | |
| balance | numeric | Default 0 |
| as_of | timestamptz | Default now() |

#### `asset_valuations`
Historical valuation of assets (with FX conversion to base currency).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| asset_id | uuid FK → assets_registry | |
| valuation_date | date NOT NULL | |
| currency | text NOT NULL | Source currency |
| value | numeric NOT NULL | |
| base_currency | text | Default `'SGD'` |
| base_value | numeric | Converted value |
| fx_rate | numeric | Conversion rate used |
| created_at | timestamptz | |

#### `investment_transactions`
Individual investment trade records (buys, sells, dividends, etc.).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| account_id | uuid FK → accounts | |
| txn_time | timestamptz NOT NULL | |
| txn_type | enum `investment_txn_type` | buy / sell / dividend / deposit / withdrawal / etc. |
| asset_id | uuid FK → assets | Asset traded |
| amount | numeric NOT NULL | Units of asset |
| price_in_quote | numeric | Price per unit |
| quote_asset_id | uuid FK → assets | Quote currency asset |
| quote_amount | numeric | Total cost in quote currency |
| statement_transaction_id | uuid FK → statement_transactions | Linked cash txn |
| external_txn_id | text | Exchange-provided ID |
| txn_hash | text UNIQUE | Dedup key |
| notes | text | |
| trade_group_id | uuid FK → trade_groups | Groups related trades |
| created_at | timestamptz | |

#### `trade_groups`
Groups related investment transactions (e.g., multi-leg trades).

*(Referenced by `investment_transactions.trade_group_id`)*

---

### 20.10 Advances (Personal Loans)

#### `counterparties`
People or entities involved in advances.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text NOT NULL UNIQUE | |
| relationship | text | friend / family / colleague / etc. |
| notes | text | |
| created_at | timestamptz | |

#### `advances`
A personal loan or advance given to / received from a counterparty.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| ledger_entry_id | uuid FK → ledger_entries UNIQUE | Source ledger event |
| counterparty_id | uuid FK → counterparties | |
| is_recoverable | boolean | true = owed to user; false = user owes |
| expected_recovery_amount | numeric NOT NULL | ≥ 0 |
| status | enum `advance_status` | `pending / partial / settled / written_off` |
| due_date | date | |
| notes | text | |
| created_at | timestamptz | |

#### `advance_repayments`
Records of repayments against an advance.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| advance_id | uuid FK → advances | |
| repayment_date | date NOT NULL | |
| amount | numeric NOT NULL | > 0 |
| statement_transaction_id | uuid FK → statement_transactions | Linked bank transaction |
| method | text | cash / transfer / etc. |
| notes | text | |
| created_at | timestamptz | |

---

### 20.11 System & Data Quality

#### `exceptions`
Data quality issues flagged during import or reconciliation.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| type | enum `exception_type` | |
| source_table | text NOT NULL | Table where issue was found |
| source_id | uuid NOT NULL | Row ID with the issue |
| details | jsonb | Default `{}` |
| status | enum `exception_status` | Default `'open'` |
| created_at | timestamptz | |

---

### 20.12 Storage Buckets (Supabase)

| Bucket | Path Pattern | RLS Policy |
|--------|-------------|-----------|
| `statements` | `households/{household_id}/{file_name}` | Owner household only |
| `receipts` | `households/{household_id}/{upload_id}/{filename}` | Owner household only |

---

### 20.13 Key Enum Types

| Enum | Values |
|------|--------|
| `account_type` | savings / current / credit_card / investment / crypto_exchange / loan / fixed_deposit |
| `account_member_role` | primary_owner / joint_owner / beneficiary |
| `advance_status` | pending / partial / settled / written_off |
| `card_type` | credit / debit / prepaid / unknown |
| `category_domain_type` | payment / receipt |
| `exception_status` | open / resolved / dismissed |
| `file_import_status` | received / parsing / in_review / committing / committed / rejected / duplicate / failed |
| `institution_type` | bank / credit_card / broker / exchange |
| `ledger_view` | spending / cash_flow / excluded |
| `match_actor` | system / user |
| `match_type` | exact / fuzzy / manual |
| `mapping_status` | needs_review / confirmed / rejected |
| `member_role` | self / spouse / child / parent / other |
| `parse_status` | received / parsing / completed / failed |
| `receipt_classification_source` | knowledge_base / heuristic / web / llm / user / mixed |
| `receipt_duplicate_resolution_status` | suggested / user_confirmed_duplicate / user_marked_distinct / dismissed |
| `receipt_status` | pending_confirm / confirmed / rejected |
| `receipt_upload_status` | uploaded / parsing / needs_review / ready_for_approval / committed / failed |
| `staging_duplicate_status` | none / existing_final / within_import |
| `staging_review_status` | pending / approved / rejected / committed |

---

## 21. AI Models & Capabilities

### Model Usage Summary
| Feature | Model | Input | Output | Key Config |
|---------|-------|-------|--------|-----------|
| Statement OCR | Gemini 2.5 Flash | PDF/CSV/ZIP | Structured JSON | Multi-page, institution-specific rules |
| Receipt OCR | Gemini 2.5 Flash | Receipt image | Items + header | Min confidence 0.55 |
| Transaction Categorization | GPT-4o | Merchant + amount + desc | Category + confidence | KB-augmented |
| Chat Routing | GPT-4o-mini | Message + history | Route decision | Forced tool call |
| Chat Planning | GPT-4o-mini | Route + context | Tool calls (max 3) | |
| Chat Response | GPT-4o | Tool results | SSE text stream | 3-stage |
| Financial Advisor | GPT-4o | Message + financial context | Text advice | Max 800 tokens |
| Merchant Intelligence | GPT-4o | Merchant name | Category + canonical name | |
| Receipt Classification | GPT-4o-mini | Merchant + items | Category per item | Structured JSON |

### Environment Variables Required
```
OPENAI_API_KEY
GEMINI_API_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

---

## 22. Non-Functional Requirements

### Security
- All routes protected by Supabase RLS — users can only access their household's data
- Service role key used only server-side in API routes (never exposed to client)
- File uploads validated (type, size, SHA256 dedup) before processing
- Input sanitization on all API endpoints
- Auth session automatically refreshed via middleware on every request

### Performance
- React Query caching for server state (reduces redundant Supabase queries)
- Zustand for minimal client state (auth, UI)
- SSE streaming for AI responses (perceived responsiveness)
- Pagination on all large lists (25/page transactions, 12/page uploads)
- D3 charts rendered client-side for smooth interaction

### Data Integrity
- `txn_hash` uniqueness prevents duplicate transaction imports
- `file_sha256` uniqueness prevents duplicate file uploads
- Staged review workflow prevents unreviewed data from entering live tables
- `approval_log` provides immutable audit trail of all import decisions
- `transfer_chain_id` ensures multi-hop transfers are correctly grouped

### Scalability
- Multi-household architecture from day one (household_id on all tables)
- RLS policies scale with number of households without application changes
- Background job queue for heavy AI operations (parsing, classification)
- Supabase Realtime for live status updates on import jobs

### Testing
- 27 test files (Vitest unit + Playwright E2E)
- Tests cover: statement helpers, receipt normalization, category knowledge, transfer detection, category compatibility
- `validate` script: lint + typecheck + build + test

### Internationalisation
- Multi-currency support: SGD, INR, USD, EUR, GBP
- Singapore-first (CPF, HDB, PayNow, GIRO references in AI prompts)
- India secondary (EPF, UPI references)
- Date formats normalized to ISO 8601 internally
- Currency symbols rendered per locale in UI

---

*Generated from source code analysis of WealthHouse frontend/dashboard codebase.*
