# DBS Consolidated Bank Statement — Parsing Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | DBS Bank Ltd / POSB |
| Institution Code | `dbs_bank` |
| Account Type | `bank_account` (multiple sub-accounts) |
| Currency | SGD (primary); USD (multi-currency account) |
| Country | SG |
| Statement Format | PDF (image-only, no embedded text) |
| Statement Title | "Consolidated Statement" |
| Statement Serial | `S/N: EN05300301686439` format |

---

## Critical Structural Feature: Consolidated Multi-Account Statement

A single DBS Consolidated PDF covers **all deposit, investment, and SRS accounts** for the customer. The parser must segment by section and account.

### Top-Level Sections
1. **Account Summary** (page 1–2) — balances only, skip for transaction import
2. **Supplementary Retirement Scheme (SRS)** — investment holdings summary, skip for transactions
3. **Transaction Details** (page 3 onwards) — actual transactions per account

---

## Transaction Details Section Structure

### Account Block Header
```
DBS Savings Account                    Account No. 025-6-041461
```
Pattern: `<Account Name>    Account No. <account_number>`

Followed by column headers:
```
Date | Description | Withdrawal (-) | Deposit (+) | Balance (SGD)
```

### Transaction Row Format
```
<DD/MM/YYYY>  <Description line 1>     <withdrawal>   <deposit>   <balance>
              <Description line 2>
              <Description line 3>
              <Description line 4>
```

- Dates are full `DD/MM/YYYY` format
- Descriptions are multi-line (up to 4 lines) — concatenate all lines for full description
- Withdrawal and Deposit are in separate columns — always positive absolute values
- Balance column present on every row

### Section Boundaries
```
Balance Brought Forward    <amount>   ← Section start marker (no date)
...transactions...
Balance Carried Forward    <amount>   ← Section end marker (no date)
```
Both are bold rows — skip as transactions, use for validation.

---

## Account Types in Consolidated Statement

| Account Name | Account No. Pattern | `account_type` | Notes |
|---|---|---|---|
| DBS Savings Account | `025-6-XXXXXX` | `savings` | Primary SGD account |
| MySavings Account | `590-XXXXX-X` | `savings` | Secondary savings |
| DBS eMulti-Currency Autosave Account | `120-XXXXXX-X` | `multi_currency` | Holds SGD + USD |
| SRS Account | `0120-XXXXXX-X-XXX` | `srs` | Retirement — balance only, no txn import |

> Parser should iterate through all account blocks. Do not hardcode account numbers — extract from header.

---

## Transaction Type Detection

| Description Pattern | `txn_type` | Notes |
|---|---|---|
| `FAST Payment / Receipt` | varies — see below | Common transaction type |
| `Funds Transfer` | `internal_transfer` or `transfer_out` | Depends on context |
| `Cash Deposit Machine` | `cash_deposit` | Income / Transfer |
| `GIRO` | `giro` | Regular bill payment |
| `TOP-UP TO PAYLAH!` | `wallet_topup` | Transfer type |
| `Buy - Mari Invest` / `Buy - ...` | `investment_purchase` | Transfer type |
| `Sell - Mari Invest` / `Sell - ...` | `investment_sale` | Transfer type |
| `Interest` | `interest` | Income |
| `PayNow` / `PAYNOW` | `paynow` | Transfer — check direction |
| Salary-like large deposits | `salary` | Amount + source pattern |

### FAST Payment Sub-classification
FAST transactions embed sub-type in description:
- Line 2 contains reference code (hex string) — store as `reference`
- Line 3: `YYYYMMDDXFEPSGSGBRT...` — FAST transaction reference
- Line 4: `OTHER`, `TRANSFER`, `PAYNOW TRANSFER` — indicates sub-type

Use Line 4 keyword to determine txn_type:
| Line 4 | `txn_type` |
|---|---|
| `OTHER` | `transfer_in` / `transfer_out` |
| `TRANSFER` | `internal_transfer` |
| `PAYNOW TRANSFER` | `paynow` |

---

## Multi-Currency Account Handling

The `DBS eMulti-Currency Autosave Account` holds both SGD and USD:
- Account Summary shows: `SGD 0.41 / USD 27,342.53`
- Transactions may be in either currency
- When parsing transactions for this account, detect currency from context or description
- Store `currency` field per transaction; do not force-convert to SGD at import time

---

## Date Parsing

- Format: `DD/MM/YYYY` (e.g., `28/02/2025`, `01/03/2025`)
- Full 4-digit year — no inference needed
- Statement period stated in Account Summary: `as at DD Mon YYYY`

---

## Description Parsing (Multi-line)

DBS descriptions are frequently multi-line (3–4 lines). Rules:
1. First line: primary description (e.g., `FAST Payment / Receipt`, `Funds Transfer`)
2. Subsequent lines: additional detail (counterparty, reference, sub-type)
3. Concatenate all lines with ` | ` separator for storage in `description` field
4. Extract structured fields separately: `reference`, `counterparty`, `sub_type`

Example:
```
FAST Payment / Receipt
69A84340F6D54E25B1A95CE4E8D89774
20250228XFEPSGSGBRT0051412
OTHER
```
→ `description = "FAST Payment / Receipt"`
→ `reference = "69A84340F6D54E25B1A95CE4E8D89774"`
→ `fast_ref = "20250228XFEPSGSGBRT0051412"`
→ `sub_type = "OTHER"`

---

## Transfer Detection Rules

These transaction types must be marked `txn_type = transfer` and excluded from spending reports:

| Pattern | Reason |
|---|---|
| `TOP-UP TO PAYLAH!` | Wallet top-up (internal transfer) |
| `Funds Transfer / 249-69024-4 : I-BANK` | I-Bank transfer (likely to own account) |
| `Funds Transfer / ANGAPPAN SARAVANAN` | Advance to friend (Saravanan) — flag for Advances agent |
| `FAST Payment / Receipt / FROM: RATHINASABABATHI RATHIKA` | Advance from/to friend (Rathika) — flag for Advances agent |
| `FAST Payment / Receipt / MARI:123443293:I-BANK / TRANSFER` | MariBank transfer |

> **Advance tracking:** Outgoing transfers to named individuals such as ANGAPPAN SARAVANAN and RATHINASABABATHI RATHIKA are known advance counterparties. Always flag these for the Advances agent. Vivek does informal advances with both regularly.

---

## SRS / Investment Sections — Skip Rules

The Consolidated Statement includes:
- SRS Account holdings table (unit trust positions) — **do not import as transactions**
- These ARE imported into `asset_valuations` automatically on each statement import
- Fields to capture per fund: `fund_name`, `free_qty`, `total_cost_sgd`, `market_value_sgd`, `unrealised_pnl`, `valuation_date` = statement date

---

## Validation Checks

Per account block:
1. Opening balance (`Balance Brought Forward`) + Deposits − Withdrawals = Closing balance (`Balance Carried Forward`)
2. Tolerance: ±0.01 SGD for rounding
3. If validation fails → exception queue

---

## Known Merchant / Counterparty Patterns

| Raw Description | Normalised | Category Hint |
|---|---|---|
| `TOP-UP TO PAYLAH! : 91112176` | PayLah Top-up | Wallet Top-up (Transfer) |
| `Funds Transfer / I-BANK` | Internal Bank Transfer | Transfer |
| `FAST Payment / Receipt / FROM: RATHINASABABATHI RATHIKA` | Rathika (family) | Transfer / Advance |
| `FAST Payment / Receipt / INCOMING PAYNOW REF...` | PayNow Receipt | Transfer In |
| `Cash Deposit Machine` | Cash Deposit | Transfer In |
| `FAST Payment / Receipt / MARI:...` | MariBank Transfer | Internal Transfer |

---

## Edge Cases

- **Multi-page accounts:** A single account's transactions may span multiple pages. The account header appears once; subsequent pages continue without re-printing the header.
- **Balance Carried Forward / Brought Forward:** These are always in bold. Do not treat as transactions.
- **USD sub-account:** `DBS eMulti-Currency` account balance includes both SGD and USD. The account summary shows both. Import USD transactions separately with correct currency code.
- **17-page statement:** DBS Consolidated is large (17 pages in sample). Parser must handle full document, not stop at first few pages.
- **SRS investments:** Unit trust holdings shown in SRS section — these are asset records, not cash transactions. Route to `asset_valuations` table.

---

## Questions for Vivek

- [x] **Q1 (RESOLVED):** Angappan Saravanan is a friend and advance counterparty. Flag all transfers to/from him for Advances agent.
- [x] **Q2 (RESOLVED):** Rathika is a friend and advance counterparty. Flag all transfers to/from her for Advances agent.
- [x] **Q3 (RESOLVED):** USD account — use the FX rate shown in the DBS statement itself. Sometimes USD is sent directly to target accounts to avoid forex fees; store original USD amount and rate from statement. Do not force-convert at a user-provided rate for this account.
- [x] **Q4 (RESOLVED):** SRS unit trust holdings (FRK India, FRK Tech, FTIF-China, Nikko Japan) — auto-update `asset_valuations` on every DBS Consolidated Statement import. Use Market Value (SGD) column from the SRS section.

---

## Historical Import Notes

- This profile applies to **all historical statements** from this institution, not just current ones
- Statement format may have changed over time — flag any parsing anomalies to the exceptions queue rather than failing silently
- For historical data, the statement period dates determine the correct year for all date inference
- Closed accounts (e.g., OCBC BT-9334) retain full transaction history — `account_status = closed` but records are never deleted
- Duplicate prevention: `txn_hash` uniqueness enforced across all time periods — re-importing historical statements is safe and idempotent
