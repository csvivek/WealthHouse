# FSMOne (iFAST Financial) — Parsing Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | iFAST Financial Pte Ltd |
| Institution Code | `fsmone` |
| Account Type | `investment` (Unit Trust + Cash Account) |
| Base Currency | SGD |
| Country | SG |
| Statement Format | PDF (ZIP/JPEG + TXT — TXT is primary) |
| Statement Title | "Consolidated Statement" |
| Account Number | P0439860 |
| Cash Account | TAC2102070071 |
| Co. Reg. No. | 200000231R |
| GST Reg | M9-0356174-N |

---

## File Structure

ZIP with TXT + JPEG per page, typically 6 pages:

| Page | Content |
|---|---|
| `1.txt` | Header, consolidated financial positions summary |
| `2.txt` | Unit Trust Holdings detail |
| `3.txt` | Cash Account transactions |
| `4.txt` | Transactions Made in the Month |
| `5.txt` | Additional product holdings (Bonds, ETFs etc. if any) |
| `6.txt` | Footer / disclaimer |

---

## Page 1 Structure (Summary)

```
AT DD MONTH YYYY (SGD EQUIVALENTS) EXCLUDING OUTSTANDING PURCHASE AND SALES, IF ANY

VIVEK PALANISAMY
...

For any enquiries, please contact FSM hotline at (65) 6557 2853
Account No: P0439860
Display Currency: Singapore Dollar, S$
Issued Date: DD Month YYYY
Consolidated Statement Period: DD Mon YYYY to DD Mon YYYY

CONSOLIDATED FINANCIAL POSITIONS
PRODUCT TYPE   CURRENCY   BALANCE/VALUE (SGD equivalent)
Unit Trust     SGD        <value>
[others if any]
```

### Date Format
- Statement header: `DD MONTH YYYY` (e.g., `28 FEBRUARY 2026`, `31 DECEMBER 2021`)
- Statement period: `DD Mon YYYY to DD Mon YYYY` (e.g., `01 Feb 2026 to 28 Feb 2026`)
- Issued date: `DD Month YYYY`
- Use statement period end date as the canonical valuation date

---

## Page 2 Structure (Unit Trust Holdings)

```
UNIT TRUST HOLDINGS AS AT DD MONTH YYYY

INVESTMENT HOLDINGS
INFORMATION (IN PRODUCT CURRENCY) ### SGD EQUIVALENT #

Product Name | Price | Payment Method | Weighted Average Cost | Quantity | Investment Amount (A) | Profit/Loss (C) = (B)-(A) | Profit/Loss % | Current Market Value (B)

<Fund Name> <Currency>  <price>  Cash SGD  <wac>  <qty>  SGD <inv_amt>  SGD <pnl>  <pnl_pct>  SGD <market_value>

TOTAL UNIT TRUST HOLDINGS (SGD EQUIVALENT)  SGD  <total>
```

### Unit Trust Holding Fields to Extract
| Field | Description |
|---|---|
| `product_name` | Full fund name (e.g., "Amova ARK Disruptive Innovation B SGD") |
| `price` | Current NAV price |
| `payment_method` | `Cash SGD` |
| `weighted_avg_cost` | Cost basis per unit |
| `quantity` | Number of units held |
| `investment_amount` | Total cost (A) |
| `profit_loss` | Unrealised P&L (C) = (B) - (A) |
| `profit_loss_pct` | % P&L |
| `market_value` | Current market value (B) |

Import into `asset_valuations` on each statement import, using statement period end date.

---

## Page 3 Structure (Cash Account Transactions)

```
CASH ACCOUNT
SGD CASH ACCOUNT TRANSACTIONS IN MONTH YYYY   CASH ACCOUNT NO. TAC2102070071

Transaction Date | Transaction No | Order Type | Status | Remarks | Transaction Amount (Deposit / Withdraw)

Opening Balance  SGD  <amount>
[transactions if any]
Closing Balance  SGD  <amount>
```

### Cash Transaction Types
| Description | `txn_type` |
|---|---|
| `Deposit` | `cash_deposit` (transfer into FSMOne from bank) |
| `Withdrawal` | `cash_withdrawal` (transfer out to bank) |
| `Fund Subscription` | `fund_subscription` (debit — cash used to buy fund) |
| `Fund Redemption` | `fund_redemption` (credit — proceeds from fund sale) |
| `Dividend / Distribution` | `dividend` (income) |

---

## Page 4 Structure (Transactions Made in the Month)

```
TRANSACTIONS MADE IN THE MONTH

Transaction Date | Product Name | CCY | Product Type | Order Type | Payment Method | Investment/Redemption Amount | Quantity Transacted | Price | Transaction Status

Bond
You have no transactions for the month

Unit Trust
[transactions if any]

Stock & ETF
[transactions if any]

Managed Portfolio
[transactions if any]
```

### Transaction Status
Only import transactions with `Transaction Status = Completed`. Skip `Pending` or `Cancelled`.

---

## Known Holdings

### Current (Feb 2026)
| Fund | Units | Price | Market Value | P&L |
|---|---|---|---|---|
| Amova ARK Disruptive Innovation B SGD (formerly Nikko AM ARK) | 220.27 | 12.90 | SGD 2,841.48 | -SGD 3,551.08 (-55.55%) |

### Historical (Dec 2021)
| Fund | Units | Price | Market Value | P&L |
|---|---|---|---|---|
| Nikko AM ARK Disruptive Innovation B SGD | 223.59 | 18.09 | SGD 4,044.75 | -SGD 2,444.16 (-37.67%) |

**Note:** Same fund, different branding. `Nikko AM ARK Disruptive Innovation B SGD` was renamed to `Amova ARK Disruptive Innovation B SGD`. Treat as the same fund position in `asset_balances` — do not create a new record on rename.

---

## Asset Valuations Auto-Update

On every FSMOne statement import:
1. Update `asset_valuations` for each unit trust holding
2. Fields: `product_name`, `quantity`, `price`, `market_value_sgd`, `investment_amount_sgd`, `unrealised_pnl_sgd`, `valuation_date`
3. Update `investment_transactions` for any new subscriptions/redemptions in the period

---

## Statement Metadata Extraction

```
Account number       → P0439860
Cash account         → TAC2102070071
Statement period     → period_start, period_end
Issued date          → issued_date
Total UT Holdings    → total_unit_trust_value (SGD)
Total Portfolio      → total_portfolio_value (SGD)
Cash balance         → cash_balance (SGD, typically near 0)
```

---

## Validation

1. Sum of all unit trust market values = Total Unit Trust Holdings
2. Cash opening balance + deposits − withdrawals − fund subscriptions + redemptions + dividends = Cash closing balance

---

## Edge Cases

- **Fund rename:** Nikko AM ARK → Amova ARK. When historical data is imported, both names refer to the same fund. Match on ISIN or on quantity continuity, not fund name.
- **Near-zero cash balance:** SGD 0.03 cash balance in Feb 2026 — essentially empty. Normal.
- **"You have no transactions for the month":** Text present in Transaction page when no activity. Parse as empty result set, not an error.
- **Historical statements from 2021:** Address was different (Compassvale Link). Same account number P0439860 — treat as continuous history.
- **Issued date vs period end date:** Use period end date as the valuation date for asset_valuations, not the issued date (which is usually a few days later).

---

## Historical Import Notes

- Statements available from Dec 2021 (historical) and Feb 2026 (recent)
- Same account throughout — continuous P&L history
- Fund performance significantly negative (ARK fund down ~55% from cost)
- Idempotency guaranteed by `txn_hash`
