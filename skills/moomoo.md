# MooMoo (Futu Securities Singapore) — Parsing Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | Futu Securities (Singapore) Pte. Ltd. |
| Institution Code | `moomoo` |
| Account Type | `investment` (Margin Account) |
| Base Currency | SGD |
| Country | SG |
| Statement Format | PDF (ZIP/JPEG + TXT — TXT is primary) |
| Statement Title | Account statement (daily or monthly) |
| Account Number | 1008200162367675 |
| Account Name | Universal Account (pre-2026) → Margin Account (7675) - Securities |

---

## Statement Frequency

MooMoo issues statements in two modes:
- **Daily statements** (when activity occurs) — filenames embed a single date: `10082001623676756YYYYMMDD<id>.pdf`
- **Monthly/period statements** — filenames like `Statement_YYYYMTHxx_<id>.pdf`

Both use identical internal structure. The statement period is always explicit in the content.

---

## File Structure

ZIP with TXT + JPEG per page. TXT is the primary data source.

| Page | Content |
|---|---|
| `1.txt` | Account summary, NAV, currency breakdown, position changes |
| `2.txt` | Position details by currency (Securities + Funds) |
| `3.txt` | Trade history (equities + funds), cash changes |
| `4.txt` | Additional cash detail, fund subscriptions/redemptions |
| `5.txt`+ | Continuation of trades / T&C footer |

---

## Page 1 Structure (Account Summary)

```
Account Information
Name               VIVEK PALANISAMY
Account Name       Margin Account (7675) - Securities
Account Number     1008200162367675
Account Type       Margin
Address            ...

Net Asset Value:   <SGD amount>
Base Currency:     SGD
Assets in Transit  <amount>
Portfolio Value    <amount>
Cash Balance       <amount>

Changes in Net Asset Value
Starting Net Asset Value  YYYYMMDD
  Equal to(SGD)    <amount>
  SGD              <amount>   exchange rate: <rate>
  USD              <amount>   exchange rate: <rate>
  HKD              <amount>   exchange rate: <rate>
  CNH              <amount>   exchange rate: <rate>
  JPY              <amount>   exchange rate: <rate>

Ending Net Asset Value  YYYYMMDD
  Equal to(SGD)    <amount>
  [same currency breakdown]

+ Changes in Cash  SGD   USD   HKD   CNH   JPY
  Buy Amount       ...
  Sell Amount      ...
  Subscription Amount ...
  Redemption Amount ...
  Cash In Out      ...
  [other rows]
```

### Date Format in Page 1
- `YYYYMMDD` with no separators (e.g., `20241108`, `20260130`)
- Always represents a specific date (daily statement) or period end (monthly)

---

## Page 2 Structure (Position Details)

### Securities (Stocks / ETFs)
```
Securities
Symbol  Exchange  Currency  Starting [Qty / Price / Value]  Ending [Qty / Price / Value]  Changes  Buy Qty  Sell Qty  Transfer In  Transfer Out
Amazon AMZN  US  USD  3  210.05  630.15  3  208.18  624.54  -5.61  0  0  0  0
...
```

### Funds
```
Funds
Symbol  Exchange  Currency  Starting [Qty / Price / Value]  Ending [Qty / Price / Value]  Changes  Buy Qty  Sell Qty  Transfer In  Transfer Out
CSOP USD Money Market Fund  SGXZ96797238  FD  USD  ...
LionGlobal Short Duration Bond Fund  SG9999016000  FD  SGD  ...
Fullerton SGD Liquidity Fund  SGXZ40088619  FD  SGD  ...
```

---

## Page 3 Structure (Trades)

### Equity Trades
```
Trades - Securities
Direction  Symbol  Exchange  Order Capacity  Currency  Date/Time  Price  Quantity  Amount

Direction  Fee summary line:
Total of Transaction Fee: <fee>  Number of Transactions: <n>  Transactions Amount: <amt>  Net Transactions Amount: <net>  Platform Fees: <x>  Settlement Fees: <x>  [SEC Fees / Trading Activity Fees / Consumption Tax]
```

### Fund Trades
```
Trades - Funds
Direction  Order ID  Symbol  Currency  Date/Time  Price  Quantity  Amount  Fee  GST
Subscription  <id>  CSOP USD Money Market Fund  SGXZ96797238  USD  YYYY/MM/DD HH:MM:SS  <nav>  <qty>  <amount>  0.00  0.00
```

### Cash Changes
```
Changes in Cash
[Currency]
Starting Cash / Ending Cash / Ending Settled Cash / Ending Unsettled Cash

Date/Time  Type  Amount  Comment
YYYY/MM/DD HH:MM:SS  Fund Subscription  -14,000.00  Fund Subscription#LionGlobal...
YYYY/MM/DD HH:MM:SS  Cash In Out  +14,000.00  <reference>
```

---

## Data Types to Import

### 1. Asset Valuations (from Page 2)
For each position (securities + funds), capture ending state:
- `symbol`, `exchange`, `currency`, `quantity`, `closing_price`, `position_value_local`, `position_value_sgd`
- Import into `asset_balances` / `asset_valuations` table
- Valuation date = statement end date

### 2. Investment Transactions (from Page 3)
For each trade:

| Trade Type | `txn_type` | Notes |
|---|---|---|
| Buy (equity) | `stock_buy` | Import to `investment_transactions` |
| Sell (equity) | `stock_sell` | Import to `investment_transactions` |
| Subscription (fund) | `fund_subscription` | Import to `investment_transactions` |
| Redemption (fund) | `fund_redemption` | Import to `investment_transactions` |
| `Cash In Out` (deposit) | `cash_deposit` | Maps to `statement_transactions` (transfer in) |
| `Cash In Out` (withdrawal) | `cash_withdrawal` | Maps to `statement_transactions` (transfer out) |

### 3. FX Rates (from Page 1)
Extract all exchange rates printed in the NAV section. Log to FX rate KB:
- `USD/SGD`, `HKD/SGD`, `CNH/SGD`, `JPY/SGD`
- Date = statement date

---

## Multi-Currency Handling

MooMoo is a **true multi-currency account**. Position values are held in their native currency (USD for US stocks) with SGD equivalents computed by MooMoo.

**Rule:** Store positions in native currency. Use MooMoo's own exchange rates (from page 1) for SGD equivalent computation. Do not apply user-provided FX rates to MooMoo positions.

---

## Known Holdings (from statements)

### US Equities (as of Nov 2024)
Amazon (AMZN), Boeing (BA), Equinix (EQIX), Alphabet-A (GOOGL), Mastercard (MA), Moderna (MRNA) — and others

### SGD Funds (as of Jan 2026)
- LionGlobal Short Duration Bond Fund (SG9999016000)
- Fullerton SGD Liquidity Fund (SGXZ40088619)

### USD Funds
- CSOP USD Money Market Fund (SGXZ96797238)

---

## Cash Flow to/from MooMoo

Cash deposits into MooMoo appear as:
- In MooMoo: `Cash In Out +<amount>` with reference code (e.g., `DDIIRGPC003202952k62x2395`)
- In source bank (Wise USD): `Sent money to Moomoo Financial Singapore Pte. Ltd.`

These should be linked via `transaction_links` as internal transfers.

---

## Statement Metadata Extraction

```
Account number     → 1008200162367675
Account name       → from header
Statement period   → Starting NAV date to Ending NAV date (YYYYMMDD)
Starting NAV (SGD) → from "Starting Net Asset Value / Equal to(SGD)"
Ending NAV (SGD)   → from "Ending Net Asset Value / Equal to(SGD)"
Currency rates     → from NAV section (USD, HKD, CNH, JPY to SGD)
```

---

## Validation

1. Starting NAV + Cash Changes + Position Value Changes = Ending NAV (approximately; may differ by rounding)
2. Each currency total position value × exchange rate = SGD equivalent
3. Net Asset Value = Portfolio Value + Cash Balance

---

## Edge Cases

- **Account rename:** Account was called "Universal Account" up to Dec 2024. From Jan 2026 onwards it appears as "Margin Account (7675) - Securities". Same account, same account number — do not create duplicate account records.
- **Assets in Transit:** Non-zero `Assets in Transit` (e.g., -4,857.59) means pending fund settlement. This is shown separately and temporarily reduces NAV — handle as unrealised, not a transaction.
- **Fees breakdown:** MooMoo shows itemised fees (Platform Fee, Settlement Fee, SEC Fee, Trading Activity Fee, Consumption Tax). Import fee total as part of the trade; store breakdown in metadata.
- **Fund trade prices:** Fund NAV prices have 4 decimal places (e.g., 1.1110). Store with full precision.
- **Date/Time in trades:** Full datetime `YYYY/MM/DD HH:MM:SS` — store as `transaction_datetime`.

---

## Historical Import Notes

- Statements available from Nov 2024 onwards (daily statements)
- Jan 2026 onwards: monthly format with more fund activity
- Account renamed but number unchanged — all history under one account record
- Idempotency guaranteed by `txn_hash` (use symbol + date + qty + price as hash components for trades)
