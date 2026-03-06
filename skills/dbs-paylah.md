# DBS PayLah! — Parsing Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | DBS Bank Ltd |
| Institution Code | `dbs_paylah` |
| Account Type | `digital_wallet` |
| Currency | SGD |
| Country | SG |
| Statement Format | PDF (ZIP/JPEG + TXT — TXT is primary) |
| Statement Title | "PayLah! Statement of Account" |
| Wallet Account | 8888880029489932 |
| Mobile Number | 91112176 |
| Co. Reg. No. | 196800306E |
| GST Reg | MR-8500180-3 |

---

## File Structure

ZIP archive with TXT + JPEG. TXT contains all transaction data.
- `1.txt` → Full statement content (PRIMARY)
- `2.txt` → T&C footer (skip)
- Pages are image backups

---

## TXT Structure

```
PayLah!
Statement of Account
DBS Bank Ltd

VIVEK PALANISAMY
VIVEKPALANISSAMY@GMAIL.COM

STATEMENT DATE    MOBILE NUMBER    WALLET ACCOUNT
DD Mon YYYY       65XXXXXXXX       <wallet_number>

DATE    DESCRIPTION                          AMOUNT(S$)
PayLah! Wallet No. <wallet_number>
PREVIOUS BALANCE    <amount>

NEW TRANSACTIONS VIVEK PALANISAMY
DD Mon  <DESCRIPTION>
        REF NO.: <reference>
                                             <amount> CR/DB
```

---

## Column Structure

| Field | Format | Notes |
|---|---|---|
| `DATE` | `DD Mon` (no year) | Posting date |
| `DESCRIPTION` | Multi-line — line 1: description; line 2: `REF NO.: <ref>` | |
| `AMOUNT(S$)` | Positive + suffix `CR` (credit) or `DB` (debit) | Direction explicit |

---

## Date Parsing

- Format: `DD Mon` (e.g., `19 Feb`, `08 Nov`)
- Year inferred from `STATEMENT DATE` in header
- Statement date format: `DD Mon YYYY`

---

## Direction Detection

Unlike most wallets, PayLah! explicitly marks direction:
- `<amount> CR` → credit (money into wallet)
- `<amount> DB` → debit (money out of wallet)

No ambiguity — always use the suffix.

---

## Transaction Type Detection

| Description Pattern | `txn_type` | Notes |
|---|---|---|
| `PREVIOUS BALANCE` | skip | Opening balance |
| `Total :` | skip | Closing summary |
| `TOP UP WALLET FROM MY ACCOUNT` | `wallet_topup` | Internal transfer from DBS account |
| `AXS PAYMENT` | `bill_payment` | Bill paid via AXS through PayLah |
| `RECEIVE MONEY FROM <phone>` | `paynow_receive` | Incoming PayNow from phone number |
| `PAYNOW <name> PAYNOW TRANSFER` | `paynow_send` | Outgoing PayNow transfer |
| `HEENAA MEAT` (or any merchant name) | `purchase` | Direct payment to merchant |
| Any merchant purchase | `purchase` | Debit to merchant |

### AXS via PayLah — Special Handling
PayLah! is sometimes used to pay bills through AXS. The flow is:
1. `TOP UP WALLET FROM MY ACCOUNT` (wallet_topup — internal)
2. `AXS PAYMENT` (bill_payment — actual spend)

Both appear in the same statement with matching reference numbers. Link them via `transaction_links`.

**Note:** In the Mar 2026 sample, two AXS payments of SGD 686 each appear with matching top-ups in the same session — this is a double payment pattern (possibly paying two separate bills). Import both separately.

---

## Reference Number

Every transaction has `REF NO.: <alphanumeric>` on line 2. Store as `reference` field. Can be used to match wallet top-ups to corresponding bank account withdrawals in `transaction_links`.

---

## Statement Metadata Extraction

```
Statement date      → statement_date
Mobile number       → mobile_number (mask for storage)
Wallet account      → wallet_account_number
Email               → account_email
Opening balance     → PREVIOUS BALANCE
Closing balance     → from Total line
```

---

## Known Merchant Patterns

| Raw Description | Normalised | Category |
|---|---|---|
| `TOP UP WALLET FROM MY ACCOUNT` | DBS → PayLah Top-up | Internal Transfer |
| `AXS PAYMENT` | AXS Bill Payment | Bill Payment |
| `RECEIVE MONEY FROM 97715399` | PayNow Receipt | Transfer In |
| `PAYNOW MURUGAPPAN... PAYNOW TRANSFER` | PayNow to Murugappan | Transfer Out / Advance |
| `HEENAA MEAT` | Heenaa Meat (food merchant) | Groceries / Eating Out |

### PayNow Transfers — Advance Flagging
Any `PAYNOW <name> PAYNOW TRANSFER` outgoing should be reviewed:
- If name matches known advance counterparty → flag for Advances agent
- Otherwise → classify as `paynow_send` transfer

---

## Validation

- Opening balance + sum(CR) − sum(DB) = Closing balance (from `Total:` line)
- The `Total :` line shows net movement, not closing balance — calculate closing balance separately

---

## Edge Cases

- **`VIVEKPALANISSAMY@GMAIL.COM`:** Typo in statement (double S) — this is Vivek's actual registered email as shown by DBS. Not a data error.
- **Zero balance months:** If Vivek tops up and spends in the same session, the ending balance may be SGD 0. This is normal.
- **`Total : 0.00`:** In Mar 2026, total is 0 because top-ups exactly match AXS payments. Import all rows even if net is zero.
- **Short statement periods:** PayLah statements can be issued for specific date ranges rather than calendar months. Infer period from statement date and transaction dates.
- **Reference number truncation in TXT:** Some REF NO. values may be cut off in TXT extraction — use JPEG for verification if needed.

---

## Historical Import Notes

- Two samples: Nov 2025 (PDF_document_2) and Mar 2026 (PDF_document)
- Format consistent across both
- This is a relatively low-volume wallet — few transactions per statement
- Idempotency guaranteed by `txn_hash`
