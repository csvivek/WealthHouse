# ICICI Securities — Demat Account (NSDL) — Parsing Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | ICICI Bank / ICICI Securities (Demat) |
| Institution Code | `icici_demat` |
| Account Type | `demat_account` (India equity holdings) |
| Base Currency | INR |
| Country | IN |
| Statement Format | PDF (ZIP/JPEG + TXT — TXT is primary) |
| Statement Title | "Account Statement" |
| Account Number | IN302902 - 47821677 |
| Account Holder | P Vivek (P = Palanisamy) |
| Account Type | Resident/Ordinary (Non-House Beneficiary) |
| Custodian | NSDL (National Securities Depository Limited) |

---

## What Is This Statement?

This is a **NSDL demat account statement** — it shows equity share holdings and transactions (buy/sell/transfer) for Indian stocks held in demat form. This is different from a bank statement.

It does **not** show cash transactions — only:
- Opening/closing share balances per ISIN
- Corporate actions (bonus, split, rights)
- Transfers in/out (buying/selling)

**Cash flows** from Indian share trading appear in the ICICIDirect or broker trading account, not here.

---

## Statement Frequency

Monthly statements issued on the 1st of the following month, covering the prior calendar month.

---

## File Structure

ZIP with TXT + JPEG. Two files uploaded for July 2025 (may be split across two PDFs):
- `DividendStatement_20250701_20250731_1772769583319.pdf`
- `DividendStatement_20250701_20250731_1772769583319_2.pdf`

Both cover the same period (July 2025) — parse both and merge/deduplicate.

**Note:** Despite the filename containing "Dividend", this is the standard NSDL demat account statement (not a dividend advice). The filename appears to be ICICI's internal naming convention.

---

## TXT Structure (Page 1)

```
ACCOUNT STATEMENT
FIRST HOLDER NAME  P VIVEK         ACCOUNT NO.  IN302902 - 47821677
SECOND HOLDER NAME                 TYPE         Resident/Ordinary
THIRD HOLDER NAME                  STATEMENT DATE  Month DD, YYYY
CATEGORY  Non House Beneficiary    STATEMENT PERIOD  Month DD, YYYY to Month DD, YYYY
STATUS  Active                     NOMINATION AVAILED  NO
PORTFOLIO VALUE  ` <amount> as on <date>

Date       NSDL Ref. No.   Particulars                                    Request Placed At   Doc No.   Dr./Cr.   Quantity   Value
<ISIN line: INXXXXXXXXXX  <Company Name>  EQ <description>  (<price>)>
DD-Mon-YYYY  Opening Balance-Beneficiary Balance  <qty>
DD-Mon-YYYY  <ref>  <description>  Dr/Cr  <qty>
DD-Mon-YYYY  Closing Balance-Beneficiary Balance  <qty>  <value>
```

---

## Column Structure

| Column | Notes |
|---|---|
| `Date` | `DD-Mon-YYYY` (e.g., `01-Jul-2025`, `08-Jul-2025`) |
| `NSDL Ref. No.` | NSDL transaction reference (e.g., `10000041412817`) |
| `Particulars` | Transaction description |
| `Request Placed At` | Source of instruction (e.g., `ICICI SECURITIES LIMITED/ eDIS`) |
| `Doc No.` | Internal document reference |
| `Dr./Cr.` | `Dr` = shares debited (sold/transferred out), `Cr` = shares credited (bought/transferred in) |
| `Quantity` | Number of shares |
| `Value` | INR value (may be blank for some rows) |

---

## ISIN Block Structure

Transactions are grouped by ISIN. Each group starts with an ISIN header line:
```
INE776C01039  GMR AIRPORTS LIMITED  EQ NEW FV Re. 1/-  (Rs. 91.47)
```

Fields: `ISIN`, `Company Name`, `Share Type`, `Face Value`, `(Market Price as of statement date)`

Then transaction rows follow for that ISIN.

---

## Transaction Type Detection

| Particulars Pattern | `txn_type` | Notes |
|---|---|---|
| `Opening Balance-Beneficiary Balance` | skip | Opening holding |
| `Closing Balance-Beneficiary Balance` | skip | Closing holding — use for asset_valuations |
| `To ICICI SECURITIES LIMITED/ eDIS /Block Mechanism T+1` | `stock_sell_block` | Shares blocked for sale via eDIS |
| `From <broker>` | `stock_buy` | Shares received (purchase settled) |
| `Corporate Action - Bonus` | `corporate_action_bonus` | Bonus shares received |
| `Corporate Action - Dividend` | `corporate_action_dividend` | Dividend (shares — stock dividend) |
| `Transfer In` | `transfer_in` | Shares transferred in from another demat |
| `Transfer Out` | `transfer_out` | Shares transferred out |

### eDIS Block Mechanism
When Vivek sells shares, ICICI Securities first blocks them via eDIS (Electronic Delivery Instruction Slip) before settlement. The block appears as:
- `Dr 100` (debit/block, Day T)
- Settlement completes T+1 (may not appear in statement as a separate row)

---

## Asset Valuations

On each statement import, update `asset_valuations` for each ISIN:
- `isin`: e.g., `INE776C01039`
- `company_name`: e.g., `GMR Airports Limited`
- `closing_quantity`: from `Closing Balance` row
- `market_price_inr`: from the ISIN header line `(Rs. <price>)`
- `market_value_inr`: closing_quantity × market_price_inr
- `market_value_sgd`: calculated using INR/SGD rate at import time (user-provided or KB rate)
- `valuation_date`: statement period end date

---

## Portfolio Value

The header shows `PORTFOLIO VALUE ` <amount> as on <date>`. This is ICICI's computed total across all holdings. Import as a snapshot valuation.

Note: Currency symbol `\`` (backtick) in TXT represents the Indian Rupee symbol (₹) — normalise to `INR` in storage.

---

## Statement Metadata Extraction

```
Account number     → IN302902-47821677
Holder name        → P VIVEK = Vivek Palanisamy
Statement date     → issued_date
Statement period   → period_start, period_end
Portfolio value    → total_portfolio_value_inr
```

---

## Known Holdings (July 2025)

| ISIN | Company | Qty (Start) | Movement | Qty (End) |
|---|---|---|---|---|
| INE776C01039 | GMR Airports Limited | 100 | Sold (Dr 100 via eDIS) | 0 |

Full holding list requires reading complete statement — July 2025 shows balances for all ISINs with no movement.

---

## FX Handling

All values are in INR. For Wealth House net worth computation:
- Store values in INR natively
- Apply INR/SGD rate at display time (from KB or user-provided rate)
- Do **not** bake in a fixed conversion rate at import

---

## Edge Cases

- **Split PDFs:** Two PDF files for the same period — merge holdings; deduplicate by ISIN + date + quantity
- **`\`` symbol in TXT:** Represents ₹ (Indian Rupee) — always parse as INR
- **"Dividend Statement" filename:** Misleading filename — this is the standard NSDL demat statement, not just dividend advice
- **Opening Balance row with no NSDL ref:** These are balance-only rows, not transactions — skip for `investment_transactions` but use for validation
- **ISINs with no transactions:** Statement includes all held ISINs even if no activity — parse all `Closing Balance` rows to capture the full portfolio snapshot

---

## Historical Import Notes

- One period available: July 2025
- Format is standard NSDL format — very stable across brokers and time
- As more historical data is added, build full P&L history for each ISIN
- Idempotency guaranteed by `txn_hash`
