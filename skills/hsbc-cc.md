# HSBC Visa Revolution Credit Card — Parsing Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | HSBC Bank (Singapore) Limited |
| Institution Code | `hsbc_cc` |
| Account Type | `credit_card` |
| Currency | SGD |
| Country | SG |
| Statement Format | PDF (ZIP/JPEG, with embedded TXT on some pages) |
| Statement Title | "HSBC Visa Revolution" |
| Card Number | 4835-8500-1324-1873 (masked: 4835-XXXX-XXXX-1873) |
| Co. Reg. No. | 201420624K |
| GST Reg | M90372335L |

---

## File Structure

ZIP archive containing JPEG images. Text may be partially available in `.txt` files but image-only parsing is the reliable path for transactions.

Page count varies (1–3 pages observed).

---

## Page Layout

### Page 1 — Full Statement (transactions + summary on same page)

Header block:
```
HSBC VISA REVOLUTION
PALANISAMY VIVEK
4835-8500-1324-1873

Statement period    From DD MON YYYY to DD MON YYYY
Total Due           <amount>
Minimum Payment     <amount>
Payment Due Date    DD Mon YYYY
```

**Account Summary box** (right side):
```
Previous Statement Balance   <amount>
Payments & Credits           <amount>CR
Purchases & Debits           <amount>
GST Charges                  <amount>
GST Reversals                <amount>
Total Account Balance (incl GST)  <amount>
Minimum Payment              <amount>
```

**Credit Limit and Interest Rates box** (right side):
```
Credit Limit (SGD)       500.00
Cash Limit (SGD)         200.00
Available Credit (SGD)   <amount>
Annual Interest Rate — Purchase: 27.80%
Annual Interest Rate — Cash Advance: 28.50%
```

**Rewards Summary box** (right side):
```
Points Carried Forward  <n>
Points Earned           <n>
...
Total Points Available  <n>
```

Skip the rewards summary entirely — not a transaction.

### Transaction Table (same page, left side)
```
POST DATE    TRAN DATE    DESCRIPTION    AMOUNT(SGD)
```

Cardholder sub-header:
```
Vivek Palanisamy 4835-XXXX-XXXX-1873
```

---

## Column Structure

| Column | Format | Notes |
|---|---|---|
| `POST DATE` | `DD Mon` (e.g., `10 Nov`, `24 Nov`) | Posting date — use for `transaction_date` |
| `TRAN DATE` | `DD Mon` (e.g., `08 Nov`, `22 Nov`) | Transaction date — store as `transaction_date_original` |
| `DESCRIPTION` | Multi-line | Merchant name + location on line 2 (e.g., `SINGAPORE SG`) |
| `AMOUNT(SGD)` | Positive decimal; credits suffixed with `CR` | |

---

## Date Parsing

- Format: `DD Mon` (e.g., `10 Nov`, `05 Jan`)
- Year inferred from statement period header (`From DD MON YYYY to DD MON YYYY`)
- **Year rollover:** Statement period spans e.g. `07 NOV 2025 to 07 DEC 2025` — all dates within this range use the year from the period

---

## Transaction Description Format

Two lines:
- Line 1: Merchant name (e.g., `SHENG SIONG SUPERMARKE`, `SMP*WOOWFLES_SELETAR M`)
- Line 2: City + Country code (e.g., `SINGAPORE SG`, `Singapore SG`)

Concatenate both lines as full description. City/country suffix can be used for FCY detection (non-SG country = foreign currency transaction).

---

## Transaction Type Detection

| Pattern | `txn_type` | Notes |
|---|---|---|
| `DBS    Visa Direct SG` | `credit_card_payment` | Payment via DBS Visa Direct |
| `PAYMENT - ...` | `credit_card_payment` | Any payment row |
| Amount suffixed `CR` | credit direction | Payment or refund |
| `Previous Statement Balance` | skip | Opening balance row |
| `Total Due` | skip | Summary row |
| `Continued on next page` | skip | Pagination note |
| All other rows | `purchase` | Standard debit |

---

## Statement Metadata Extraction

```
Statement period      → period_start, period_end
Total Due             → closing_balance / total_due
Minimum Payment       → minimum_payment
Payment Due Date      → payment_due_date
Credit Limit          → credit_limit (SGD 500)
Available Credit      → available_credit
Previous Statement Balance → opening_balance
Payments & Credits    → total_payments (for validation)
Purchases & Debits    → total_purchases (for validation)
```

---

## Rewards Summary

Skip for transaction import. HSBC Revolution points are cosmetic. Do not import into any table.

---

## Known Merchant Patterns

| Raw Description | Normalised Merchant | Category Hint |
|---|---|---|
| `SHENG SIONG SUPERMARKE SINGAPORE SG` | Sheng Siong | Groceries |
| `SMP*WOOWFLES_SELETAR M Singapore SG` | Woowfles (Seletar Mall) | Eating Out |
| `SPL AUTO TOPUP CONC (C Singapore SG` | SimplyGo Auto Topup | Public Transport |
| `DBS Visa Direct SG` | DBS Payment | Credit Card Payment (Transfer) |

---

## HSBC Composite Statement Relationship

HSBC also issues a **Composite Statement** (see `hsbc-composite.md`) that shows a portfolio summary of all HSBC products. That statement does NOT contain individual transactions — it links to this CC statement by card number. The two are separate file types.

---

## Edge Cases

- **Name order:** HSBC prints name as `PALANISAMY VIVEK` (surname first) — normalise to `VIVEK PALANISAMY` in metadata.
- **Very low credit limit:** SGD 500 credit limit means the card is used lightly. Large transactions are unusual.
- **Large SPL AUTO TOPUP:** SGD 20 SPL Auto Topup — this is SimplyGo auto top-up. Classify as `Public Transport`, transfer-adjacent but actually a spend.
- **Page 2 continuation:** If more than 1 page, transaction table continues. No column header re-printed on page 2 — continue parsing from where page 1 left off.
- **`CR` suffix:** Always credit — strip before storing amount.

---

## Historical Import Notes

- This profile applies to all historical HSBC Revolution CC statements
- Format has been consistent across Nov 2025 and Jan 2026 samples
- Duplicate prevention: `txn_hash` uniqueness enforced across all time periods
