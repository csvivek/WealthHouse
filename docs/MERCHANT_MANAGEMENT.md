# Merchant Management

## Overview

WealthHouse now stores merchants as a household-scoped canonical entity:

- `merchants`: canonical merchant records shown in the UI
- `merchant_aliases`: raw/source merchant variants mapped to a canonical merchant
- committed `statement_transactions`, `receipts`, and `ledger_entries` keep original raw text and also link to `merchant_id`

Canonical merchant names are used for display when available. Raw merchant text remains preserved for auditability and future reprocessing.

## Normalization

Merchant normalization is intentionally conservative.

- `normalizeMerchantAlias()` normalizes a raw merchant string for alias matching.
- `normalizeMerchantCanonicalName()` removes safe noise such as legal suffixes, SG suffixes, separator-based branch decorations, and trailing outlet numbers.
- `deriveMerchantDisplayName()` creates the initial user-facing canonical name for new merchants.

Examples:

- `MCDONALDS #2341` -> canonical normalized `mcdonalds`
- `STARBUCKS - Plaza Sing` -> canonical normalized `starbucks`
- `McDonalds Anchorvale Crescent` stays distinct until a user merges it

The system does not auto-merge purely on fuzzy family similarity. Exact alias or exact canonical normalized matches are required for automatic reuse.

## Merge Behavior

Merchant merges are implemented through database functions:

- `merchant_merge_preview(victim, survivor)`
- `merge_merchant_safe(victim, survivor, actor)`
- `delete_merchant_safe(merchant)`

Merge behavior:

- reassigns linked `statement_transactions`
- reassigns linked `receipts`
- reassigns linked `ledger_entries`
- reassigns `receipt_merchant_kb` rows when present
- reassigns optional legacy merchant-linked tables when present
- deduplicates aliases already owned by the survivor
- soft-merges the victim by setting `merged_into_merchant_id` and `is_active = false`

## Backfill

Backfill is available through:

- `POST /api/merchants/backfill`

Backfill scans existing committed statement transactions and receipts for the current household:

- reuse canonical merchants when an exact normalized alias already exists
- reuse canonical merchants when the canonical normalized name already exists
- create merchants and aliases when missing
- populate missing `merchant_id`
- refresh `statement_transactions.merchant_normalized`
- sync linked `ledger_entries.merchant_id` / `merchant_display` from committed statement or receipt links

The routine is idempotent and intentionally avoids unsafe fuzzy merges.

## Important Notes

- Merchant scope is household-level only.
- Canonical merchant truth lives in the database, not in the legacy merchant knowledge JSON files.
- Staging rows remain raw; canonical linkage happens only when statement rows are committed or receipts are approved.
