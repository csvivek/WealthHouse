# DBS Credit Cards — Parsing Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | DBS Bank Ltd |
| Institution Code | `dbs_cc` |
| Account Type | `credit_card` |
| Currency | SGD |
| Country | SG |
| Statement Format | PDF (image-only, no embedded text) |
| Statement Title | "Credit Cards — Statement of Account" |
| Co. Reg. No. | 196800306E |
| GST Reg | MR-8500180-3 |

---

## Critical Structural Feature: Multi-Card Statement

A single DBS CC PDF covers **multiple cards** belonging to the same customer. Each card has its own section. The parser must correctly attribute each transaction to the right card.

### Card Section Header Format
```
DBS YUU AMERICAN EXPRESS CARD NO.: 3779 111725 03891
DBS YUU VISA CARD NO.: 4119 1100 0437 6684
```
Pattern: `DBS <product_name> CARD NO.: <masked_number>`

- Extract card number from header to determine which `card` record to attach transactions to
- Card sections are separated by whitespace/section dividers
- Each card section has its own PREVIOUS BALANCE, payment row, and NEW TRANSACTIONS block

### Within Each Card Section
```
PREVIOUS BALANCE                    <amount>
<date>  PAYMENT - DBS INTERNET/WIRELESS
        REF NO: <ref>               <amount> CR

NEW TRANSACTIONS <cardholder_name>
<date>  <DESCRIPTION>               <amount>
...
                        SUB-TOTAL:  <amount>
                        TOTAL:      <amount>
```

---

## Page Layout

### Page 1
- Statement header: customer name, address, statement date, credit limit, minimum payment, payment due date
- One or more card sections (see above)
- May continue onto page 2

### Page 2
- Continuation of card transactions
- **GRAND TOTAL FOR ALL CARD ACCOUNTS:** `<amount>` — summary row, not a transaction
- DBS Points Summary table — skip entirely

### Page 3 (if present)
- More card sections or continuation

---

## Column Structure

| Column | Position | Description |
|---|---|---|
| Date | Left | `DD MON` format (e.g., `21 FEB`, `02 MAR`) |
| Description | Centre | Merchant name or transaction description |
| Amount | Right | Positive number; credits suffixed with ` CR` |

No FCY column visible in DBS CC statements. Foreign currency transactions may be embedded in description or shown as a note (needs further sample verification).

---

## Transaction Type Detection

| Pattern | `txn_type` | Notes |
|---|---|---|
| `PAYMENT - DBS INTERNET/WIRELESS` | `credit_card_payment` | Transfer — exclude from spending |
| `PAYMENT - ...` (any payment description) | `credit_card_payment` | |
| Amount suffixed with `CR` | credit direction | Always a payment or refund |
| `PREVIOUS BALANCE` row | skip | Opening balance marker |
| `SUB-TOTAL:` row | skip | Section subtotal |
| `TOTAL:` row | skip | Card total |
| `GRAND TOTAL FOR ALL CARD ACCOUNTS:` | skip | Statement total |
| All other rows | `purchase` | Standard debit |

---

## Date Parsing

- Format: `DD MON` (e.g., `21 FEB`, `02 MAR`)
- Year inferred from statement date (top of page 1): `Statement date: 23 Mar 2025`
- **Year rollover rule:** Dates earlier than statement start belong to previous month — since DBS CC cycles monthly, any `FEB` date in a `MAR` statement is still the same year.
- Statement period is not explicitly printed as a date range — infer from statement date (statement covers ~1 month prior).

---

## Statement Metadata Extraction

From page 1 header block:
```
STATEMENT DATE      → statement_date (e.g., 23 Mar 2025)
CREDIT LIMIT        → credit_limit  
MINIMUM PAYMENT     → minimum_payment
PAYMENT DUE DATE    → payment_due_date
```

From card sections:
```
Card section header → card_number (masked)
NEW TRANSACTIONS <name> → cardholder_name
PREVIOUS BALANCE    → opening_balance per card
TOTAL:              → closing_balance per card
GRAND TOTAL         → statement_total
```

---

## Known Merchant Patterns

| Raw Description | Normalised Merchant | Category Hint |
|---|---|---|
| `GOPAY-GOJEK` | Gojek | Ride Hailing |
| `BUS/MRT <ref>` | SimplyGo | Public Transport |
| `SP DIGITAL PTE LTD` | SP Group | Utilities / Household |
| `CIRCLES.LIFE` | Circles.Life | Subscriptions |
| `YA KUN ANCHORVALE VILL` | Ya Kun | Eating Out |
| `TOAST BOX - WWP` | Toast Box | Eating Out |
| `SHOPBACK OLD CHANG KEE` | Old Chang Kee (via ShopBack) | Eating Out |
| `1855 THE BOTTLE SHOP-D` | The Bottle Shop | Eating Out / Shopping |
| `PAYMENT - DBS INTERNET/WIRELESS` | — | Transfer (skip) |

---

## Multi-Cardholder Handling

The `NEW TRANSACTIONS <name>` line identifies the cardholder for the following transaction block:
- `NEW TRANSACTIONS VIKI` — supplementary card
- `NEW TRANSACTIONS VIVEK PALANISAMY` — primary cardholder

> **Question for Vivek — see Q1 below.**

---

## Validation Checks

After parsing:
1. Per card: Previous Balance − Payment + Sum(purchases) = TOTAL per card
2. Sum of all card TOTALs = GRAND TOTAL FOR ALL CARD ACCOUNTS
3. Cross-check card numbers extracted against known cards registered in `cards` table

---

## Edge Cases

- **Multiple cards per statement:** Always check for multiple `CARD NO.:` headers — do not assume single card.
- **VIKI = Vivek:** `NEW TRANSACTIONS VIKI` is Vivek's nickname — do not create a separate member record. Attribute to Vivek's primary record.
- **`CR` suffix:** Always means credit/payment, strip the ` CR` suffix before storing amount.
- **Ref lines:** Payment rows have a second line `REF NO: MB162539860589K48` — this is a reference number, not a separate transaction. Concatenate to description or store as `reference`.
- **DBS Points table:** Last page contains points summary — completely skip this section.

---

## Questions for Vivek

- [x] **Q1 (RESOLVED):** Viki = Vivek's nickname. All transactions attributed to Vivek's primary member record.
- [x] **Q2 (RESOLVED):** Each card (Amex + Visa) treated as individual card records.
- [ ] **Q3:** Foreign currency transactions — have you seen FCY amounts on your DBS CC statement? If yes, is the format similar to Trust Bank (separate FCY column) or embedded in the description?

---

## Historical Import Notes

- This profile applies to **all historical statements** from this institution, not just current ones
- Statement format may have changed over time — flag any parsing anomalies to the exceptions queue rather than failing silently
- For historical data, the statement period dates determine the correct year for all date inference
- Closed accounts (e.g., OCBC BT-9334) retain full transaction history — `account_status = closed` but records are never deleted
- Duplicate prevention: `txn_hash` uniqueness enforced across all time periods — re-importing historical statements is safe and idempotent
