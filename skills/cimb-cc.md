# CIMB World Mastercard — Parsing Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | CIMB Bank Berhad (Singapore Branch) |
| Institution Code | `cimb_cc` |
| Account Type | `credit_card` |
| Currency | SGD |
| Country | SG |
| Statement Format | PDF (ZIP/JPEG + TXT — TXT is primary) |
| Card Number | 5452-3400-0104-7291 |
| Statement Title | "eStatement" |
| Credit Limit | SGD 20,000 |

---

## File Structure

ZIP archive containing TXT + JPEG for each page. TXT files have complete transaction data.

- `1.txt` — Page 1: Statement summary + start of transactions (PRIMARY)
- `2.txt`, `3.txt` — Continuation pages with more transactions
- JPEG files — Visual fallback

---

## TXT Structure (Page 1)

```
<reference_number>
VIVEK PALANISAMY
11 ANCHORVALE CRESCENT
#16-02
SINGAPORE 544649

SUMMARY OF ACCOUNTS
Statement Date    Credit Limit    Minimum Payment    Payment Due Date
DD Mon YYYY       S$<limit>       S$<min>            DD Mon YYYY

Post    Transaction
Date    Date          Description of Transaction    Transaction Amount (S$)

CIMB WORLD MASTERCARD 5452-3400-0104-7291 VIVEK PALANISAMY
PREVIOUS BALANCE    <amount>
DD/MM  DD/MM  <DESCRIPTION>  <amount>
...
Continued On Next Page
```

---

## Column Structure

| Column | Format | Notes |
|---|---|---|
| `Post Date` | `DD/MM` | Posting date — use for `transaction_date` |
| `Transaction Date` | `DD/MM` | Original transaction date |
| `Description of Transaction` | Single line (occasionally long) | Merchant + city + country |
| `Transaction Amount (S$)` | Positive = debit; negative in parentheses = credit | |

---

## Date Parsing

- Format: `DD/MM` (e.g., `06/01`, `11/01`, `16/01`)
- **No year on transaction rows** — infer from statement date
- Statement date format: `DD Mon YYYY` (e.g., `04 Feb 2026`)
- **Year rollover:** If post date month > statement month, it belongs to prior year

---

## Amount Format

- Positive number: debit (purchase)
- Parenthesised `(amount)`: credit (payment or refund/cashback)
- `CASHBACK` entries: negative amount = credit to account

---

## Transaction Type Detection

| Description Pattern | `txn_type` | Notes |
|---|---|---|
| `PREVIOUS BALANCE` | skip | Opening balance |
| `PAYMENT - THANK YOU! (AXS)` | `credit_card_payment` | Payment via AXS |
| `PAYMENT - THANK YOU! (IPAYMENT)` | `credit_card_payment` | Internet payment |
| `PAYMENT - THANK YOU! (...)` | `credit_card_payment` | Any payment pattern |
| `CASHBACK` | `cashback` | Credit type; store as income/rebate |
| `GRAND TOTAL` | skip | Summary row |
| All other | `purchase` | Standard spend |

---

## Statement Metadata Extraction

```
Reference number    → statement_ref (e.g., 17084, 17286, 14944)
Statement date      → statement_date
Credit limit        → credit_limit (SGD 20,000)
Minimum payment     → minimum_payment
Payment due date    → payment_due_date
Previous balance    → opening_balance
Grand Total         → closing_balance
```

---

## Known Merchant Patterns

| Raw Description | Normalised Merchant | Category Hint |
|---|---|---|
| `AXS PTE LTD SINGAPORE SG` | AXS | Bill Payment (transfer-adjacent) |
| `AIR INDIA EXPRESS LIM MUMBAI IN` | Air India Express | Travel |
| `ALIEXPRESS SINGAPORE SG` | AliExpress | Shopping |
| `BUS/MRT <ref> SINGAPORE SG` | SimplyGo | Public Transport |
| `SMU SINGAPORE SG` | Singapore Management University | Education |
| `ISLAND FAMILY CLINIC A SINGAPORE SG` | Island Family Clinic | Healthcare |
| `MUSTAFA S PTE LTD SINGAPORE SG` | Mustafa Centre | Shopping |
| `CASHBACK` | CIMB Cashback | Cashback (Credit) |

### AXS Payments — Special Handling
CIMB shows large AXS payments (e.g., SGD 1,908, SGD 636 in Feb 2026). AXS is a bill payment kiosk/platform. These could be:
- Property tax payments
- SP Group utility bills
- HDB conservancy fees
- Insurance premiums

Classify as `bill_payment` by default; flag for categorization agent.

### Large Education Transaction
`SMU SINGAPORE SG` SGD 16,000 (Feb 2026) — Singapore Management University. Classify as `Education`.

---

## Cashback Handling

CIMB World Mastercard earns cashback credited back to the account. Cashback rows appear as:
```
DD/MM  DD/MM  CASHBACK    (8.74)
```
- Store as `txn_type = cashback`, direction = credit
- Category = `Refunds` or create dedicated `Cashback` sub-category

---

## Validation Checks

1. Previous Balance + Purchases − Payments − Cashback = Grand Total
2. Grand Total = Total Outstanding Balance

---

## Edge Cases

- **`Continued On Next Page`:** Text at bottom of each page — skip, not a transaction.
- **Multi-page statements:** Sep 2025 = 3 pages, Feb/Mar 2026 = 3 pages. Transactions continue across pages without column header re-print.
- **Foreign transactions:** `AIR INDIA EXPRESS LIM MUMBAI IN` — country code `IN` = India. No FCY column visible in these statements. The amount in `Transaction Amount (S$)` is already converted to SGD by CIMB. Original FCY amount not shown — cannot recover without separate advice notice.
- **PREVIOUS BALANCE shown as negative** (`(50.27)` in Sep 2025) — this is a credit balance (overpaid). Parse as negative opening balance; subsequent purchases reduce this credit before becoming a debit balance.
- **Reference number in page 1:** Numbers like `14944`, `17084`, `17286` at the top of page 1 are CIMB internal statement reference numbers — store as `statement_ref`.

---

## Historical Import Notes

- Three months of data: Sep 2025, Feb 2026, Mar 2026
- Format consistent across all samples
- TXT extraction reliable for all transaction data
- Idempotency guaranteed by `txn_hash`
