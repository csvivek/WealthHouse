# OCBC Savings Account — Parsing Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | OCBC Bank (Overseas-Chinese Banking Corporation Limited) |
| Institution Code | `ocbc_savings` |
| Account Type | `savings` |
| Currency | SGD |
| Country | SG |
| Statement Format | PDF (image-only) |
| Statement Title | "Statement of Account — Statement Savings" |
| Co. Reg. No. | 193200032W |
| Statement Brand | OCBC PLUS! |

---

## File Structure

- Image-only PDF (2 pages in sample)
- Page 1: Full statement with all transactions
- Page 2: Continuation (if needed) + "Check Your Statement" notice (skip)

---

## Page Layout

### Page 1 Header
```
OCBC Bank                               STATEMENT OF ACCOUNT
65 Chulia Street, OCBC Centre           Page X of Y

VIVEK PALANISAMY
<address>

STATEMENT SAVINGS
Account No. 644149312001                <DD MON YYYY TO DD MON YYYY>
```

Statement period is printed as `DD MON YYYY TO DD MON YYYY` on the same line as the account number.

### Transaction Table
Columns (bilingual headers — English / Chinese):
| Column | English Label | Notes |
|---|---|---|
| `Transaction Date` | 交易日 | Date transaction was initiated |
| `Value Date` | 过账日 | Settlement date |
| `Description` | 说明 | Multi-line description |
| `Cheque` | 支票 | Cheque number if applicable; usually blank |
| `Withdrawal` | 支出 | Debit amount, positive |
| `Deposit` | 存入 | Credit amount, positive |
| `Balance` | 结存/欠 | Running balance |

---

## Date Parsing

- Format: `DD MON` (e.g., `05 JAN`, `16 JAN`)
- Two date columns: Transaction Date and Value Date — use **Transaction Date** for `transaction_date`
- Year inferred from statement period header (always present)
- Special date: `01 FEB` for end-of-month interest that is credited on 1st of next month — use as-is

---

## Transaction Row Structure

Each row has:
- **Transaction Date** (left column) — `DD MON`
- **Value Date** (second column) — `DD MON`, often same as transaction date
- **Description** (multi-line, up to 4 lines):
  - Line 1: Transaction type (e.g., `BILL PAYMENT`, `IBG GIRO`, `PAYMENT/TRANSFER`, `FUND TRANSFER`, `INTEREST CREDIT`)
  - Line 2: Reference / account number / institution
  - Line 3: Counterparty or additional detail
  - Line 4: Sub-classification keyword (e.g., `SINGAPORE`, `IRAS`, `OTHR Transfer`, `OTHR - Other`)
- **Withdrawal / Deposit**: one will be populated, the other blank

---

## Transaction Type Detection

| Description Pattern | `txn_type` | Category Hint | Notes |
|---|---|---|---|
| `BILL PAYMENT / INB / <ref> / INTERNET BANKING / SINGAPORE` | `bill_payment` | Bank Charges / Utilities | Bill paid via internet banking |
| `IBG GIRO / TAXS S<ref> / IRAS / ITX` | `giro` | Tax | IRAS income tax GIRO — `category = Tax` |
| `PAYMENT/TRANSFER / DBSS / from VIVEK PALANISA / OTHR Transfer` | `internal_transfer` | Transfer | Incoming from own DBS account |
| `FUND TRANSFER / <account_no> / to own account / OTHR - Other` | `internal_transfer` | Transfer | Transfer to own linked account |
| `INTEREST CREDIT` | `interest` | Interest | Savings interest income |
| `BALANCE B/F` | skip | — | Opening balance marker |
| `BALANCE C/F` | skip | — | Closing balance marker |

### IRAS GIRO Rule
`IBG GIRO / TAXS S<ref> / IRAS / ITX` — this is an income tax GIRO deduction. Classify as:
- `txn_type = giro`
- `category = Tax`
- `merchant = IRAS`

### Own Account Transfers
`FUND TRANSFER / <account_no> / to own account` — the account number (e.g., `633592357001`) is a linked OCBC account (EasiCredit). This is an internal transfer between Vivek's own accounts. Classify as `internal_transfer`.

`PAYMENT/TRANSFER / DBSS / from VIVEK PALANISA` — incoming from DBS. Internal transfer.

---

## Balance Row Markers

| Row text | Action |
|---|---|
| `BALANCE B/F` | Opening balance — skip as transaction, use for validation |
| `BALANCE C/F` | Closing balance — skip as transaction, use for validation |

---

## Statement Footer Totals

Printed below all transactions:
```
Total Withdrawals/Deposits    <total_withdrawal>    <total_deposit>
Total Interest Paid This Year <ytd_interest>
Average Balance               <average_balance>
```

Use `Total Withdrawals/Deposits` for validation. Do not import as transactions.

---

## Statement Metadata Extraction

```
Account No.          → account_number (e.g., 644149312001)
Statement period     → period_start, period_end
Opening balance      → from BALANCE B/F row
Closing balance      → from BALANCE C/F row
Total withdrawals    → total_debits (validation)
Total deposits       → total_credits (validation)
Total interest YTD   → interest_ytd (informational)
```

---

## Known Transaction Patterns

| Raw Description | Normalised | Category |
|---|---|---|
| `BILL PAYMENT / INB / 9900000003339334 / INTERNET BANKING / SINGAPORE` | OCBC Bill Payment | Bank Charges / Loan Repayment |
| `IBG GIRO / TAXS S8583025B / IRAS / ITX` | IRAS Income Tax | Tax |
| `PAYMENT/TRANSFER / DBSS / from VIVEK PALANISA / OTHR Transfer` | DBS → OCBC Transfer | Internal Transfer |
| `FUND TRANSFER / 633592357001 / to own account / OTHR - Other` | OCBC Savings → EasiCredit | Internal Transfer |
| `INTEREST CREDIT` | OCBC Interest | Interest |

---

## Inter-Account Link: Savings ↔ EasiCredit

The OCBC Savings account (644149312001) is linked to the OCBC EasiCredit account (633592357001). Fund transfers between these two accounts appear in both statements:
- In Savings: `FUND TRANSFER / 633592357001 / to own account` (Withdrawal)
- In EasiCredit: `FUND TRANSFER / 644149312001 / FROM OWN ACCOUNT` (Deposit)

These are internal transfers. Use `transaction_links` to pair them and avoid double-counting.

---

## Validation Checks

1. BALANCE B/F + Total Deposits − Total Withdrawals = BALANCE C/F
2. Sum of Withdrawal column = Total Withdrawals footer
3. Sum of Deposit column = Total Deposits footer (±0.01)

---

## Edge Cases

- **Bilingual headers:** Column headers are in English/Chinese — strip Chinese characters, use English labels only.
- **Interest date:** Interest credit may show `01 FEB` (first of following month) with a Jan statement — this is correct, use that date as-is.
- **Account reference in bill payment:** The account number `9900000003339334` in the bill payment description is the OCBC Balance Transfer account. This is a loan repayment — classify as `loan_repayment`, not a standard bill payment.
- **IRAS GIRO large amounts:** IRAS GIRO of SGD 4,216.81 is a large tax payment — expected, not an anomaly.
- **"PLUS!" branding:** The statement carries "PLUS!" branding — this refers to the OCBC Plus! savings product. Account type remains `savings`.

---

## Historical Import Notes

- This profile applies to **all historical statements** from this institution, not just current ones
- Statement format may have changed over time — flag any parsing anomalies to the exceptions queue rather than failing silently
- For historical data, the statement period dates determine the correct year for all date inference
- Closed accounts (e.g., OCBC BT-9334) retain full transaction history — `account_status = closed` but records are never deleted
- Duplicate prevention: `txn_hash` uniqueness enforced across all time periods — re-importing historical statements is safe and idempotent
