# WOO Network (WOO X) — API Integration Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | WOO Network / WOO X |
| Institution Code | `woo` |
| Integration Type | **REST API** (read-only) |
| Account Type | `crypto_exchange` |
| API Docs | https://docs.woo.org/ |
| Base URL | `https://api.woo.org` |

---

## API Credentials Required

| Credential | How to Get | Storage |
|---|---|---|
| `api_key` | WOO X → Profile → API → Create API Key | Supabase Vault (encrypted) |
| `api_secret` | Generated with key | Supabase Vault (encrypted) |

**Required permissions:** Read-only (`GET` requests only). Do not enable trading or withdrawal permissions.

---

## Authentication

WOO uses HMAC-SHA256. Every request requires:

```
Headers:
  x-api-key: <api_key>
  x-api-timestamp: <unix_ms>
  x-api-signature: <hmac_sha256>
```

Signature is computed over: `<timestamp>|<method>|<path>|<query_or_body>`

```python
import hmac, hashlib, time

def woo_sign(secret: str, method: str, path: str, params: str = "") -> tuple:
    ts = str(int(time.time() * 1000))
    msg = f"{ts}|{method}|{path}|{params}"
    sig = hmac.new(secret.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return ts, sig
```

---

## Endpoints to Pull

### 1. Account Holdings / Balances
```
GET /v1/client/holding
```
Returns all asset balances. Extract: `holding` (array of `token`, `holding`, `frozen`, `staking`, `pendingShortQty`, `pendingLongQty`)

→ Import into `asset_balances` per token

### 2. Trade History
```
GET /v1/client/trades
Params: symbol=<SPOT_BTC_USDT>&start_t=<ms>&end_t=<ms>&page=1&size=500
```
Returns filled trades. Extract: `id`, `symbol`, `side` (BUY/SELL), `executed_price`, `executed_quantity`, `executed_timestamp`, `fee`, `fee_asset`, `order_id`

→ Import into `investment_transactions`

### 3. Transaction History (Deposits & Withdrawals)
```
GET /v1/asset/history
Params: token=<BTC>&type=BALANCE&start_t=<ms>&end_t=<ms>&page=1&size=100
```
`type` can be: `BALANCE` (deposits/withdrawals), `COLLATERAL` (margin), `REWARD` (staking/earn)

Extract: `id`, `token`, `amount`, `tx_id`, `side` (DEPOSIT/WITHDRAW), `created_time`, `status`

→ `DEPOSIT` → `txn_type = crypto_deposit`  
→ `WITHDRAW` → `txn_type = crypto_withdrawal`

### 4. Staking / Earn (if used)
```
GET /v1/staking/yield
```
→ `txn_type = staking_reward`, category = `Dividends` or `Interest`

---

## Pagination

WOO uses page-based pagination (`page`, `size`). Max `size=500`. Iterate until response returns fewer than `size` records.

---

## Rate Limits

- Public: 10 requests/second
- Private: 10 requests/second per endpoint
- Recommended: 1 request per 200ms with exponential backoff on 429

---

## Symbol Format

WOO uses `SPOT_BASE_QUOTE` format:
- `SPOT_BTC_USDT` — Bitcoin priced in USDT
- `SPOT_ETH_USDT` — Ethereum priced in USDT
- `SPOT_WOO_USDT` — WOO token

For balance endpoint, assets are just `BTC`, `ETH`, `USDT`, `WOO`.

---

## Data Model Mapping

| API Field | Wealth House Field | Table |
|---|---|---|
| `token` + `holding` | `asset`, `quantity` | `asset_balances` |
| `frozen` | `quantity_locked` | `asset_balances` |
| `side` (BUY/SELL) | `direction` | `investment_transactions` |
| `executed_price` | `price` | `investment_transactions` |
| `executed_quantity` | `quantity` | `investment_transactions` |
| `executed_timestamp` | `transaction_datetime` | `investment_transactions` |
| `fee` + `fee_asset` | `fee_amount`, `fee_currency` | `investment_transactions` |
| `tx_id` | `blockchain_txid` | `statement_transactions` |

---

## Sync Schedule (n8n)

| Job | Frequency | Endpoint |
|---|---|---|
| Balance snapshot | Daily at 00:00 SGT | `/v1/client/holding` |
| Trade history | Daily, rolling 24h | `/v1/client/trades` per symbol |
| Deposit/withdrawal | Daily, rolling 7-day | `/v1/asset/history` |
| Full backfill | Once on setup | All endpoints, chunked by month |

---

## WOO Token Note

WOO is WOO Network's native token. Vivek may hold WOO for fee discounts or staking. Track as a regular crypto asset. Staking rewards → `txn_type = staking_reward`, category `Dividends`.

---

## Edge Cases

- **Futures positions:** WOO X supports perpetual futures. Separate endpoints exist under `/v1/futures/`. Confirm with Vivek if futures are used — if yes, add futures P&L tracking.
- **VIP fee tiers:** WOO offers 0-fee trading for WOO stakers. Fee field may be `0.00` legitimately — not a data error.
- **API versioning:** WOO API is on v1; check docs for v2 availability when implementing.
