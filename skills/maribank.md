# MariBank — Parsing Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | MariBank |
| Institution Code | `maribank` |
| Account Type | `bank_account` + `investment` |
| Currency | SGD |
| Country | SG |
| Statement Format | PDF (image-only) |
| Statement Title | "Deposit and Investment Statement" |
| Statement Serial Format | `S/N S01-YYYYMMDD<alphanum>` |

---

## ⚠️ FORMAT VERSION HISTORY

| Period | Format | Pages |
|---|---|---|
| Jan–Feb 2025 | ZIP archive (JPEG images) | 2 pages |
| Mar 2025 onwards | **Native text PDF** (fully extractable via pdfplumber) | **8 pages** |

The newer real-PDF format is significantly richer — additional pages provide:
- Daily interest accrual table (pages 5–6)
- Explicit investment transaction details with unit prices (page 7)

**Parser must handle both formats. Detection: same as Trust Bank.**


---

## File Structure

MariBank PDF contains pages for:
1. **Account Summary** (page 1) — Savings + Investments summary
2. **Savings Transaction Details** (pages 2–N)
3. **Investment Transaction Details** (remaining pages)

All pages are image-only. OCR or vision required for all content.

---

## Section 1: Account Summary (Page 1)

### Savings Summary Table
```
SAVINGS - ACCOUNT SUMMARY
ACCOUNT: <account_number>

ACCOUNT | STARTING BALANCE (SGD) | TOTAL OUTGOING (SGD) | TOTAL INCOMING (SGD) | ENDING BALANCE (SGD)
SAVINGS | <amount>               | <amount>             | <amount>             | <amount>
```

### Investments Summary Table
```
INVESTMENTS - ACCOUNT SUMMARY
ACCOUNT: <investment_account_number>

FUND NAME | UNIT HOLDINGS | UNIT PRICE AS OF VALUATION DATE | VALUATION DATE | MARKET VALUE (SGD)
```

Use Summary page for:
- Statement period (header: `STATEMENT PERIOD: DD MON YYYY to DD MON YYYY`)
- Opening/closing balance validation
- Investment asset valuations → `asset_valuations` table

---

## Section 2: Savings Transaction Details (Pages 2–N)

### Header
```
SAVINGS - TRANSACTION DETAILS
ACCOUNT: <account_number>
```

### Column Structure
| Column | Description |
|---|---|
| `DATE` | Date of transaction |
| `TRANSACTION` | Two-line field: Line 1 = description, Line 2 = sub-type/category label |
| `OUTGOING (SGD)` | Debit amount, positive |
| `INCOMING (SGD)` | Credit amount, positive |

### Date Format
- Full date rows: `DD MON` (e.g., `01 JAN`, `20 JAN`)
- One special row: `JAN` (month only, no day) — used for interest credit. Date = last day of month or statement period end date.
- No year on rows — infer from statement period header

### Two-Line Transaction Field
Each transaction has:
- **Line 1:** Display description (e.g., `Shopee priyavivek`, `Buy - Mari Invest`, `Vivek Palanisamy`)
- **Line 2:** MariBank category label (e.g., `Shopee`, `Investment`, `FAST Transfer`, `Transfer`)

Store Line 1 as `description`, Line 2 as `sub_type`.

---

## Transaction Type Detection

| Line 1 Pattern | Line 2 Label | `txn_type` | Direction | Notes |
|---|---|---|---|---|
| `Interest` | `Interest` | `interest` | Incoming | Income |
| `Shopee priyavivek` | `Shopee` | `purchase` | Outgoing | Shopping |
| `ShopeePay priyavivek` | `Shopee` | `purchase` | Outgoing | Shopping |
| `Buy - Mari Invest` | `Investment` | `investment_purchase` | Outgoing | Transfer type |
| `Sell - Mari Invest` | `Investment` | `investment_sale` | Incoming | Transfer type |
| `Vivek Palanisamy` | `FAST Transfer` | `fast_transfer` | Either | Internal/external transfer |
| `VIVEK PALANISAMY` | `FAST Transfer / Transfer` | `internal_transfer` | Incoming | Self-transfer from DBS to MariBank |
| `Vivek Palanisamy` | `FAST Transfer for INR` | `advance_given` or `internal_transfer` | Outgoing | Sends SGD; counterparty gives INR in India. If to known advance counterparty, flag as advance. Otherwise internal transfer. |

### Transfer Direction Heuristic
MariBank uses same name (`Vivek Palanisamy`) for both sender and receiver. Use column (Outgoing vs Incoming) to determine direction — do not rely on name.

### INR Transfer Flag
`FAST Transfer for INR` in Line 2 indicates money sent for FX arrangement: Vivek sends SGD and the counterparty gives him INR in India. Treatment:
- If counterparty is a known advance counterparty (Saravanan, Rathika, etc.) → `txn_type = advance_given`
- If counterparty is self / own account → `txn_type = internal_transfer`
- Always flag for FX agent to log the implied INR/SGD rate.

---

## Section 3: Investment Transaction Details

### Header
```
INVESTMENTS - TRANSACTION DETAILS  
ACCOUNT: <investment_account_number>
```

### Transaction Types
- `Buy - Mari Invest` — purchase of Lion-MariBank SavePlus fund
- `Sell - Mari Invest` — redemption

### Investment Asset
| Fund | Details |
|---|---|
| Lion-MariBank SavePlus | Money market / cash management fund |
| Account No. | `800 020 5960 - 101` |

Investment transactions should be routed to `investment_transactions` table, not `statement_transactions`.

---

## Statement Metadata Extraction

```
Statement serial     → statement_id (e.g., S01-250201WNHWDYAF)
Statement date       → issued_date (printed in header as DD MON YYYY)
Statement period     → period_start, period_end
Savings account no.  → account_number
Investment account   → investment_account_number
Starting balance     → opening_balance
Ending balance       → closing_balance
Total outgoing       → total_debits (for validation)
Total incoming       → total_credits (for validation)
```

---

## Known Merchant / Counterparty Patterns

| Raw Description | Normalised | Category Hint |
|---|---|---|
| `Shopee priyavivek` | Shopee | Shopping |
| `ShopeePay priyavivek` | ShopeePay | Shopping |
| `Buy - Mari Invest` | MariBank Invest | Investment Purchase (Transfer) |
| `Sell - Mari Invest` | MariBank Invest | Investment Sale (Transfer) |
| `Vivek Palanisamy / FAST Transfer for INR` | Self (FX) | FX Transfer (Transfer) |
| `Vivek Palanisamy / FAST Transfer` | Self / Internal | Internal Transfer |
| `VIVEK PALANISAMY / Transfer` | Self / Incoming | Internal Transfer |
| `Interest` | MariBank Interest | Interest Income |

---

## Interest Detail Page (Pages 5–6)

```
SAVINGS - INTEREST DETAILS*
ACCOUNT: 123 443 293

DATE    PREVIOUS DAY BALANCE (SGD)    INTEREST (SGD)
01 APR  15,309.53                     1.05
02 APR  87,310.58                     5.45
...
TOTAL INTEREST CREDITED: 84.69
```

- Daily balance and interest for every day in the month
- `TOTAL INTEREST CREDITED` matches the `Interest` credit row in the transaction table
- Import the `TOTAL INTEREST CREDITED` as a single `Interest` income transaction
- Store daily detail in `interest_accrual_detail` metadata (informational, not as transactions)


---

## 8-Page PDF Structure (Mar 2025 onwards)

| Page | Content |
|---|---|
| 1 | Header, Savings Account Summary, Investments Account Summary |
| 2–5 | Savings Transaction Details (all FAST/PayNow/Shopee transactions) |
| 5 | End of savings transactions + Interest Details header |
| 5–6 | Savings Interest Details (daily balance + daily interest accrual) |
| 7 | Investments Transaction Details |
| 8 | General notices, T&C footer |


---

## Investment Transaction Detail Page (Page 7)

```
INVESTMENTS - TRANSACTION DETAILS
ACCOUNT: 800 020 5960 - 101

TRANSACTION DATE | TRADE DATE | TRANSACTION TYPE | FUND NAME | UNITS | UNIT PRICE | AMOUNT (SGD)
29 APR           | 30 APR     | BUY              | Lion-MariBank SavePlus | 14,124.29 | 1.0620 | 15,000.00
```

Fields to extract per investment transaction:
| Field | Source | Notes |
|---|---|---|
| `transaction_date` | TRANSACTION DATE column | Date order placed |
| `trade_date` | TRADE DATE column | Settlement/execution date |
| `txn_type` | TRANSACTION TYPE | `BUY` → `fund_subscription`; `SELL` → `fund_redemption` |
| `fund_name` | FUND NAME | e.g., `Lion-MariBank SavePlus` |
| `units` | UNITS column | Number of units transacted |
| `unit_price` | UNIT PRICE column | NAV price at trade |
| `amount_sgd` | AMOUNT (SGD) column | Total SGD amount |

Import into `investment_transactions`. Link to corresponding `OUTGOING` cash row in the Savings transactions section via `transaction_links`.


---

## Validation Checks

1. Opening Balance + Total Incoming − Total Outgoing = Ending Balance (from account summary)
2. Sum of Incoming column transactions = Total Incoming (±0.01)
3. Sum of Outgoing column transactions = Total Outgoing (±0.01)
4. Investment market value from summary → update `asset_valuations` for Lion-MariBank SavePlus

---

## Edge Cases

- **Month-only date:** `JAN` row with no day number (Interest row) — assign last day of the month as date, or period end date.
- **Same-name transfers:** Vivek Palanisamy appears as both sender and receiver. Direction determined purely by column (Outgoing vs Incoming).
- **`priyavivek` suffix:** Shopee transactions show `priyavivek` — this is Vivek's Shopee username. Normalise to merchant `Shopee` and strip username.
- **Investment section:** `Buy/Sell - Mari Invest` appears in both the savings transactions AND the investment transactions section. In savings section it represents the cash movement; in investment section it represents the unit purchase. Deduplicate or link via `transaction_links` table.
- **Multi-page:** Statement is 6 pages (sample). Ensure parser handles all pages without stopping.

---

## Questions for Vivek

- [x] **Q1 (RESOLVED):** INR transfers = Vivek sends SGD, counterparty gives INR in India. If to known advance counterparty, classify as `advance_given`. Otherwise `internal_transfer`. FX agent logs the implied rate.
- [x] **Q2 (RESOLVED):** `VIVEK PALANISAMY / FAST Transfer / Transfer` incoming = Vivek transferring from his own DBS account to MariBank. Classify as `internal_transfer`.
- [ ] **Q3:** Lion-MariBank SavePlus fund — auto-import to `asset_valuations` on each statement import, or manual only?

---

## Historical Import Notes

- This profile applies to **all historical statements** from this institution, not just current ones
- Statement format may have changed over time — flag any parsing anomalies to the exceptions queue rather than failing silently
- For historical data, the statement period dates determine the correct year for all date inference
- Closed accounts (e.g., OCBC BT-9334) retain full transaction history — `account_status = closed` but records are never deleted
- Duplicate prevention: `txn_hash` uniqueness enforced across all time periods — re-importing historical statements is safe and idempotent

---

## New Counterparties Identified (from Apr 2025 statement)

| Name in Statement | Identified As | Rule |
|---|---|---|
| `sarav` | Saravanan (advance counterparty) | PayNow Transfer to/from sarav → `advance_given` |
| `raj for INR` | Raj — INR exchange counterparty | FAST Transfer "raj for INR" → `advance_given` (SGD sent, INR received) |
| `Priya` | Likely Priya (spouse/family) | PayNow transfers with note "for cash" |
| `Kiran` | Unknown — small amounts | Flag for review |
| `VIVEK PALANISAMY` (ALL CAPS) | Vivek's own outgoing | `internal_transfer` or named transfer |
| `Vivek Palanisamy` (mixed case) | Incoming to MariBank from own account | `internal_transfer` |

**Direction heuristic in MariBank real PDF format:**
The text extractor merges columns. Use these rules to determine direction:
- Amount in OUTGOING position (left of INCOMING in layout): `direction = debit`
- Amount in INCOMING position: `direction = credit`
- If ambiguous: "From Vivek Palanisamy" in the description = Vivek is sending = **OUTGOING**
- Counterparty name on line before date: indicates who the transfer is with

