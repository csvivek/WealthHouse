# Trust Bank Credit Card — Parsing Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | Trust Bank Singapore Limited |
| Institution Code | `trust_bank` |
| Account Type | `credit_card` |
| Currency | SGD |
| Country | SG |
| Statement Format | PDF (images + embedded TXT) |
| GST Reg | 202039712G |

---

## ⚠️ FORMAT VERSION HISTORY

| Period | Format | Detection |
|---|---|---|
| Up to ~Feb 2025 | ZIP archive containing JPEG images + 1.txt summary | `file` returns "Zip archive data" |
| Feb 2025 onwards | **Native text PDF** (single file, fully text-extractable) | `file` returns "PDF document" |

**Both formats exist in the historical archive. The parser must handle both.**

Detection logic:
```python
if is_zip(filepath):
    pages = extract_zip_pages(filepath)   # JPEG + TXT path
else:
    pages = extract_pdf_text_pages(filepath)  # pdfplumber path
```

The transaction content and column structure are **identical** between both formats — only the file wrapper differs.


---

## File Structure

The PDF is a ZIP-wrapped archive containing:
- `1.txt` — Page 1 summary text (machine-readable)
- `1.jpeg`, `2.jpeg`, `3.jpeg` — Page images (OCR or vision required for transactions)

> **Note:** Page 1 TXT contains header metadata only (balances, due dates). Transaction data is on pages 2–3 as images only. The parser must use vision/OCR on the JPEG pages for transaction extraction.

---

## Page Layout

### Page 1 (Summary — from TXT)
Contains:
- Statement cycle dates (`Statement cycle DD Mon YYYY - DD Mon YYYY`)
- Statement balance
- Minimum amount due
- Payment due date
- Approved credit limit
- Activity summary table: Previous balance, Purchases, Cash advance, Interest/Fees, Repayments/Credits, Current outstanding balance

### Pages 2–N (Transaction Details — from JPEG)
Section header: **TRANSACTION DETAILS**

Columns:
| Column | Description |
|---|---|
| `Posting date` | Transaction posting date, format `DD Mon` (e.g., `08 Apr`) — no year on row, year inferred from statement cycle |
| `Description` | Merchant name or transaction description |
| `Amount in FCY` | Foreign currency amount + currency code (e.g., `1.98 USD`) — only present for FCY transactions |
| `Amount in SGD` | SGD amount — always present |

Last row of last page:
- Bold row: `DD Mon | Total outstanding balance | <amount>` — this is a summary row, **not a transaction**, skip it.

First row:
- Bold row: `DD Mon | Previous balance | <amount>` — opening balance marker, **not a transaction**, skip it.

---

## Transaction Type Detection

| Description Pattern | `txn_type` | Notes |
|---|---|---|
| `Credit Payment from Trust savings account` | `credit_card_payment` | Transfer type — exclude from spending |
| `Purchase interest charged` | `bank_charge` | Fee/interest |
| Any other row | `purchase` | Standard debit |

### Debit vs Credit
- All amounts in `Amount in SGD` are **positive absolute values**
- Credits (payments) are visually displayed in **green** with a `+` prefix (e.g., `+133.00`, `+2,000.00`)
- Debits (purchases) have **no prefix**, plain number
- Parser rule: if amount has `+` prefix → `txn_type = credit_card_payment`, credit direction

---

## Date Parsing

- Row date format: `DD Mon` (e.g., `08 Apr`, `03 May`)
- No year on individual rows — infer from statement cycle
- **Year rollover rule:** If posting date month is earlier than statement start month, it belongs to next year. Example: statement cycle `6 Apr – 5 May`, a row dated `03 May` is in the same year; a row dated `06 Apr` is the cycle start.
- Statement cycle is always printed as `DD Mon YYYY – DD Mon YYYY` on page 1.

---

## FCY (Foreign Currency) Transactions

When `Amount in FCY` column is populated:
- Format: `<amount> <currency_code>` (e.g., `1.98 USD`)
- Additional sub-line under description shows FX rate: `1 USD = 1.3333 SGD`
- Store: `original_amount`, `original_currency`, `fx_rate` alongside SGD amount
- The `Amount in SGD` column always holds the converted SGD amount — use this as the canonical `amount`

---

## Statement Metadata Extraction (from Page 1 TXT)

```
Statement cycle       → statement_period_start, statement_period_end
Statement balance     → closing_balance
Minimum amount due    → minimum_payment
Payment due date      → payment_due_date
Approved credit limit → credit_limit
```

---

## Known Merchant Patterns

| Raw Description | Normalised Merchant | Category Hint |
|---|---|---|
| `TADA 019617950A20 +6568177177 SG` | TADA | Ride Hailing |
| `GOPAY-GOJEK` | Gojek | Ride Hailing |
| `BUS/MRT <ref>` | SimplyGo | Public Transport |
| `MILAAP USA +18778295500 US` | Milaap | Gifts & Charity |
| `WHITECOAT HOLDINGS PTE LT...` | WhiteCoat | Healthcare |
| `NAME-CHEAP.COM* ...` | Namecheap | Subscriptions |
| `Credit Payment from Trust savings account` | — | Transfer (skip) |
| `Purchase interest charged` | — | Bank Charges |
| `Immigration & Checkpoints Authority` | ICA | Advances Given (Vivek pays visa fees for others who repay him — flag for Advances agent) |
| `EIGHT TELECOM +6588808888 SG` | Eight Telecom | Subscriptions |
| `MyRepublic` | MyRepublic | Subscriptions |
| `bluesg` | BlueSG | Ride Hailing / Transport |
| `FairPrice` | FairPrice | Groceries |
| `Toast Box` | Toast Box | Eating Out |
| `Sheng Siong` | Sheng Siong | Groceries |
| `Starbucks` | Starbucks | Eating Out |
| `Cabcharge` | Cabcharge | Ride Hailing |
| `Aliexpress` | AliExpress | Shopping |
| `Grab` | Grab | Ride Hailing / Eating Out |
| `Popular` | Popular | Shopping / Education |
| `Zero1` | Zero1 | Subscriptions |

---

## Multi-Card Handling

Trust CC statement covers a single card per PDF. No multi-card grouping needed (unlike DBS CC which groups multiple cards in one statement).

---

## Validation Checks

After parsing, verify:
1. Sum of all purchase rows − sum of all credit rows ≈ `statement_balance` from page 1
2. Previous balance row value matches prior statement's closing balance (if available)
3. FCY rows: `original_amount × fx_rate ≈ sgd_amount` (tolerance ±0.02)

---

## Edge Cases

- **Interest charges:** `Purchase interest charged` appears as a debit row. Categorise as `Bank Charges`.
- **Partial month:** Statement cycle may span two calendar months (e.g., Apr 6 – May 5). Year inference must handle this.
- **Large Grab transaction:** Grab amount of SGD 1,210 seen in sample — likely a Grab rental/hire. Flag for human review if Grab > SGD 200.
- **Missing FCY line:** Some FCY transactions may not show the FX sub-line in OCR — treat missing FX rate as null; record original_currency from description if parseable.

---

## Questions for Vivek

- [ ] **Q1:** The `Grab` transaction for SGD 1,210 — is this a regular occurrence (e.g., Grab rental)? Should we split Grab into Ride Hailing vs Other or always map to a fixed category?
- [ ] **Q2:** `MILAAP USA` — is this always charity/donations, or can it be other things?
- [x] **Q3 (RESOLVED):** ICA transactions are visa fees paid on behalf of others who repay Vivek. Classify as `Advances Given`. Flag for Advances agent with ICA as the merchant context.

---

## Historical Import Notes

- This profile applies to **all historical statements** from this institution, not just current ones
- Statement format may have changed over time — flag any parsing anomalies to the exceptions queue rather than failing silently
- For historical data, the statement period dates determine the correct year for all date inference
- Closed accounts (e.g., OCBC BT-9334) retain full transaction history — `account_status = closed` but records are never deleted
- Duplicate prevention: `txn_hash` uniqueness enforced across all time periods — re-importing historical statements is safe and idempotent
