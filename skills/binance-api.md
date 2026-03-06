# Binance — API Integration Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | Binance |
| Institution Code | `binance` |
| Integration Type | **REST API** (read-only) |
| Account Type | `crypto_exchange` |
| Base Currency | Multi (BTC, ETH, USDT, BNB, etc.) |
| API Docs | https://binance-docs.github.io/apidocs/spot/en/ |

---

## API Credentials Required

| Credential | How to Get | Storage |
|---|---|---|
| `api_key` | Binance → Profile → API Management → Create API | Supabase Vault (encrypted) |
| `api_secret` | Generated alongside API key (shown once) | Supabase Vault (encrypted) |

**Required API key permissions:** `Read Info` only. Never enable Spot Trading, Margin, or Withdrawal permissions on the read key.

**IP restriction:** Recommend locking the API key to the Wealth House backend server IP in Binance API settings.

---

## Base URL

```
https://api.binance.com
```

All requests require HMAC-SHA256 signature using `api_secret` and a `timestamp` parameter.

---

## Endpoints to Pull

### 1. Account Balances
```
GET /api/v3/account
Headers: X-MBX-APIKEY: <api_key>
Params: timestamp=<unix_ms>&signature=<hmac>
```
Returns all wallet balances. Filter for `free > 0 OR locked > 0`.

Extract: `asset`, `free` (available), `locked` (in orders)  
→ Import into `asset_balances` per asset

### 2. Spot Trade History (per symbol)
```
GET /api/v3/myTrades
Params: symbol=<BTCUSDT>&startTime=<ms>&endTime=<ms>&limit=1000&timestamp=...&signature=...
```
⚠️ **Symbol-by-symbol** — Binance requires you to specify a trading pair. Must iterate over all known pairs.

Extract per trade: `symbol`, `orderId`, `price`, `qty`, `quoteQty`, `commission`, `commissionAsset`, `time`, `isBuyer`  
→ Import into `investment_transactions`

### 3. Deposit History
```
GET /sapi/v1/capital/deposit/hisrec
Params: startTime=<ms>&endTime=<ms>&status=1&timestamp=...&signature=...
```
Extract: `coin`, `amount`, `network`, `address`, `txId`, `insertTime`  
→ `txn_type = crypto_deposit`, `direction = credit`

### 4. Withdrawal History
```
GET /sapi/v1/capital/withdraw/history
Params: startTime=<ms>&endTime=<ms>&status=6&timestamp=...&signature=...
```
Status 6 = completed. Extract: `coin`, `amount`, `fee`, `network`, `address`, `txId`, `applyTime`  
→ `txn_type = crypto_withdrawal`, `direction = debit`

### 5. Crypto → Fiat Convert History (if used)
```
GET /sapi/v1/convert/tradeFlow
Params: startTime=<ms>&endTime=<ms>&timestamp=...&signature=...
```
Extract: `fromAsset`, `fromAmount`, `toAsset`, `toAmount`, `ratio`, `createTime`  
→ `txn_type = crypto_convert`

### 6. Fiat Deposit/Withdrawal (if applicable)
```
GET /sapi/v1/fiat/orders
Params: transactionType=0 (deposit) or 1 (withdraw)
```

---

## Pagination & Rate Limits

- Most endpoints: max `limit=1000` records per call
- Use `startTime` / `endTime` windows (max 90 days per call for some endpoints)
- Rate limit: 1200 request weight per minute. Batch pulls should stay well under this.
- For trade history: iterate month-by-month windows across all active trading pairs

---

## Timestamp Format

All timestamps are **Unix milliseconds**. Convert to ISO 8601 at storage time.

```python
from datetime import datetime, timezone
dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
```

---

## Signature Generation

```python
import hmac, hashlib, time, urllib.parse

def sign(params: dict, secret: str) -> str:
    params['timestamp'] = int(time.time() * 1000)
    query = urllib.parse.urlencode(params)
    sig = hmac.new(secret.encode(), query.encode(), hashlib.sha256).hexdigest()
    return query + '&signature=' + sig
```

---

## Data Model Mapping

| API Field | Wealth House Field | Table |
|---|---|---|
| `asset` + `free` + `locked` | `asset`, `quantity_free`, `quantity_locked` | `asset_balances` |
| Trade `symbol`, `price`, `qty` | `symbol`, `price`, `quantity` | `investment_transactions` |
| Trade `isBuyer` | `direction` = buy/sell | `investment_transactions` |
| Trade `commission` + `commissionAsset` | `fee_amount`, `fee_currency` | `investment_transactions` |
| Trade `time` | `transaction_datetime` | `investment_transactions` |
| Deposit `txId` | `blockchain_txid` | `statement_transactions` |

---

## Sync Schedule (n8n)

| Job | Frequency | Endpoint |
|---|---|---|
| Balance snapshot | Daily at 00:00 SGT | `/api/v3/account` |
| Trade history | Daily, rolling 24h window | `/api/v3/myTrades` per pair |
| Deposit/withdrawal | Daily, rolling 7-day window | `/sapi/v1/capital/deposit/hisrec` + withdraw |
| Full historical backfill | Once on setup | All endpoints, chunked by month |

---

## FX Rate Handling

Binance trades are quoted in pairs (e.g., BTC/USDT, ETH/BTC). To get SGD equivalent:
1. If quote asset = USDT → apply USDT/SGD rate from KB
2. If quote asset = BTC → first convert BTC → USDT, then USDT → SGD
3. Log all conversion rates used at time of import to KB

---

## Edge Cases

- **Dust balances:** Very small balances below minimum trade size. Include in balance snapshot but flag as `is_dust = true` if below USD 1 equivalent.
- **BNB fee deductions:** Binance auto-uses BNB to pay fees if enabled. `commissionAsset = BNB` even on non-BNB trades.
- **Delisted pairs:** Some historical pairs may no longer be active. Store trades anyway; flag symbol as `status = delisted` if pair lookup fails.
- **Sub-accounts:** If Vivek uses Binance sub-accounts, each needs a separate API key.
- **Futures/Margin:** If applicable, separate endpoints exist (`/fapi/` for futures). Confirm with Vivek whether these are used.
