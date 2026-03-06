# UOB KrisFlyer Credit Card — Parsing Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | United Overseas Bank Limited |
| Institution Code | `uob_cc` |
| Account Type | `credit_card` |
| Currency | SGD |
| Country | SG |
| Statement Format | PDF (ZIP/JPEG + TXT — TXT is primary) |
| Statement Title | "Credit Card(s) Statement" |
| Card Number | 5401-9180-1054-9282 |
| Card Product | KrisFlyer UOB Credit Card |
| Credit Limit | SGD 2,000 |
| Co. Reg. No. | 193500026Z |
| GST Reg | MR-8500194-3 |

---

## File Structure

ZIP archive with TXT + JPEG pages.
- `1.txt` → Page 1: Header, statement summary, start of transactions (PRIMARY)
- `2.txt`, `3.txt` etc. → Continuation pages with more transactions
- Pages 2+ TXT files also contain T&C footer text — parse until `End of Transaction Details` marker

---

## TXT Structure (Page 1)

```
Contact Us
Call 1800 222 2121 (Within Singapore)
...

Statement Summary
Statement Date    DD MON YYYY
Total Credit Limit    SGD <limit>
[Payment Summary section — only if balance due]
Amount to Pay    SGD <amount>
Minimum Payment  SGD <amount>
Due Date         DD MON YYYY

MR VIVEK PALANISAMY
...

Credit Card(s) Statement
KRISFLYER UOB CREDIT CARD
<card_number> VIVEK

Post    Trans
Date    Date    Description of Transaction    Transaction Amount SGD

PREVIOUS BALANCE    <amount> [CR if credit balance]
SUB TOTAL    <amount>
TOTAL BALANCE FOR KRISFLYER UOB CREDIT CARD    <amount>
 ---- End of Transaction Details ----
```

---

## Column Structure

| Column | Format | Notes |
|---|---|---|
| `Post Date` | `DD MON` (e.g., `06 MAY`, `13 MAY`) | Use for `transaction_date` |
| `Trans Date` | `DD MON` | Original transaction date |
| `Description of Transaction` | Multi-line: line 1 = description, line 2 = `Ref No.: <ref>` | |
| `Transaction Amount SGD` | Positive = debit; `<amount> CR` = credit | |

---

## Date Parsing

- Format: `DD MON` (e.g., `06 MAY`, `13 MAY`)
- Year inferred from `Statement Date: DD MON YYYY` in header
- **Year rollover:** If post date month > statement month, belongs to prior year

---

## Reference Numbers

UOB includes `Ref No.: <18-digit>` on line 2 of every transaction description. Store as `reference`.

---

## Transaction Type Detection

| Description Pattern | `txn_type` | Notes |
|---|---|---|
| `PREVIOUS BALANCE` | skip | Opening balance |
| `SUB TOTAL` | skip | Subtotal row |
| `TOTAL BALANCE FOR KRISFLYER UOB CREDIT CARD` | skip | Card total |
| `---- End of Transaction Details ----` | stop | End of transaction section |
| `PAYMENT` / `PAYMENT BY INTERNET` | `credit_card_payment` | Transfer type |
| Amount suffixed `CR` | credit direction | Payment or refund |
| All other | `purchase` | Standard debit |

---

## Statement Metadata Extraction

```
Statement date      → statement_date
Credit limit        → credit_limit (SGD 2,000)
Amount to pay       → total_due
Minimum payment     → minimum_payment
Due date            → payment_due_date
Card number         → 5401-9180-1054-9282
Card product        → KrisFlyer UOB Credit Card
Previous balance    → opening_balance
Total balance       → closing_balance
```

---

## Rewards: KrisFlyer Miles

UOB KrisFlyer card earns KrisFlyer miles. The rewards summary appears at the end of the statement:
```
KF Miles (KF UOB Credit Card)   <card_number>   <prev> + <earned> - <used> + <adj> = <current>
KF Miles (KF UOB Account)       <card_number>   ...
```

Do **not** import miles as transactions. Skip entirely.

---

## Known Merchant Patterns

| Raw Description | Normalised Merchant | Category Hint |
|---|---|---|
| `SHENGSIONG@338ANCHORVALE SINGAPORE` | Sheng Siong (Anchorvale) | Groceries |
| `BUS/MRT <ref> SINGAPORE` | SimplyGo | Public Transport |
| `ATLASVENDING Singapore` | Atlas Vending | Other |
| `CHENNAI TRADING & SUP Singapore` | Chennai Trading | Groceries / Eating Out |

---

## Credit Balance Handling

In Feb 2026, statement shows:
```
PREVIOUS BALANCE    1.78 CR
SUB TOTAL           1.78 CR
TOTAL BALANCE       1.78 CR
```
Amount to Pay = SGD 0 (no payment needed as credit balance).

A `CR` suffix on the previous balance means the account is in credit (overpaid). Handle as negative opening balance. Subsequent purchases offset the credit.

---

## T&C and Rewards Pages

Pages after `---- End of Transaction Details ----` contain:
- Rewards summary table
- Cardmembers agreement text
- UOB TMRW app promotions
- Bilingual notices

Skip all of this content.

---

## Validation Checks

1. Previous Balance + Purchases − Payments = Total Balance
2. Handle CR prefix on amounts as negative values before summing

---

## Edge Cases

- **`CR` balance:** Both opening and closing balances can be `CR` (credit). Always check for `CR` suffix on any amount.
- **`Amount to Pay` absent:** When balance is `CR` or zero, the Payment Summary section in the header is not printed. Parser must handle missing payment section gracefully.
- **Low credit limit SGD 2,000:** This is a supplementary or starter card. Large transactions would be unusual.
- **Ref No. always present:** Every UOB transaction has a `Ref No.` — this is reliable and useful for deduplication.
- **Bilingual T&C:** Statement contains Chinese text after the English notice. Parser should not fail on encountering CJK characters.

---

## Historical Import Notes

- Two samples: May 2025 (`eStatement_may_2025`) and Feb 2026 (`eStatement`)
- Format consistent across both
- TXT extraction reliable for all transaction data
- Idempotency guaranteed by `txn_hash`
