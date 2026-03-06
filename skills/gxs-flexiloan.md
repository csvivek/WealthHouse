# GXS FlexiLoan — Parsing Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | GXS Bank Pte. Ltd. |
| Institution Code | `gxs_flexiloan` |
| Account Type | `instalment_loan` (fixed-term loan liability) |
| Currency | SGD |
| Country | SG |
| Statement Format | PDF (ZIP/JPEG + TXT — TXT is the primary data source) |
| Statement Title | "GXS FlexiLoan" |
| Account Number | 800-143650-29 |
| GST Reg | 202005626H |

---

## Key Feature: TXT File Is Primary Source

Unlike other institutions, GXS statements include **well-structured plain text** in `1.txt` that contains all transaction data. Use the TXT file as the primary parsing source; the JPEG is a fallback for visual verification only.

Page 2 TXT (`2.txt`) contains only terms & conditions and footer — skip entirely for transactions.

---

## File Structure

```
1.txt   → Statement header + all transactions (PRIMARY)
2.txt   → T&C, footer, account details (SKIP)
1.jpeg  → Visual rendering of page 1 (fallback)
2.jpeg  → Visual rendering of page 2 (skip)
```

---

## TXT Structure (Page 1)

```
Hi Vivek Palanisamy,
here's a look at your GXS FlexiLoan in <Month>!

Due on <DD Mon YYYY>
S$<amount>
Remaining payable
-S$<amount>
Available limit
S$<amount>
Total credit limit S$<amount>

Loans
<Loan Name>
Instalment Loan
<X>/<Total> instalments left
S$<amount> due on <DD Mon YYYY>
Final payment on <DD Mon YYYY>
Remaining Payable
-S$<amount>
S$<amount> paid
S$<amount> interest saved!

Activities
Date Description                    Drawdown/     Payments/     Activities
                                    Charges (S$)  Rebates (S$)  balance (S$)
<DD Mon YYYY>
<HH:MM AM/PM>
<Description line 1>
<Description line 2>
...
                                    <amount>      <amount>      <balance>
```

---

## Multiple Loans Per Account

GXS FlexiLoan account `800-143650-29` has **multiple loans** (observed in samples):
| Loan Name | Type | Details |
|---|---|---|
| `RAJ` | Instalment Loan | 24-month loan, paid off early in Mar 2025 |
| `InvestVik` | Instalment Loan | 60-month loan drawn Jun 2025 at 3.80% p.a. |

Each loan appears as a separate block in the `Loans` section. Transactions in the Activities table reference the loan name in the description.

---

## Column Structure (Activities Table)

| Column | Description |
|---|---|
| `Date` | `DD Mon YYYY` on first line, `HH:MM AM/PM` on second line |
| `Description` | Multi-line — transaction type, counterparty, additional detail |
| `Drawdown / Charges (S$)` | Amount drawn or charged (increases liability) |
| `Payments / Rebates (S$)` | Amount paid or rebated (reduces liability) |
| `Activities balance (S$)` | Running activities balance (not the loan balance) |

**Note:** The `Activities balance` is a running total of net payments/drawdowns in the statement period, not the outstanding loan balance. The outstanding loan balance is shown in the header as `Remaining Payable`.

---

## Date and Time Parsing

- Date: `DD Mon YYYY` (e.g., `8 Mar 2025`, `3 Jun 2025`)
- Time: `HH:MM AM/PM` (e.g., `07:46 AM`, `10:35 PM`) — store as `transaction_datetime`
- Full year always present — no year inference needed
- Timezone: SGT implied (not stated)

---

## Transaction Type Detection

| Description Pattern | `txn_type` | Direction | Notes |
|---|---|---|---|
| `Opening balance` | skip | — | Balance marker |
| `Loan repayment / From VIVEK PALANISAMY (PayNow)` | `loan_repayment` | Payment | Transfer type |
| `Interest savings for early/extra payment` | `interest_rebate` | Rebate | Store in Rebates column |
| `Instalment Loan for <LoanName> / To Vivek Palanisamy (PayNow) / Loan details...` | `loan_drawdown` | Drawdown | Initial loan disbursement |
| `Monthly instalment` | `loan_instalment` | Payment | Regular scheduled payment |
| Summary row (totals) | skip | — | End-of-table summary |

### Loan Drawdown Special Handling
When a new loan is drawn (e.g., `InvestVik` in Jun 2025), the description contains:
```
Instalment Loan for InvestVik
To Vivek Palanisamy (PayNow)
Loan details
S$99,000.00 + S$18,820.31 interest
3.80% p.a. (7.07% p.a. EIR), no fees apply
59 monthly repayments of S$1963.67
1 final repayment of S$1963.78
```

Extract and store:
- `principal`: SGD 99,000
- `total_interest`: SGD 18,820.31
- `interest_rate_pa`: 3.80%
- `eir_pa`: 7.07%
- `num_instalments`: 60 (59 + 1 final)
- `instalment_amount`: SGD 1,963.67
- `loan_name`: InvestVik

This is a liability creation. The disbursement to PayNow is to Vivek's own account — `internal_transfer` counterpart should appear in DBS/MariBank statement.

### Early Repayment / Interest Savings
Large lump-sum repayments generate an interest savings rebate on the next line:
```
Loan repayment
From VIVEK PALANISAMY (PayNow)
Paid S$65,110.16 to Show Funds
Interest savings for early/extra payment
Saved S$2,373.37 to Show Funds
```
→ Import as two rows: `loan_repayment` (65,110.16) + `interest_rebate` (2,373.37)

---

## Loan Name Mapping

| Loan Name | Purpose | Notes |
|---|---|---|
| `RAJ` | Unknown — likely a personal/consumer purpose | Paid off early Mar 2025 with large lump sum |
| `InvestVik` | Investment loan drawn Jun 2025 | SGD 99k principal, 60 months, 3.80% p.a. |

> **Question for Vivek — Q1:** What was the `RAJ` loan for? And `InvestVik` — what was the SGD 99k invested in?

---

## Statement Metadata Extraction

```
Statement month     → statement_month (from "your GXS FlexiLoan in <Month>!")
Account number      → account_number (from 2.txt footer: "800-143650-29")
Due date            → next_payment_due_date
Next instalment     → next_instalment_amount
Remaining payable   → outstanding_balance (negative = liability)
Available limit     → available_credit
Total credit limit  → credit_limit
Loans section       → loan_name, instalments_remaining, total_instalments, final_payment_date
```

---

## Validation Checks

1. Opening balance + Drawdowns/Charges − Payments/Rebates = Closing activities balance
2. Remaining Payable in header should equal prior month's Remaining Payable − net payments this month (approximately — may differ due to interest accrual)

---

## Balance Sign Convention

- `Remaining Payable` shown as `-S$<amount>` = outstanding debt (liability)
- Store as positive in DB; ledger service applies liability sign
- Strip leading `-` before storing

---

## Edge Cases

- **Time included in date:** GXS is the only institution that includes HH:MM in transaction records. Store as `transaction_datetime` not just `transaction_date`.
- **`Show Funds` text:** In loan descriptions, "Paid S$X to Show Funds" — "Show Funds" is an obfuscated/masked fund name in the statement. Not a real payee name; discard this part.
- **Interest savings on same day:** Interest savings rebate row appears immediately after the repayment row on the same date — link these two rows via `transaction_links`.
- **Multiple loans:** Parse all loan blocks in the `Loans` section. Each loan has its own instalment tracking.
- **Overdue interest rules (2.txt):** The T&C in `2.txt` mention additional late interest — relevant if a payment is missed but not for normal import.

---

## Historical Import Notes

- Three months of data available: Mar 2025 (RAJ loan payoff), Jun 2025 (InvestVik drawdown), Dec 2025 (InvestVik repayment)
- Format has been consistent across all three samples
- Historical data will include full loan lifecycle
- Idempotency guaranteed by `txn_hash`
