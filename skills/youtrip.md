# YouTrip — Parsing Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | YouTrip |
| Institution Code | `youtrip` |
| Account Type | `digital_wallet` |
| Currency | SGD (statement currency) |
| Country | SG |
| Statement Format | PDF (image-only) |
| Statement Title | "My SGD Statement" |
| Statement Format Note | Also available in other currencies (MYR, etc.) — this profile covers SGD statement |

---

## File Structure

- Image-only PDF, all pages are JPEGs
- Pages contain a single continuous transaction table with running balance
- Statement header on page 1 only
- Page count variable (sample: 7 pages)

---

## Page Layout

### Page 1 Header
```
My SGD Statement
DD Mon YYYY to DD Mon YYYY

VIVEK PALANISAMY
Y-<account_id_1>
Y-<account_id_2>
Issued on DD Mon YYYY, HH:MM AM/PM (SGT)
```

Two account IDs listed (e.g., `Y-8165564547`, `Y-8128929544`) — likely primary wallet + secondary wallet or card reference.

### Transaction Table (All Pages)
```
Completed Date²    Description    Money Out    Money In    Balance
(in SGT)
```

---

## Column Structure

| Column | Description |
|---|---|
| `Completed Date (in SGT)` | Full datetime: `DD Mon YYYY\nH:MM AM/PM` |
| `Description` | Transaction name, possibly multi-line with FX sub-line |
| `Money Out` | Debit amount in SGD (positive, prefixed with `$`) |
| `Money In` | Credit amount in SGD (positive, prefixed with `$`) |
| `Balance` | Running balance in SGD (prefixed with `$`) |

---

## Date & Time Parsing

- Format: `DD Mon YYYY` on line 1, `H:MM AM/PM` on line 2
- Example: `11 Sep 2025` + `8:43 PM`
- Full year always present — no year inference needed
- Timezone: SGT (UTC+8)
- Store full datetime in `transaction_datetime`; use date portion for `transaction_date`

### Bold Date Rows
Some rows have **bold** date fields (e.g., `11 Sep 2025` in bold) — these indicate the first transaction on a given day. Still a regular transaction row, not a header. Parse normally.

---

## Transaction Type Detection

| Description Pattern | `txn_type` | Notes |
|---|---|---|
| `Top up` | `wallet_topup` | Money In — Transfer type |
| `SmartExchange™ / $X SGD to RMXX MYR` | `fx_exchange` | Currency exchange — see below |
| `SmartExchange™ / RMX MYR to $X SGD` | `fx_exchange` | Reverse exchange |
| `Opening Balance` | skip | Balance marker, not a transaction |
| Merchant purchases | `purchase` | Standard spend |

### SmartExchange™ — FX Transactions
YouTrip's currency exchange is called SmartExchange™. It appears as a transfer between currency wallets.

Row format:
```
SmartExchange™
$1.83 SGD to RM6.00 MYR
FX rate: $1 SGD = RM3.27869 MYR
```

Fields to extract:
- `sgd_amount` — from `Money Out` column (SGD debit)
- `foreign_amount` — from description line 2 (e.g., `RM6.00 MYR`)
- `foreign_currency` — `MYR`, `USD`, etc.
- `fx_rate` — from line 3 (e.g., `3.27869`)
- `txn_type = fx_exchange` — Transfer type, excluded from spending reports

Reverse SmartExchange (MYR → SGD): appears as Money In. Same extraction logic, directions reversed.

---

## Running Balance

Every row has a `Balance` column. Use this to:
1. Validate transaction sequence: previous_balance ± this_transaction = current_balance
2. Detect any gaps or missing transactions

---

## Statement Metadata Extraction

```
Statement period  → period_start, period_end (from header)
Account IDs       → youtrip_account_ids (Y-XXXXXXXXXX format)
Issued date       → issued_datetime (with time)
Opening Balance   → opening_balance (first row of table)
Closing Balance   → last balance value in table
```

---

## Multi-Currency Wallet Context

YouTrip holds multiple currency wallets (SGD, MYR, USD, etc.). The SGD Statement shows only SGD wallet activity. SmartExchange represents movement between wallets.

For Wealth House purposes:
- SGD wallet transactions → `statement_transactions` with `currency = SGD`
- SmartExchange → `txn_type = fx_exchange`, both sides logged
- Non-SGD wallet activity → separate statement file (e.g., MYR Statement, if available)

---

## Known Transaction Patterns

| Description | Normalised | Category Hint |
|---|---|---|
| `Top up` | YouTrip Top-up | Wallet Top-up (Transfer) |
| `SmartExchange™` | YouTrip FX | FX Exchange (Transfer) |
| `Opening Balance` | — | Skip |

> YouTrip is primarily used for travel FX. Most spend will appear in foreign currency wallet statements. The SGD statement mainly shows top-ups and SmartExchange entries.

---

## Validation Checks

1. Opening Balance + sum(Money In) − sum(Money Out) = Closing Balance (last balance row)
2. Each row: previous_balance + Money_In − Money_Out = current_balance (running validation)
3. FX rates: sgd_amount × fx_rate ≈ foreign_amount (tolerance ±0.02)

---

## Edge Cases

- **Footnote markers:** Description column uses `¹` and `²` superscripts in headers (e.g., `Transactions¹`, `Completed Date²`). These are footnote references — strip from parsed text.
- **Bold date rows:** First transaction of each day has bold date — no special treatment needed.
- **Partial exchange reversal:** If SmartExchange SGD→MYR is immediately followed by SmartExchange MYR→SGD for similar amount (sample shows this pattern on 12 Sep), this may indicate a failed or cancelled exchange. Flag for review if round-trip within 1 hour.
- **Multiple account IDs:** Two Y-IDs in header — unclear if these are two separate wallets or a card + wallet pair. Parser should store both.
- **7-page statement for 5-day period:** This particular sample covers only 5 days (11–15 Sep) with 7 pages, suggesting high transaction volume. Parser must handle full pagination.

---

## Questions for Vivek

- [x] **Q1 (RESOLVED):** One YouTrip account with multiple currency wallets. Treat as single account (`youtrip`). The two Y-IDs are wallet/card references within the same account — do not split.
- [ ] **Q2:** The back-to-back SmartExchange (SGD→MYR then MYR→SGD on 12 Sep) — was this intentional or an error? Should we auto-detect and flag such patterns?
- [ ] **Q3:** Do you also have YouTrip statements in MYR or other currencies that should be imported? If yes, should foreign currency spend be converted to SGD at the statement's FX rate, or tracked natively?

---

## Historical Import Notes

- This profile applies to **all historical statements** from this institution, not just current ones
- Statement format may have changed over time — flag any parsing anomalies to the exceptions queue rather than failing silently
- For historical data, the statement period dates determine the correct year for all date inference
- Closed accounts (e.g., OCBC BT-9334) retain full transaction history — `account_status = closed` but records are never deleted
- Duplicate prevention: `txn_hash` uniqueness enforced across all time periods — re-importing historical statements is safe and idempotent
