# OCBC EasiCredit — Parsing Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | OCBC Bank (OCBC PCL) |
| Institution Code | `ocbc_easicredit` |
| Account Type | `credit_line` (revolving overdraft / personal credit line) |
| Currency | SGD |
| Country | SG |
| Statement Format | PDF (image-only) |
| Statement Title | "EasiCredit Statement of Account" |
| Account No. | 633592357001 |

---

## What Is EasiCredit?

OCBC EasiCredit is a **revolving personal credit line** (not a credit card, not a fixed-term loan). Key characteristics:
- Has a credit limit (SGD 51,200 in statements)
- Outstanding balance accrues interest at 28% p.a. (variable)
- Minimum payment required monthly
- Balance shown with a `-` suffix (e.g., `38,644.24 -`) indicating it is **money owed** (liability)
- Vivek used it to take a **Balance Transfer** into this account (see Balance Transfer Summary section)

For Wealth House:
- Track as a **liability account** — outstanding balance is negative net worth
- Payments reduce the balance (debit = good)
- Drawings increase the balance (credit to account = bad)

---

## File Structure

- Image-only PDF (4 pages)
- Page 1: Summary header, credit limit, minimum payment, payment due date, important notices, payment slip
- Page 2: Transaction table + Balance Transfer Summary table
- Pages 3–4: Standard terms and conditions (skip entirely)

---

## Page Layout

### Page 1 Header Block
```
CREDIT LIMIT | INTEREST RATE | MINIMUM PAYMENT AMOUNT | PAYMENT DUE DATE | AVAILABLE CREDIT LIMIT
$51,200      | 28.0000% p.a. | $1,115.82              | 27 FEB 2026      | $14,005
```

Also:
```
Account No. 633592357001    31 JAN 2026    OCBC PCL
```

The date on this line (`31 JAN 2026`) is the statement date.

### Outstanding Balance Box
```
Outstanding Balance: $37,194.24
Payment Due Date: 27 FEB 2026
```

---

## Transaction Table (Page 2)

Columns:
| Column | Description |
|---|---|
| `Date` | `DD MON` format |
| `Description` | Multi-line description |
| `Cheque No.` | Usually blank |
| `Withdrawal` | Money drawn from credit line (increases liability) |
| `Deposit` | Payment made (reduces liability) |
| `Balance` | Running balance, shown with `-` suffix (e.g., `37,194.24 -`) |

### Balance Sign Convention
- Balances shown with `-` suffix = **outstanding liability** (money owed)
- All balance values are stored as **positive** in `account_balances` table; sign applied at ledger time (credit_line accounts are liabilities)
- Deposit column = reduces liability = payment received
- Withdrawal column = increases liability = credit drawn

---

## Row Types

| Row Text | Action |
|---|---|
| `BEGINNING BALANCE` | Opening balance — skip as transaction, use for validation |
| `ENDING BALANCE` | Closing balance — skip as transaction, use for validation |

---

## Transaction Type Detection

| Description Pattern | `txn_type` | Notes |
|---|---|---|
| `FUND TRANSFER / <acct_no> / FROM OWN ACCOUNT / OTHR - OTHER` | `loan_repayment` | Payment from linked savings account |
| `OD INT CHARGE` | `bank_charge` | Overdraft interest charge |
| `BALANCE TRANSFER / L3F400 001 / <ref>` | `balance_transfer_in` | Initial balance transfer into EasiCredit from another lender |
| `BAL TRF FEE / L3F400 001 / <ref>` | `bank_charge` | Balance transfer processing fee |

### FUND TRANSFER (Repayment)
```
16 JAN   FUND TRANSFER
         644149312001          ← source account (OCBC Savings)
         FROM OWN ACCOUNT
         OTHR - OTHER
```
This is Vivek moving money from his OCBC Savings account to repay the EasiCredit. Classify as `loan_repayment`. Link to the matching Withdrawal row in the Savings statement via `transaction_links`.

### BALANCE TRANSFER
```
26 MAY   BALANCE TRANSFER
         L3F400 001
         0009263698
```
This is a balance transfer drawn into EasiCredit (increases liability). The `L3F400` reference links to a balance transfer arrangement. Classify as `balance_transfer_in`.

### BAL TRF FEE
```
26 MAY   BAL TRF FEE
         L3F400 001
         0009263698
```
Fee charged for processing the balance transfer. Classify as `bank_charge`, category `Bank Charges`.

---

## Balance Transfer Summary Table

At the bottom of page 2:
```
BALANCE TRANSFER SUMMARY
Transfer Date | Preferential Interest Rate (% P.A.) | Outstanding Balance
26 MAY 2025   | 0.0000                              | $37,194.24
```

The preferential rate of 0.0000% means this balance transfer has **0% interest** for the promotional period. Store this in a separate `balance_transfer_summary` note or in account metadata — do not import as a transaction.

Key information to capture:
- `balance_transfer_date`: 26 MAY 2025
- `preferential_rate`: 0.0000%
- `balance_transfer_outstanding`: $37,194.24 (or $45,999.24 in May 2025 statement)

---

## Statement Metadata Extraction

```
Account No.          → account_number (633592357001)
Statement date       → statement_date (e.g., 31 JAN 2026)
Credit limit         → credit_limit
Interest rate        → interest_rate_pa
Minimum payment      → minimum_payment
Payment due date     → payment_due_date
Available credit     → available_credit
Outstanding balance  → closing_balance (from Outstanding Balance box)
Balance transfer date → bt_date
BT preferential rate  → bt_rate
```

---

## Validation Checks

1. BEGINNING BALANCE − Deposits + Withdrawals = ENDING BALANCE (note: Deposits reduce liability)
2. Outstanding Balance box = ENDING BALANCE (±0.01)
3. Available Credit = Credit Limit − Outstanding Balance

---

## Relationship to Other Accounts

| Linked Account | Relationship | How to Detect |
|---|---|---|
| OCBC Savings 644149312001 | Repayment source | `FUND TRANSFER / 644149312001 / FROM OWN ACCOUNT` in EasiCredit = `FUND TRANSFER / 633592357001 / to own account` in Savings |
| OCBC Balance Transfer 9403 / 9334 | Separate balance transfer accounts (different product) | See `ocbc-balance-transfer.md` |

> The EasiCredit also has a Balance Transfer loaded into it (from another lender, reference L3F400). This is **different** from the OCBC Balance Transfer accounts (9403, 9334), which are standalone balance transfer loan accounts.

---

## Edge Cases

- **Balance with `-` suffix:** All balance column values end with ` -` (e.g., `37,194.24 -`). Strip the `-` suffix and store as positive; the liability sign is implicit in account type.
- **OD INT CHARGE:** Overdraft interest charged when balance was not a balance transfer balance. Classify as `bank_charge`.
- **May 2025 statement shows initial balance transfer:** The May 2025 statement shows the BALANCE TRANSFER and BAL TRF FEE originating — this is the month the EasiCredit balance transfer was initiated (26 May 2025 at 0% interest).
- **Terms pages:** Pages 3–4 are standard T&C printed text. Skip entirely — no transactions.

---

## Historical Import Notes

- This profile applies to **all historical statements** from this institution, not just current ones
- Statement format may have changed over time — flag any parsing anomalies to the exceptions queue rather than failing silently
- For historical data, the statement period dates determine the correct year for all date inference
- Closed accounts (e.g., OCBC BT-9334) retain full transaction history — `account_status = closed` but records are never deleted
- Duplicate prevention: `txn_hash` uniqueness enforced across all time periods — re-importing historical statements is safe and idempotent
