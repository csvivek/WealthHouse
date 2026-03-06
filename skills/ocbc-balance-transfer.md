# OCBC Balance Transfer — Parsing Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | OCBC Bank |
| Institution Code | `ocbc_balance_transfer` |
| Account Type | `balance_transfer_loan` (fixed-term loan liability) |
| Currency | SGD |
| Country | SG |
| Statement Format | PDF (image-only) |
| Statement Title | "Balance Transfer Statement of Account" |
| Total Credit Limit | SGD 168,600 (shared across all OCBC credit facilities) |

---

## What Is an OCBC Balance Transfer?

OCBC Balance Transfer is a **short-term fixed loan product** where Vivek transfers outstanding balances from other lenders to OCBC at a 0% or low interest rate for a promotional period. These are **pure liability accounts** — no day-to-day spending occurs on them.

Vivek holds **two separate Balance Transfer accounts**:
| Account Ref | Account Number | Notes |
|---|---|---|
| BT-9403 | 9900-0000-0342-9403 | Primary BT account |
| BT-9334 | 9900-0000-0333-9334 | Secondary BT account |

Each has its own statement file. Parse them identically — only account number differs.

---

## File Structure

- Image-only PDF (4 pages)
- **Page 1:** Summary header + Important Note box + Important warnings (skip warnings)
- **Page 2:** Transaction table + News & Information (skip news section)
- **Pages 3–4:** Standard terms and conditions (skip entirely)

---

## Page 1 Layout

### Statement Header Table
```
STATEMENT DATE | PAYMENT DUE DATE | TOTAL CREDIT LIMIT | TOTAL AVAILABLE CREDIT LIMIT | TOTAL MINIMUM DUE
25-02-2026     | 20-03-2026       | S$168,600          | S$120,893.10                 | S$1,432.00
```

- **Statement date format:** `DD-MM-YYYY` (note: hyphen-separated, different from other OCBC statements)
- **Payment due date format:** `DD-MM-YYYY`
- `TOTAL CREDIT LIMIT` is the combined OCBC credit limit across all facilities

### Important Note Box
```
Outstanding Balance: S$47,707.20
Payment Due Date: 20-03-2026
```

---

## Page 2 — Transaction Table

### Section Header
```
BALANCE TRANSFER
VIVEK PALANISAMY

<account_number>        ← e.g., 9900-0000-0342-9403
```

### Transaction Table Structure
```
TRANSACTION DATE    DESCRIPTION                 AMOUNT (SGD)
                    LAST MONTH'S BALANCE        49,183.20
19/02               PAYMENT BY INTERNET         (1,476.00)
19/02               LATE CHARGE REVERSAL        (120.00)
16/02               LATE CHARGE                 120.00
                    SUBTOTAL                    47,707.20
                    TOTAL                       47,707.20
                    TOTAL AMOUNT DUE            47,707.20
```

**Critical:** This is a **single-column amount** layout — **not** separate Withdrawal/Deposit columns. Positive = increases balance owed; negative (in parentheses) = reduces balance owed.

---

## Amount Sign Convention

| Format | Meaning | `txn_type` direction |
|---|---|---|
| `49,183.20` (plain positive) | Increases liability | debit (more owed) |
| `(1,476.00)` (in parentheses) | Reduces liability | credit (payment) |

Strip parentheses and apply direction:
- Plain number → `direction = debit` (balance increases)
- Parenthesised number → `direction = credit` (balance decreases / payment)

---

## Date Parsing

- **Transaction rows:** `DD/MM` format (e.g., `19/02`, `16/02`)
- Year inferred from statement date (page 1)
- **Year rollover:** If transaction month is later than statement month, it belongs to prior year. For a Feb 2026 statement, `02/02` = February 2026; `12/25` would be December 2025.
- **No-date rows:** `LAST MONTH'S BALANCE`, `SUBTOTAL`, `TOTAL`, `TOTAL AMOUNT DUE` have no date — these are summary rows, skip as transactions.

---

## Transaction Type Detection

| Description | `txn_type` | Category | Notes |
|---|---|---|---|
| `LAST MONTH'S BALANCE` | skip | — | Opening balance marker |
| `PAYMENT BY INTERNET` | `loan_repayment` | Loan Repayment | Transfer type — not spending |
| `LATE CHARGE` | `bank_charge` | Bank Charges | Late payment penalty |
| `LATE CHARGE REVERSAL` | `bank_charge_reversal` | Bank Charges | Reversal of late fee (credit) |
| `INTEREST CHARGE` | `bank_charge` | Bank Charges | Monthly interest on BT balance |
| `SUBTOTAL` | skip | — | Section subtotal |
| `TOTAL` | skip | — | Statement total |
| `TOTAL AMOUNT DUE` | skip | — | Same as TOTAL |

### Balance Transfer Import (Initial)
The initial drawdown (when Vivek first took the balance transfer) may appear as a large positive amount in the first statement. Classify as `balance_transfer_in` — this is a liability creation, not spending.

---

## Statement Metadata Extraction

```
Statement date              → statement_date (DD-MM-YYYY format)
Payment due date            → payment_due_date
Total credit limit          → total_credit_limit (shared OCBC limit)
Total available credit      → available_credit
Total minimum due           → minimum_payment
Outstanding balance         → closing_balance (from Important Note box)
Account number              → account_number (e.g., 9900-0000-0342-9403)
Last month's balance        → opening_balance
```

---

## Validation

1. Last Month's Balance + sum(debits) − sum(credits) = TOTAL
2. TOTAL = Outstanding Balance in Important Note box (±0.01)
3. Available Credit = Total Credit Limit − Outstanding Balance (approximately — may differ due to other facilities sharing the limit)

---

## Multi-Account Handling

Two BT accounts (9403 and 9334) generate separate statement files. Both use the **identical parsing logic** — differentiated only by account number extracted from the section header.

When both statements are imported for the same month:
- Import each as a separate account record
- Do not merge or deduplicate across accounts
- Both count toward Vivek's total OCBC liability

---

## Account Context for Wealth House

Both BT accounts are **liabilities**:
- Outstanding balances reduce net worth
- Payments (PAYMENT BY INTERNET) reduce the liability
- Late charges and interest increase the liability

In the ledger, BT account balances should appear under **Liabilities** in the net worth view, not as expenses.

Account 9334 is **closed** (fully paid off Dec 2025, residual balance SGD 23.77 at last statement). Account 9403 is active with ~SGD 47k outstanding as of Feb 2026. Closed accounts retain full statement history in the system — `account_status = closed`, all historical transactions preserved and queryable.

---

## Edge Cases

- **Late Charge + Reversal pair:** The Feb 2026 statement shows `LATE CHARGE 120.00` and `LATE CHARGE REVERSAL (120.00)` — these net to zero. Both should be imported and linked; they do not affect the outstanding balance.
- **Hold reference:** Some statements show `hold ref no: Y / 16986` in the header — this is a OCBC internal document reference, not relevant to parsing.
- **`TOTAL CREDIT LIMIT` is shared:** The SGD 168,600 limit is shared across OCBC Savings, EasiCredit, and both BT accounts. Do not treat it as a per-account limit.
- **`News & Information` section on page 2:** Skip this section entirely — contains marketing text about rewards, no transaction data.
- **Pages 3–4:** Standard OCBC T&C — skip entirely.

---

## Historical Import Notes

- This profile applies to **all historical statements** from this institution, not just current ones
- Statement format may have changed over time — flag any parsing anomalies to the exceptions queue rather than failing silently
- For historical data, the statement period dates determine the correct year for all date inference
- Closed accounts (e.g., OCBC BT-9334) retain full transaction history — `account_status = closed` but records are never deleted
- Duplicate prevention: `txn_hash` uniqueness enforced across all time periods — re-importing historical statements is safe and idempotent
