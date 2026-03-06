# HSBC Line of Credit & Composite Statement — Parsing Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | HSBC Bank (Singapore) Limited |
| Institution Code | `hsbc_loc` / `hsbc_composite` |
| Account Type | `credit_line` (liability) / `composite_summary` |
| Currency | SGD |
| Country | SG |
| Statement Format | PDF (ZIP/JPEG) |
| Co. Reg. No. | 201420624K |

---

## Two Distinct Statement Types

HSBC generates two additional statement types alongside the CC statement:

### Type A: Account Statement — Line of Credit
- **File pattern:** `20251215_Statement.pdf` (dated YYYYMMDD)
- **Statement title:** "Account Statement"
- **Product:** LINE OF CREDIT
- **Account Number:** 048-266308-492
- **Branch:** Raffles Place Branch (143)

### Type B: Composite Statement
- **File pattern:** `20260115_Statement.pdf`, `20260214_Statement.pdf`, `20260216_Statement.pdf`
- **Statement title:** "Composite Statement"
- **Branch:** Claymore Branch (143)
- **Purpose:** Portfolio summary only — no individual transactions

---

## TYPE A: Line of Credit Statement

### What Is It?
HSBC Line of Credit is a **revolving personal credit line** (similar to OCBC EasiCredit). Outstanding balance = liability.

Observed balance: SGD 104,250 outstanding at 22.90% p.a. interest rate.

### Page Layout
```
Account Statement
Branch Number: 143
Branch Name: RAFFLES PLACE BRANCH

Account Details:
Statement Date:     15DEC2025
Customer Number:    143-744787
Account Number:     048-266308-492
Currency:           SGD
Product Type:       LINE OF CREDIT

Outstanding Balance:    $104,250.00
Payment Due Date:       06JAN2026
```

### Transaction Table
```
Date        Details                         Withdrawals    Deposits    Balance (DR=Debit)
DD MON YYYY <description>                   <amount>       <amount>    <balance>DR
```

- **Balance column:** Suffix `DR` = debit balance = money owed. All LoC balances are `DR` (liability).
- **Date format:** `DDMONYYYY` (no spaces, e.g., `15NOV2025`, `20NOV2025`)
- **Withdrawal** = draws on the credit line (increases liability)
- **Deposits** = repayments (reduces liability)

### Transaction Type Detection

| Description Pattern | `txn_type` | Notes |
|---|---|---|
| `BALANCE BROUGHT FORWARD` | skip | Opening balance |
| `BALANCE CARRIED FORWARD` | skip | Closing balance |
| `REFUND OF DEBIT INTEREST / DEBITED ON DDMONYY / DDOCT25` | `bank_charge_reversal` | Interest refund |
| `DEBIT INTEREST` | `bank_charge` | Interest charge |
| `PAYMENT` / `PAYMENT BY ...` | `loan_repayment` | Transfer type |
| Any drawdown | `credit_line_drawdown` | Liability increase |

### Balance Sign Convention
- All balances shown with `DR` suffix = outstanding debt
- Store as positive in DB; ledger service applies liability sign
- `DR` suffix should be stripped before storing

### Statement Metadata
```
Statement Date      → statement_date (DDMONYYYY format)
Account Number      → account_number (048-266308-492)
Customer Number     → customer_number (143-744787)
Outstanding Balance → closing_balance
Payment Due Date    → payment_due_date
Interest Rate       → 22.90% p.a.
```

### Validation
- Balance B/F + Withdrawals − Deposits = Balance C/F (after stripping DR suffix)
- Outstanding Balance box = Balance C/F

---

## TYPE B: Composite Statement

### What Is It?
A **portfolio summary** issued periodically showing all HSBC products and their current balances. Contains **NO individual transactions** — just a snapshot of balances and upcoming payments.

### Do Not Import Transactions From This File
The Composite Statement is for reference only. Import the individual product statements (CC, LoC) for transactions.

### What to Extract (for net worth / balance snapshot)
```
Statement Date          → snapshot_date
Total Deposits & Investments → total_assets
Total Borrowings        → total_liabilities (e.g., 68.91 DR = Revolution Visa balance)
Net Position            → net_position
```

### Portfolio Summary Table
```
BORROWINGS  | CCY | Account Number      | Credit Limit | Balance (DR=Debit) | SGD Equivalent
REVOLUTION VISA | SGD | 4835 8500 1324 1873 | 500 | 68.91DR | 68.91DR
```

This mirrors data already in the CC statement — do not double-import as transactions. Use only for balance validation or net worth snapshot.

### Upcoming Action/Payment Dates
```
Date        Action                  Account Number
26Jan2026   REVOLUTION VISA PAYMENT 4835 8500 1324 1873
```

This can be stored as a `payment_reminder` but is not a transaction.

### Institution Fingerprint
Page 1: HSBC logo + "Composite Statement" title + "Your Portfolio at a Glance" section header

---

## Edge Cases

- **LoC date format `DDMONYYYY`:** No separators (e.g., `20NOV2025`) — parse carefully; don't confuse with other date formats.
- **Refund of Debit Interest:** The sample shows an interest charge reversed. This means interest was charged in a prior period and subsequently refunded. Both the charge and the reversal should be imported if in-scope period.
- **Composite Statement vs LoC Statement:** Both are HSBC, both have no embedded text in page 1 (image only). Distinguish by checking for "Composite Statement" vs "Account Statement" in the header. Also check for "LINE OF CREDIT" in the Account Details box.
- **LoC outstanding ~SGD 104k:** This is a significant liability. Ensure it appears in net worth calculations under Liabilities.

---

## Historical Import Notes

- Both statement types apply across all historical periods
- LoC format has been consistent in Dec 2025 sample
- Composite Statement format consistent in Jan and Feb 2026 samples
- Idempotency guaranteed by `txn_hash`
