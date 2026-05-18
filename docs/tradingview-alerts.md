# TradingView Alert Setup — Hybrid AI

Three Pine scripts, three roles, one webhook endpoint.

| Script | Timeframe | Role | Sends |
|---|---|---|---|
| **Optimized Auto Hybrid AI** | 10m | **Executor** — primary trade signal | `source: "optimized"` |
| **Hybrid AI** (base indicator) | any TF (you choose) | **Context** — chart notifications | `source: "hybrid"` |
| **Hybrid AI — Supercator Edition** | 15m | **Rich alert** — score + SL + TP | `source: "supercator"` |

All three fire at the same webhook URL. The server normalizes them and routes:

- `optimized` → evaluated against `rules.json`, fires email + logs to `trades.csv` as `GO` or `NO-GO`
- `supercator` → same as optimized, but also captures `score`, `sl`, `tp1/2/3`
- `hybrid` → notification only (logged as `CONTEXT`, no trade impact)

---

## 1. Pick a webhook URL

TradingView **requires HTTPS** for webhook alerts. Three easy options:

- **Cloudflare Tunnel** (recommended, free, instant) — `cloudflared tunnel --url http://localhost:3000`
- **Hostinger VPS + Nginx + Let's Encrypt** — production setup, see `docs/setup-hostinger-webhook.md`
- **ngrok** for testing — `ngrok http 3000`

Once you have a URL, the webhook endpoint is:

```
POST https://YOUR-DOMAIN/tv-webhook
```

---

## 2. Set the secret

In your `.env`:

```env
TV_WEBHOOK_SECRET=pick_a_long_random_string_here_at_least_32_chars
```

Every alert payload must include this exact string in the JSON or it gets rejected with a 401.

---

## 3. Add the alert in TradingView

For each script, right-click chart → **Add alert**. Set the message body to one of the templates below. **Replace `YOUR_SECRET`** with the value from your `.env`.

### A. Optimized Auto Hybrid AI strategy (10m)

This is a **strategy**, so use the alert trigger:

- Condition: **Optimized Auto Hybrid AI**, Order fills only (or `alert() function calls only`)
- Once Per: **bar close**
- Webhook URL: `https://YOUR-DOMAIN/tv-webhook`

**Message:**

```json
{
  "source": "optimized",
  "secret": "YOUR_SECRET",
  "action": "{{strategy.order.action}}",
  "ticker": "{{ticker}}",
  "tf": "{{interval}}",
  "price": {{close}},
  "time": "{{timenow}}"
}
```

### B. Hybrid AI base indicator (any TF — context only)

Use the existing **🔴SV BUY ALERT 🔴** and **🔴SV SELL ALERT 🔴** alert conditions, but override the message:

**Buy alert message:**

```json
{
  "source": "hybrid",
  "secret": "YOUR_SECRET",
  "action": "buy",
  "ticker": "{{ticker}}",
  "tf": "{{interval}}",
  "price": {{close}},
  "time": "{{timenow}}"
}
```

**Sell alert message:** same shape, `"action": "sell"`.

### C. Hybrid AI — Supercator Edition (15m)

The Supercator already emits JSON when **Webhook JSON Alerts** is enabled in its inputs. To make it work with our server, **disable** `webhookMode` in the input panel and use this template instead so we can inject `source` + `secret`:

**Buy:**

```json
{
  "source": "supercator",
  "secret": "YOUR_SECRET",
  "action": "buy",
  "ticker": "{{ticker}}",
  "tf": "{{interval}}",
  "price": {{close}},
  "score": {{plot("Buy Score")}},
  "sl":   {{plot("Active SL")}},
  "tp1":  {{plot("Active TP1")}},
  "tp2":  {{plot("Active TP2")}},
  "tp3":  {{plot("Active TP3")}},
  "adx":  {{plot("ADX")}},
  "time": "{{timenow}}"
}
```

(If the Supercator's plot names don't match exactly, fall back to its built-in `webhookMode` JSON and our server will auto-tag it as `supercator` based on payload shape.)

**TP1 hit alert:**

```json
{ "source":"supercator", "secret":"YOUR_SECRET", "action":"tp_hit", "ticker":"{{ticker}}", "tf":"{{interval}}", "price":{{close}}, "tp":"TP1", "time":"{{timenow}}" }
```

**SL hit alert:**

```json
{ "source":"supercator", "secret":"YOUR_SECRET", "action":"sl_hit", "ticker":"{{ticker}}", "tf":"{{interval}}", "price":{{close}}, "time":"{{timenow}}" }
```

---

## 4. Test it

With the server running locally and a Cloudflare Tunnel pointed at it:

```bash
curl -X POST https://YOUR-DOMAIN/tv-webhook \
  -H "content-type: application/json" \
  -d '{
    "source": "supercator",
    "secret": "YOUR_SECRET",
    "action": "sell",
    "ticker": "NAS100",
    "tf": "15",
    "price": 22850.5,
    "score": 78,
    "sl": 22920,
    "tp1": 22785,
    "tp2": 22730,
    "tp3": 22650
  }'
```

You should see:

- A row appended to `trades.csv`
- An email to `ALERT_EMAIL` (or a console log if `RESEND_API_KEY` is unset)
- A `200` response with `decision`, `grade`, and `reasons`

---

## 5. Hostinger production deploy (later)

When you're ready to leave it always-on, see `docs/setup-hostinger-webhook.md`. Short version: clone repo on VPS, `npm install`, set env, run with `pm2 start server.js --name hybrid-ai`, front with Nginx + Certbot for HTTPS.
