# Crypto.com Exchange — API Integration Profile

## Institution Metadata
| Field | Value |
|---|---|
| Institution Name | Crypto.com Exchange |
| Institution Code | `cryptocom` |
| Integration Type | **REST API** (read-only) |
| Account Type | `crypto_exchange` |
| API Docs | https://exchange-docs.crypto.com/exchange/v1/rest-ws/index.html |
| Base URL | `https://api.crypto.com/exchange/v1` |

---

## ⚠️ Important: Two Separate Crypto.com Products

Crypto.com has two distinct platforms with different APIs:

| Platform | API | Notes |
|---|---|---|
| **Crypto.com Exchange** | `api.crypto.com/exchange/v1` | For trading (spot, derivatives) |
| **Crypto.com App** (DeFi Wallet / Visa Card) | `api.crypto.com/v2` | For card spend, earn, DeFi |

**Clarify with Vivek which platform(s) he uses.** The profiles below cover both. If only Exchange is used, skip the App section.

---

## PART A: Crypto.com Exchange API

### Credentials Required

| Credential | How to Get | Storage |
|---|---|---|
| `api_key` | Exchange → Settings → API Keys → Create | Supabase Vault |
| `api_secret` | Generated with key | Supabase Vault |

**Required permissions:** Read-only. Disable all trading and withdrawal permissions.

### Authentication

Crypto.com Exchange uses HMAC-SHA256:

```python
import hmac, hashlib, time, json

def sign_request(api_key: str, secret: str, method: str, params: dict) -> dict:
    nonce = str(int(time.time() * 1000))
    param_str = ""
    if params:
        sorted_params = sorted(params.items())
        param_str = "".join(f"{k}{v}" for k, v in sorted_params)
    
    sig_payload = f"{method}{nonce}{api_key}{param_str}{nonce}"
    sig = hmac.new(secret.encode(), sig_payload.encode(), hashlib.sha256).hexdigest()
    
    return {
        "id": int(nonce),
        "method": method,
        "api_key": api_key,
        "params": params,
        "nonce": nonce,
        "sig": sig
    }
```

### Endpoints to Pull

#### 1. Account Balances
```
POST /private/user-balance
Body: { "params": {} }
```
Returns balances per instrument. Extract: `instrument_name`, `quantity`, `reserved_qty`

→ `asset_balances` per instrument

#### 2. Trade History
```
POST /private/get-trades
Body: { "params": { "instrument_name": "BTC_USDT", "start_time": <ms>, "end_time": <ms> } }
```
Extract: `trade_id`, `instrument_name`, `side` (BUY/SELL), `quantity`, `price`, `fee`, `fee_currency`, `create_time`

→ `investment_transactions`

#### 3. Deposit History
```
POST /private/get-deposit-history
Body: { "params": { "currency": "BTC", "start_ts": <ms>, "end_ts": <ms> } }
```
Extract: `currency`, `amount`, `address`, `txid`, `create_time`, `status`

Status 1 = pending, 5 = completed — only import status 5.

→ `txn_type = crypto_deposit`

#### 4. Withdrawal History
```
POST /private/get-withdrawal-history
Body: { "params": { "currency": "BTC", "start_ts": <ms>, "end_ts": <ms> } }
```
Extract: `currency`, `amount`, `fee`, `address`, `txid`, `create_time`, `status`

Status 5 = completed — only import status 5.

→ `txn_type = crypto_withdrawal`

### Pagination
Use `start_time` / `end_time` windows. Most endpoints return max 200 records per call. Chunk into 30-day windows for history pulls.

---

## PART B: Crypto.com App API (if applicable)

**Base URL:** `https://api.crypto.com/v2`

### App-Specific Features
- **Visa Card transactions** — spending in fiat and crypto cashback
- **Earn** — locked staking with interest
- **DeFi Wallet** — on-chain holdings

### App API Authentication
Uses OAuth2 / personal access token. Vivek would generate from the App → Settings → API.

### App Endpoints

#### Card Transactions
```
GET /card/statement
```
→ Card spend = real-world purchases. These are **spending transactions**, not crypto trades.
→ Category = depends on merchant
→ Cashback in CRO token = `txn_type = crypto_cashback`, category `Refunds`

#### Earn / Staking
```
GET /earn/orders
```
→ Earn deposits = `txn_type = crypto_deposit` (locked)
→ Interest earned = `txn_type = staking_reward`, category `Interest` or `Dividends`

---

## Data Model Mapping

| API Field | Wealth House Field | Table |
|---|---|---|
| `instrument_name` (e.g., BTC_USDT) | `symbol` | `investment_transactions` |
| `side` (BUY/SELL) | `direction` | `investment_transactions` |
| `price` + `quantity` | `price`, `quantity` | `investment_transactions` |
| `fee` + `fee_currency` | `fee_amount`, `fee_currency` | `investment_transactions` |
| `create_time` | `transaction_datetime` | `investment_transactions` |
| `txid` | `blockchain_txid` | `statement_transactions` |
| Card merchant | `merchant` | `merchants` |

---

## Sync Schedule (n8n)

| Job | Frequency | Endpoint |
|---|---|---|
| Balance snapshot | Daily 00:00 SGT | `/private/user-balance` |
| Trade history | Daily, rolling 24h | `/private/get-trades` per instrument |
| Deposit/withdrawal | Daily, rolling 7-day | deposit + withdrawal history |
| Card transactions (App) | Daily | `/card/statement` |
| Full backfill | Once on setup | All, chunked monthly |

---

## CRO Token Handling

Crypto.com's native token CRO is used for:
- Staking for card tier benefits
- Cashback rewards
- Fee payment

Track CRO as a standard crypto asset. Cashback CRO = income (category `Refunds` or create `Crypto Cashback` sub-category).

---

## Edge Cases

- **Exchange vs App:** Transactions on the Exchange do not appear in the App API and vice versa. Both must be polled if both are used.
- **Instrument format:** Exchange uses `BTC_USDT` (underscore). App may use `BTC`. Normalise on import.
- **Soft-staking vs locked Earn:** Soft staking shows in balances as available. Locked Earn shows separately. Both should be captured.
- **Card cashback in CRO:** The cashback is typically a very small CRO credit — import as income, not a trade.
- **API rate limits:** Exchange allows 100 requests/second aggregate. Stay under 10/second for safety.
