# Wise — Parsing Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | Wise Asia-Pacific Pte Ltd |
| Institution Code | `wise` |
| Account Type | `digital_wallet` (multi-currency) |
| Base Currency | Multi (SGD + USD, potentially others) |
| Country | SG |
| Statement Format | PDF (ZIP/JPEG + TXT — TXT is primary) |
| Statement Title | "[CCY] statement" |
| SGD Account Number | 851-681-7 |
| USD Account Number | 8312964069 |
| Swift/BIC (USD) | CMFGUS33 |
| Swift/BIC (SGD) | TRWISGSGXXX |
| Bank Code (SGD) | 0516 |

---

## One Profile, Multiple Currency Statements

Wise issues **one statement per currency wallet** per period. Vivek has at minimum:
- `balance_statement.pdf` — SGD wallet
- `balance_statement_usd.pdf` — USD wallet

Each file covers the same calendar period (2025-01-01 to 2025-12-31 in samples).

---

## File Structure

ZIP with single page: `1.txt` + `1.jpeg`. Statement is always 1 page per currency.

---

## TXT Structure

```
ref:<uuid> 1 / 1
Wise Asia-Pacific Pte Ltd.
2 Tanjong Katong Road, #07-01, PLQ3
Singapore 437161

[CCY] statement
DD Month YYYY [GMT+08:00] - DD Month YYYY [GMT+08:00]
Generated on: DD Month YYYY

Account Holder: Vivek Palanisamy
...

Account number: <account_number>
[Bank code / Wire routing / Swift details]

[CCY] on DD Month YYYY [GMT+08:00]  <closing_balance> [CCY]

Description                                    Incoming    Outgoing    Amount
<description line 1>
<description line 2 — date + transaction ref>
                                               <amount>    <amount>    <running_amount>
```

---

## Column Structure

| Column | Notes |
|---|---|
| `Description` | Multi-line: Line 1 = human description; Line 2 = date + `Transaction: <ref>` |
| `Incoming` | Credit to wallet (positive) |
| `Outgoing` | Debit from wallet (shown as negative, e.g., `-12,903.12`) |
| `Amount` | Running balance |

---

## Date Parsing

- Transaction date is on **line 2 of description**: `DD Month YYYY` (e.g., `28 December 2025`)
- Statement period format: `DD Month YYYY [GMT+08:00]`
- Full year always present — no inference needed

---

## Transaction Reference

Each transaction has `Transaction: <ref>` on line 2 (e.g., `Transaction: TRANSFER-1891928488`, `Transaction: BALANCE-4547085581`).
Store as `reference`.

---

## Transaction Type Detection

| Description Pattern | `txn_type` | Notes |
|---|---|---|
| `Sent money to <name>` | `transfer_out` | Outgoing transfer |
| `Converted X [CCY1] to Y [CCY2]` | `fx_conversion` | Currency exchange between Wise wallets |
| `Received money from <bank> with reference <ref>` | `transfer_in` | Incoming wire/FAST |
| `Wise Charges for: <ref>` | `bank_charge` | Transfer/conversion fee |

### FX Conversion Handling (Critical)
Wise currency conversions appear as **two separate rows** across two currency statements:

In SGD statement:
```
Sent money to Vivek Palanisamy
Transaction: TRANSFER-1891928488
-12,903.12  0.00
Converted 10,075.00 USD to 12,903.12 SGD
```

In USD statement:
```
Converted 10,075.00 USD to 12,903.12 SGD (fee: 30.14 USD)
Transaction: BALANCE-4547085581
-10,044.86  0.00

Wise Charges for: BALANCE-4547085581
Transaction: FEE-BALANCE-4547085581
-30.14   10,044.86
```

**Rule:** Link the SGD and USD legs via `transaction_links`. Store:
- `original_amount`: 10,075.00 USD
- `converted_amount`: 12,903.12 SGD
- `fx_rate`: 12,903.12 / 10,075.00 = 1.2807 SGD/USD
- `conversion_fee_usd`: 30.14
- `txn_type`: `fx_conversion`

Log the FX rate to the KB: `1 USD = 1.2807 SGD (Wise, 28 Dec 2025)`.

---

## Cash Flow Context

### USD Wallet Flow (Dec 2025)
```
26 Dec: Received 10,075 USD from Bank of America (P2P reference)
28 Dec: Converted 10,075 USD → 12,903.12 SGD (fee 30.14 USD)
```

### SGD Wallet Flow (Dec 2025)
```
28 Dec: Received 12,903.12 SGD from USD conversion → sent to self
```

This is a **USD → SGD conversion** routed through Wise. The Bank of America USD credit is likely from Vivek's US stock proceeds (via MooMoo / DBS eMulti-Currency) or other USD income.

---

## Wise → MooMoo Transfer (May 2025)
The USD statement also shows:
```
Sent money to Moomoo Financial Singapore Pte. Ltd (fee: 121.05 USD)
Transaction: TRANSFER-1537930
```
This is a USD wire transfer from Wise USD wallet to MooMoo brokerage. Link to MooMoo `Cash In Out` transaction.

---

## Statement Metadata Extraction

```
Currency          → wallet_currency (from statement title "[CCY] statement")
Statement period  → period_start, period_end
Reference number  → statement_ref (uuid in header)
Account number    → currency-specific account number
Closing balance   → from "[CCY] on DD Month YYYY" line
```

---

## Multi-Wallet Account Model

Wise is **one account with multiple currency sub-wallets**:
- One `account` record: `wise` / Vivek Palanisamy
- Sub-wallets tracked by `currency` field on transactions
- Each currency statement = transactions for that sub-wallet only

---

## Validation

For each currency statement:
- Opening balance (implicit = 0 if not shown) + Incoming − Outgoing = Closing balance
- Match conversion pairs across currency statements (USD out = SGD in, same date)

---

## Edge Cases

- **Annual statements:** Both samples cover a full year (2025-01-01 to 2025-12-31). Statements may be annual or on-demand rather than monthly.
- **Outgoing shown as negative:** In the Amount column, outgoing appears as a negative running balance movement — parse the `Incoming`/`Outgoing` columns for direction, not the Amount column sign.
- **Fee as separate row:** Wise shows the conversion fee as a separate transaction row (`Wise Charges for: <ref>`) distinct from the conversion itself. Import as `bank_charge`.
- **Zero ending balance:** Both wallets end at 0.00 on Dec 31, 2025 — all funds were converted and moved out.
- **Reference format:** `TRANSFER-<id>` = wire/FAST; `BALANCE-<id>` = conversion; `FEE-<id>` = fee

---

## Historical Import Notes

- Only 2025 full-year statements available so far
- Format is consistent (single-page per currency)
- Future statements may cover different periods — period dates in header are authoritative
- Idempotency guaranteed by `txn_hash`
