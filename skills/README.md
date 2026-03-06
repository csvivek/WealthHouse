# Institution Parsing Profiles — Master Index

## Overview

This directory contains parsing profiles for all financial institutions connected to Wealth House. Each profile is the authoritative specification for how the Import Agent should parse that institution's statements.

**Household:** Vivek Palanisamy (Singapore)
**Last updated:** 2026-03-06

---

## Profile Registry

| File | Institution | Code | Account Type | Format | Status |
|---|---|---|---|---|---|
| `trust-bank-cc.md` | Trust Bank Singapore | `trust_bank` | Credit Card | PDF (ZIP/JPEG + TXT) | Active |
| `dbs-cc.md` | DBS Bank — Credit Cards | `dbs_cc` | Credit Card (multi-card) | PDF (ZIP/JPEG) | Active |
| `dbs-bank.md` | DBS Bank — Consolidated | `dbs_bank` | Savings + SRS + Multi-currency | PDF (ZIP/JPEG) | Active |
| `maribank.md` | MariBank | `maribank` | Savings + Investment | PDF (ZIP/JPEG) | Active |
| `youtrip.md` | YouTrip | `youtrip` | Digital Wallet (multi-currency) | PDF (ZIP/JPEG) | Active |
| `ocbc-savings.md` | OCBC — Savings | `ocbc_savings` | Savings | PDF (ZIP/JPEG) | Active |
| `ocbc-easicredit.md` | OCBC — EasiCredit | `ocbc_easicredit` | Revolving Credit Line | PDF (ZIP/JPEG) | Active |
| `ocbc-balance-transfer.md` | OCBC — Balance Transfer | `ocbc_balance_transfer` | Balance Transfer Loan | PDF (ZIP/JPEG) | Active (9403) / Closed (9334) |
| `hsbc-cc.md` | HSBC Visa Revolution CC | `hsbc_cc` | Credit Card | PDF (ZIP/JPEG) | Active |
| `hsbc-loc-composite.md` | HSBC Line of Credit + Composite | `hsbc_loc` / `hsbc_composite` | Credit Line (Liability) + Portfolio Summary | PDF (ZIP/JPEG) | Active |
| `gxs-flexiloan.md` | GXS FlexiLoan | `gxs_flexiloan` | Instalment Loan (Liability) | PDF (ZIP/JPEG + TXT) | Active |
| `citibank.md` | Citibank — Bank + CC + Ready Credit | `citi_bank` / `citi_cc` / `citi_ready_credit` | Savings + Credit Card + Credit Line | PDF (ZIP/JPEG + TXT) | Active |
| `cimb-cc.md` | CIMB World Mastercard | `cimb_cc` | Credit Card | PDF (ZIP/JPEG + TXT) | Active |
| `dbs-paylah.md` | DBS PayLah! | `dbs_paylah` | Digital Wallet | PDF (ZIP/JPEG + TXT) | Active |
| `uob-cc.md` | UOB KrisFlyer CC | `uob_cc` | Credit Card | PDF (ZIP/JPEG + TXT) | Active |
| `moomoo.md` | MooMoo (Futu Securities) | `moomoo` | Investment — Margin Account | PDF (ZIP/JPEG + TXT) | Active |
| `fsmone.md` | FSMOne (iFAST Financial) | `fsmone` | Investment — Unit Trust | PDF (ZIP/JPEG + TXT) | Active |
| `wise.md` | Wise (SGD + USD wallets) | `wise` | Digital Wallet (multi-currency) | PDF (ZIP/JPEG + TXT) | Active |
| `icici-demat.md` | ICICI Securities Demat (NSDL) | `icici_demat` | India Demat Account | PDF (ZIP/JPEG + TXT) | Active |
| `binance-api.md` | Binance | `binance` | Crypto Exchange | **REST API** | Active |
| `woo-api.md` | WOO Network | `woo` | Crypto Exchange | **REST API** | Active |
| `cryptocom-api.md` | Crypto.com | `cryptocom` | Crypto Exchange + App | **REST API** | Active |

---

## Account Registry

| Institution Code | Account / Card Identifier | Currency | Type | Status |
|---|---|---|---|---|
| `trust_bank` | Trust CC (single card) | SGD | Credit Card | Active |
| `dbs_cc` | DBS YUU Amex 3779 111725 03891 | SGD | Credit Card | Active |
| `dbs_cc` | DBS YUU Visa 4119 1100 0437 6684 | SGD | Credit Card | Active |
| `dbs_bank` | DBS Savings 025-6-041461 | SGD | Savings | Active |
| `dbs_bank` | DBS MySavings 590-01166-5 | SGD | Savings | Active |
| `dbs_bank` | DBS eMulti-Currency 120-241729-0 | SGD + USD | Multi-currency Savings | Active |
| `dbs_bank` | DBS SRS 0120-224032-5-223 | SGD | SRS (Investment) | Active |
| `maribank` | MariBank Savings 123 443 293 | SGD | Savings | Active |
| `maribank` | MariBank Invest 800 020 5960-101 | SGD | Investment (Lion-MariBank SavePlus) | Active |
| `youtrip` | YouTrip Y-8165564547 / Y-8128929544 | SGD + multi | Digital Wallet | Active |
| `ocbc_savings` | OCBC Savings 644149312001 | SGD | Savings | Active |
| `ocbc_easicredit` | OCBC EasiCredit 633592357001 | SGD | Credit Line (Liability) | Active |
| `ocbc_balance_transfer` | OCBC BT 9900-0000-0342-9403 | SGD | Balance Transfer Loan (Liability) | Active |
| `ocbc_balance_transfer` | OCBC BT 9900-0000-0333-9334 | SGD | Balance Transfer Loan (Liability) | **Closed** |
| `hsbc_cc` | HSBC Visa Revolution 4835-8500-1324-1873 | SGD | Credit Card | Active |
| `hsbc_loc` | HSBC Line of Credit 048-266308-492 | SGD | Credit Line (Liability) | Active |
| `hsbc_composite` | HSBC Composite Statement (portfolio summary) | SGD | Summary only | Active |
| `gxs_flexiloan` | GXS FlexiLoan 800-143650-29 — RAJ loan | SGD | Instalment Loan (Liability) | Closed (paid off Mar 2025) |
| `gxs_flexiloan` | GXS FlexiLoan 800-143650-29 — InvestVik loan | SGD | Instalment Loan (Liability) | Active |
| `citi_bank` | Citibank Wealth First Account 0801331245 | SGD | Savings (pass-through) | Active |
| `citi_cc` | Citi Rewards World Mastercard 5425-5030-0370-4615 | SGD | Credit Card | Active |
| `citi_ready_credit` | Citibank Ready Credit 1-905379-255 | SGD | Credit Line (Liability) | Active |
| `cimb_cc` | CIMB World Mastercard 5452-3400-0104-7291 | SGD | Credit Card | Active |
| `dbs_paylah` | DBS PayLah! Wallet 8888880029489932 | SGD | Digital Wallet | Active |
| `uob_cc` | UOB KrisFlyer CC 5401-9180-1054-9282 | SGD | Credit Card | Active |
| `moomoo` | MooMoo Margin Account 1008200162367675 | SGD + USD | Investment | Active |
| `fsmone` | FSMOne Account P0439860 | SGD | Unit Trust Investment | Active |
| `wise` | Wise SGD Wallet 851-681-7 | SGD | Digital Wallet | Active |
| `wise` | Wise USD Wallet 8312964069 | USD | Digital Wallet | Active |
| `icici_demat` | ICICI Demat IN302902-47821677 | INR | India Demat | Active |

---

## File Format: ZIP-wrapped PDF

All statements from Singapore institutions in this system are delivered as **PDF files that are actually ZIP archives** containing JPEG images (and occasionally a `.txt` file for page 1 metadata).

**Important upgrade:** Newer statements now include `manifest.json` + `.txt` files inside the ZIP. The TXT files contain machine-readable transaction data — **always prefer TXT over OCR/vision** when available. Fall back to JPEG vision only when TXT is empty or absent.

**Pre-processing required before parsing:**
1. Detect file type: `file <filename>` — if "Zip archive data", unzip before processing
2. Extract all `.jpeg` and `.txt` files from the ZIP
3. For `.txt` files: use directly as text (metadata/summary page)
4. For `.jpeg` files: use vision/OCR for all content
5. Process pages in order (1.jpeg → 2.jpeg → 3.jpeg → ...)

**Parser entry point:**
```python
def parse_statement(filepath: str) -> StatementResult:
    if is_zip(filepath):
        pages = extract_zip_pages(filepath)  # returns list of (page_num, content_type, content)
    else:
        pages = extract_pdf_pages(filepath)
    
    institution = detect_institution(pages[0])  # identify from page 1
    profile = load_profile(institution)
    return profile.parse(pages)
```

---

## Institution Detection (Page 1 Fingerprints)

| Fingerprint on Page 1 | Institution Code |
|---|---|
| "trust" logo + "Trust Bank Singapore Limited" | `trust_bank` |
| DBS logo + "Credit Cards / Statement of Account" | `dbs_cc` |
| DBS + POSB logos + "Consolidated Statement" | `dbs_bank` |
| MariBank logo + "Deposit and Investment Statement" | `maribank` |
| YouTrip logo + "My SGD Statement" | `youtrip` |
| OCBC logo + "STATEMENT SAVINGS" | `ocbc_savings` |
| OCBC logo + "EASICREDIT / STATEMENT OF ACCOUNT" | `ocbc_easicredit` |
| OCBC logo + "BALANCE TRANSFER" section header | `ocbc_balance_transfer` |
| "Account Information" + "Account Type Margin" in 1.txt | `moomoo` |
| "iFAST Financial" + "Consolidated Statement" | `fsmone` |
| "Wise Asia-Pacific" + "[CCY] statement" in 1.txt | `wise` |
| "ACCOUNT STATEMENT" + "NSDL" / "IN302902" in 1.txt | `icici_demat` |
| "HSBC VISA REVOLUTION" | `hsbc_cc` |
| "Account Statement" + "LINE OF CREDIT" (HSBC) | `hsbc_loc` |
| "Composite Statement" (HSBC) | `hsbc_composite` |
| "GXS FlexiLoan" | `gxs_flexiloan` |
| "SUMMARY OF YOUR CITIBANK ACCOUNT" in 1.txt | `citi_bank` |
| "CITI REWARDS WORLD MASTERCARD" in 2.txt | `citi_cc` |
| "CITIBANK READY CREDIT" in 2.txt | `citi_ready_credit` |
| "CIMB WORLD MASTERCARD" in 1.txt | `cimb_cc` |
| "PayLah! Statement of Account" in 1.txt | `dbs_paylah` |
| "KRISFLYER UOB CREDIT CARD" in 1.txt | `uob_cc` |

---

## Advance Counterparties

The following named individuals appear in bank transfers and are tracked via the Advances system:

| Name | Appears In | Nature |
|---|---|---|
| Angappan Saravanan | DBS Bank transfers | Friend — bilateral advances |
| Rathinasababathi Rathika | DBS Bank FAST transfers | Friend — bilateral advances |
| Various (ICA visa payments) | Trust Bank CC | Vivek pays ICA fees for others; reimbursed as advances |

**Rule:** Any outgoing transfer to a named individual not identified as an own-account transfer should be flagged for the Advances agent.

---

## Asset Valuations — Auto-Update Triggers

The following investment positions are auto-updated in `asset_valuations` on every statement import:

| Asset | Source Statement | Fields Captured |
|---|---|---|
| DBS SRS — FRK India A (ACC) SGD | DBS Consolidated | qty, total_cost, market_value, unrealised_pnl |
| DBS SRS — FRK Tech A (ACC) S$-H1 | DBS Consolidated | qty, total_cost, market_value, unrealised_pnl |
| DBS SRS — FTIF-China FD A | DBS Consolidated | qty, total_cost, market_value, unrealised_pnl |
| DBS SRS — Nikko Japan Div Eqty S$ Hedged | DBS Consolidated | qty, total_cost, market_value, unrealised_pnl |
| Lion-MariBank SavePlus | MariBank | unit_holdings, unit_price, market_value |
| MooMoo — US Equities (AMZN, BA, EQIX, GOOGL, MA, etc.) | MooMoo daily/monthly | qty, price, position_value_usd, position_value_sgd |
| MooMoo — SGD Funds (LionGlobal, Fullerton) | MooMoo monthly | units, nav, market_value_sgd |
| MooMoo — USD Funds (CSOP USD MMF) | MooMoo monthly | units, nav, market_value_usd |
| FSMOne — Amova ARK Disruptive Innovation B SGD | FSMOne monthly | qty, wac, market_value_sgd, pnl_sgd |

---

## Liability Accounts

The following accounts are **liabilities** and reduce net worth:

| Account | Outstanding (approx) | Notes |
|---|---|---|
| OCBC EasiCredit 633592357001 | ~SGD 37,000 | Revolving credit line |
| OCBC BT 9900-0000-0342-9403 | ~SGD 47,000 | 0% promotional rate BT |
| OCBC BT 9900-0000-0333-9334 | SGD 0 | **Closed** — history retained |
| HSBC Line of Credit 048-266308-492 | ~SGD 104,000 | 22.90% p.a. revolving LoC |
| GXS FlexiLoan — InvestVik | ~SGD 101,000 | 3.80% p.a. instalment loan, ends Jun 2030 |
| Citibank Ready Credit 1-905379-255 | ~SGD 1,825 | Revolving credit line |

Balance sign convention: stored as positive in DB; ledger service applies liability sign at net worth computation time.

---

## Historical Import Rules

1. **Idempotency:** Re-importing any statement is safe — `txn_hash` uniqueness prevents duplicates
2. **Closed accounts:** Retain full history; `account_status = closed` but no records deleted
3. **Format drift:** If a historical statement uses a different layout, route to exceptions rather than fail silently — note the date range of the format change in this file
4. **FX rates for historical USD:** Use the rate printed in the DBS Consolidated Statement for that period. Do not apply current or user-overridden rates to historical statements retroactively.
5. **Historical asset valuations:** Each DBS Consolidated and MariBank statement import creates a dated `asset_valuations` row — this builds a full NAV history over time

---

---

---

## Integration Types

| Type | Description | Institutions |
|---|---|---|
| **PDF (ZIP/JPEG)** | Legacy format — image-only ZIP | Trust Bank (old), DBS CC, DBS Bank, MariBank (old), YouTrip, OCBC, HSBC, UOB |
| **PDF (ZIP/JPEG + TXT)** | Current format — ZIP with embedded text | Most Singapore banks, MooMoo, FSMOne, GXS, Citibank, CIMB, PayLah |
| **Native PDF** | Real PDF — text extractable via pdfplumber | Trust Bank (new), MariBank (new) |
| **REST API** | Live API connection — no file upload needed | **Binance, WOO, Crypto.com** |
| **CSV** | Exported transaction CSV | Instarem, Revolut, YouTrip (alternate), crypto exchanges |
| **Manual** | No import — balance entered manually | CPF, Morgan Stanley Stock Plan |


## ⚠️ Dual Format Warning: Trust Bank & MariBank

**Trust Bank CC** and **MariBank** both exist in TWO file formats:

| Format | Period | Detection |
|---|---|---|
| ZIP archive (JPEG + TXT pages) | Early statements (up to ~Feb 2025) | `file` → "Zip archive data" |
| Native text PDF | Feb 2025 / Mar 2025 onwards | `file` → "PDF document" |

**The import parser must detect the format before choosing extraction path.**
Content/columns are identical — only the wrapper changes. See individual profiles for details.


## Institutions Pending Profiles

The following institutions from the Wealth House brief do not yet have parsing profiles. Profiles will be created as sample statements are provided.

**Singapore:**
- ~~UOB~~ ✓, ~~OCBC savings/EasiCredit/BT~~ ✓, ~~Citibank~~ ✓, ~~HSBC~~ ✓, ~~CIMB~~ ✓, ~~GXS~~ ✓
- ~~MooMoo~~ ✓, ~~FSMOne~~ ✓, ~~Wise~~ ✓, ~~ICICI Demat~~ ✓
- Pending: OCBC CC (regular credit card), Maybank
- Revolut, Instarem, Wise, BigPay, PayLah
- Atome
- MooMoo, FSMOne
- CPF (manual balance only — no import)
- Morgan Stanley Stock Plan (manual + vesting)

**India:**
- ICICI, HDFC, Karur Vysya Bank, IPPB
- Paytm, PhonePe
- Kite (Zerodha), Coin (Zerodha), ICICIDirect, AngelOne

**Crypto:**
- Binance, WOO, StraitsX, Coinhako, Coinbase, Crypto.com, KuCoin

---

## Pending: Password-Protected Statement

`Statement_2026MTH02_84951452.pdf` (password: `001601528768`) has been mentioned but not yet synced to the project. Once available:
1. Decrypt with: `qpdf --password=001601528768 --decrypt input.pdf output.pdf`
2. Detect institution from page 1 content
3. Build or match to existing profile

