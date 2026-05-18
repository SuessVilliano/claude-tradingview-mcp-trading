/**
 * Local smoke test for server.js — sends one fake Supercator SELL signal.
 *
 * Usage:
 *   node server.js &
 *   node scripts/test-webhook.js
 */

import "dotenv/config";

const PORT = process.env.WEBHOOK_PORT ?? 3000;
const SECRET = process.env.TV_WEBHOOK_SECRET ?? "";
const URL = `http://localhost:${PORT}/tv-webhook`;

const payload = {
  source: "supercator",
  secret: SECRET,
  action: "sell",
  ticker: "NAS100",
  tf: "15",
  price: 22850.5,
  score: 78,
  sl: 22920,
  tp1: 22785,
  tp2: 22730,
  tp3: 22650,
  adx: 27,
  mtf_bias: "bear",
  time: new Date().toISOString(),
};

console.log("POST", URL);
console.log(payload);

const res = await fetch(URL, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});
const json = await res.json();
console.log("\nStatus:", res.status);
console.log(json);
process.exit(res.ok ? 0 : 1);
