# Citibank Singapore — Parsing Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | Citibank Singapore Ltd |
| Institution Code (Bank) | `citi_bank` |
| Institution Code (CC) | `citi_cc` |
| Institution Code (Ready Credit) | `citi_ready_credit` |
| Currency | SGD |
| Country | SG |
| Co. Reg. No. | 200309485K |
| Statement Format | PDF (ZIP/JPEG + TXT — TXT is the primary data source) |

---

## Citibank Issues Three Distinct Statement Types

| Statement Type | File Pattern | Account | `account_type` |
|---|---|---|---|
| Bank Statement | `BankStatement_MonYYYY.pdf` | Citi Wealth First Account 0801331245 | `savings` |
| Card Statement | `CardStatement_MonYYYY.pdf` | Citi Rewards World Mastercard 5425-5030-0370-4615 | `credit_card` |
| Ready Credit | `ReadyCreditStatement_MonYYYY.pdf` | Citibank Ready Credit 1-905379-255 | `credit_line` |

Each has a separate file and separate parsing logic below.

---

## TYPE 1: Citibank Bank Statement (Citi Wealth First Account)

### Account Details
- Product: Citi Wealth First Account
- Account Number: 0801331245
- Currency: SGD

### TXT Structure (Page 1 `1.txt`)
```
SUMMARY OF YOUR CITIBANK ACCOUNT
All amounts are in Singapore Dollars as of Mon DD YYYY unless otherwise stated

SGD Equivalent Balance - Mon DD YYYY
Checking  <amount>
TOTAL     <amount>

DETAILS OF YOUR CITIBANK ACCOUNT
Your Checking Details
Citi Wealth First Account 0801331245 SGD

Transactions Done
Mon DD YYYY  Mon DD YYYY  <DESCRIPTION>    <debit>  <credit>  <balance>
```

### Date Format
- `Mon DD YYYY` (e.g., `Feb 01 2026`, `Jan 19 2026`)
- Both Transaction Date and Value Date printed (same row, two date columns)
- Use first date (Transaction Date) as `transaction_date`

### Column Structure
| Column | Notes |
|---|---|
| Transaction Date | `Mon DD YYYY` |
| Value Date | `Mon DD YYYY` |
| Description | Multi-line — type, ref, counterparty, sub-type |
| Amount 1 | Debit amount (withdrawal) |
| Amount 2 | Running balance |

**Note:** Unlike most banks, Citi bank statement shows amount + running balance as the last two columns, not separate Withdrawal/Deposit. Determine direction from description context.

### Transaction Type Detection

| Description Pattern | `txn_type` | Notes |
|---|---|---|
| `OPENING BALANCE` | skip | Period start marker |
| `CLOSING BALANCE` | skip | Period end marker |
| `INCOMING FAST FROM <ref>` + `VIVEK PALANISAMY / DBS BANK LTD` | `internal_transfer` | Self-transfer from DBS to Citi |
| `PAYMENT TO CITI CREDIT CARD <ref>` | `credit_card_payment` | Internal payment to own Citi CC |
| `PAYMENT TO CITI READY CREDIT <ref>` | `loan_repayment` | Payment to Ready Credit line |
| `ACCOUNT SERVICE FEE` | `bank_charge` | Monthly account fee |

### Key Observation: This Account Is a Routing Account
The Citi Wealth First Account appears to function primarily as a **pass-through** account:
- Receives incoming FAST from DBS
- Immediately pays out to Citi CC and/or Citi Ready Credit
- Ending balance near SGD 0 most months

All transactions are effectively internal transfers. Flag all for the Transfers agent.

### Statement Metadata
```
Statement period     → "as of Mon DD YYYY" from summary header; period from page footer
Account number       → 0801331245
Closing balance      → from CLOSING BALANCE row or TOTAL line
```

---

## TYPE 2: Citibank Credit Card Statement (Citi Rewards World Mastercard)

### Account Details
- Product: Citi Rewards World Mastercard
- Card Number: 5425-5030-0370-4615
- Cardholder: PALANISAMY VIVEK

### Page Layout
Page 1 (`1.txt`): Contains card number and disclaimer text only — no transactions.
Pages 2+ (`2.txt`, `3.txt` etc.): Transactions by card.

### TXT Structure (Page 2 onwards)
```
<account_ref_number>
CITI REWARDS WORLD MASTERCARD 5425 5030 0370 4615    Payment Due Date: <date>

PREVIOUS BALANCE - PAYMENTS & CREDITS + PURCHASES & ADVANCES + INTEREST CHARGES + FEES & CHARGES = CURRENT BALANCE
<prev>  <payments>  <purchases>  <interest>  <fees>  <current>

Retail Interest Rate: 27.90% p.a.  Cash Interest Rate: 27.90% p.a.

DATE    DESCRIPTION                             AMOUNT (SGD)
TRANSACTIONS FOR CITI REWARDS WORLD MASTERCARD
ALL TRANSACTIONS BILLED IN SINGAPORE DOLLARS

BALANCE PREVIOUS STATEMENT    <amount>
<DD Mon>  <DESCRIPTION>       <amount>
...
SUB-TOTAL:  <amount>

CITI REWARDS WORLD MASTERCARD 5425 5030 0370 4615 - PALANISAMY VIVEK
<DD Mon>  <DESCRIPTION>       <amount>
...
SUB-TOTAL:  <amount>
```

### Two Transaction Blocks Per Card
Citi CC statement has two sub-blocks per card:
1. **Block 1:** Previous balance + payments (no cardholder name line)
2. **Block 2:** New transactions under `CARD_NUMBER - PALANISAMY VIVEK`

Parse both blocks; transactions in Block 2 are the actual new spend.

### Date Format
- `DD Mon` (e.g., `29 DEC`, `01 JAN`)
- No year on individual rows — infer from statement period (`Statement Period Jan 01 2026 - Jan 31 2026` in page footer)

### Amount Format
- Positive = debit (purchase)
- Parenthesised `(amount)` = credit (payment/refund)

### Transaction Type Detection

| Pattern | `txn_type` |
|---|---|
| `BALANCE PREVIOUS STATEMENT` | skip |
| `PAYMENT - ATM/INTERNET` | `credit_card_payment` |
| Amount in parentheses | credit direction |
| `SUB-TOTAL:` | skip |
| All other | `purchase` |

### Statement Metadata
```
Card number         → 5425-5030-0370-4615
Payment due date    → from card header
Statement period    → from page footer
Previous balance    → from summary row
Current balance     → from summary row
```

---

## TYPE 3: Citibank Ready Credit

### Account Details
- Product: Citibank Ready Credit
- Account Number: 1-905379-255
- Type: Revolving credit line (liability)
- Interest Rate: 22.95% p.a. EIR

### TXT Structure (Page 2 `2.txt`)
```
CITIBANK READY CREDIT 1-905379-255
PAGE 2 OF 4

Previous Balance - Payments & Credits + New Debits + Interest Charges + Fees & Charges = Total Outstanding Balance
<prev>  <payments>  <new_debits>  <interest>  <fees>  <total>

Effective Interest Rate: 22.95% p.a.

DATE    DESCRIPTION    AMOUNT(SGD)

BALANCE FROM: PREVIOUS STATEMENT   <amount>
<DD Mon>  <DESCRIPTION>            (<amount>)   ← payments in parentheses
```

### Amount Sign Convention
- Plain positive: debit (draws on credit line, increases liability)
- Parenthesised `(<amount>)`: credit/payment (reduces liability)

### Transaction Type Detection

| Pattern | `txn_type` | Notes |
|---|---|---|
| `BALANCE FROM: PREVIOUS STATEMENT` | skip | Opening balance |
| `PAYMENT - ATM/INTERNET` | `loan_repayment` | Transfer type |
| Interest charges | `bank_charge` | |
| Any drawdown | `credit_line_drawdown` | Liability increase |

### Key Observation: Used as Routing Credit Line
The Ready Credit appears to receive payments from the Citi Wealth First Account and function as a short-term credit facility, being paid off monthly.

### Statement Metadata
```
Account number         → 1-905379-255
Previous balance       → from summary row
Total outstanding      → closing_balance
Interest rate (EIR)    → 22.95% p.a.
```

### Validation
Previous Balance − Payments + New Debits + Interest = Total Outstanding Balance

---

## Inter-Account Flow (Citibank Ecosystem)

```
DBS Bank → [FAST] → Citi Wealth First (0801331245) → [PAYMENT] → Citi CC (5425...)
                                                    → [PAYMENT] → Citi Ready Credit (1-905379-255)
```

All transfers between these three accounts must be paired in `transaction_links` to avoid double-counting in spending reports.

---

## Institution Fingerprint

| Fingerprint | Type |
|---|---|
| `SUMMARY OF YOUR CITIBANK ACCOUNT` in `1.txt` | Bank Statement |
| Card number `4265696000903150` on page 1 of card statement (reference number) | Card Statement |
| `CITIBANK READY CREDIT` in `2.txt` | Ready Credit |

---

## Edge Cases

- **Account service fee SGD 0.04:** Very small monthly fee, likely waived or charged on low balance — import as `bank_charge`.
- **Statement period in page footer:** The period is printed in the footer of each card statement page (e.g., `Statement Period Jan 01 2026 - Jan 31 2026`), not in page 1's main body.
- **Page 1 of card statement:** Contains only disclaimer + reference number — no transactions. Start parsing from page 2.
- **6-page statements:** Both Bank and Card statements are 6 pages. Pages 3–6 typically contain T&C, rewards summary, marketing messages — skip for transactions.
- **Balance near zero:** Citi Wealth First Account consistently shows ~SGD 0 balance — this is expected (pass-through account).

---

## Historical Import Notes

- Jan 2026 and Feb 2026 samples available for all three statement types
- Format appears consistent; TXT extraction is reliable
- Idempotency guaranteed by `txn_hash`
