/**
 * Hybrid AI — TradingView Webhook Server
 *
 * Receives alerts from three Pine scripts:
 *   - Optimized Auto Hybrid AI strategy   (10m, primary executor)
 *   - Hybrid AI base indicator            (any TF, context notifications)
 *   - Hybrid AI — Supercator Edition      (15m, rich SL/TP/score payload)
 *
 * For each inbound alert:
 *   1. Validate the shared secret
 *   2. Normalize the payload across the three sources
 *   3. Cross-check against rules.json + today's trade count
 *   4. Append a row to trades.csv
 *   5. Email the user via Resend
 *   6. Optionally forward to ALERT_WEBHOOK_URL (Discord / Slack / GHL)
 *
 * Deploy on Hostinger VPS behind Nginx + Let's Encrypt, or use a Cloudflare
 * Tunnel for instant HTTPS. TradingView REQUIRES HTTPS for webhook URLs.
 *
 * Local test:  node server.js
 * Health:      GET  /healthz
 * Webhook:     POST /tv-webhook   (body: JSON, see docs/tradingview-alerts.md)
 */

import "dotenv/config";
import { createServer } from "node:http";
import { loadRules, evaluate } from "./lib/rules.js";
import { normalize } from "./lib/normalize.js";
import { appendRow, ensureCsv, countTodaysExecutedTrades, etDate, etTimeString } from "./lib/csv.js";
import { sendAlert, forwardWebhook } from "./lib/email.js";
import { buildSubject, buildBody } from "./lib/format.js";

const PORT = parseInt(process.env.WEBHOOK_PORT ?? "3000", 10);
const SECRET = process.env.TV_WEBHOOK_SECRET ?? "";
const PAPER = process.env.PAPER_TRADING !== "false";

if (!SECRET) {
  console.warn(
    "⚠️  TV_WEBHOOK_SECRET is not set. Anyone who finds your URL can fire trades. Set it before opening port 3000 to the internet.",
  );
}

ensureCsv();

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 64_000) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(data);
      }
    });
    req.on("error", reject);
  });
}

function jsonResponse(res, code, body) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function handleWebhook(req, res) {
  let raw;
  try {
    raw = await readJsonBody(req);
  } catch (err) {
    return jsonResponse(res, 400, { ok: false, error: err.message });
  }

  // Validate secret — accept from body, query, or header
  const url = new URL(req.url, `http://${req.headers.host}`);
  const providedSecret =
    (raw && typeof raw === "object" && raw.secret) ||
    url.searchParams.get("secret") ||
    req.headers["x-webhook-secret"];

  if (SECRET && providedSecret !== SECRET) {
    return jsonResponse(res, 401, { ok: false, error: "Unauthorized" });
  }

  const payload = normalize(raw);
  console.log(
    `[hybrid-ai] ${payload.source}/${payload.action} ${payload.ticker} ${payload.tf}m @ ${payload.price}`,
  );

  let rules;
  try {
    rules = loadRules();
  } catch (err) {
    return jsonResponse(res, 500, { ok: false, error: err.message });
  }

  const tradesToday = countTodaysExecutedTrades();
  const maxPerDay = parseInt(process.env.MAX_TRADES_PER_DAY ?? "3", 10);
  const { decision, reasons, grade } = evaluate(payload, rules, tradesToday);

  const mode =
    decision === "GO"
      ? PAPER
        ? "PAPER"
        : "LIVE"
      : decision === "CONTEXT"
        ? "CONTEXT"
        : decision === "FOLLOWUP"
          ? "FOLLOWUP"
          : "BLOCKED";

  // Append CSV row for everything (audit trail)
  appendRow({
    date: etDate(),
    timeEt: etTimeString(),
    symbol: payload.ticker ?? "",
    tf: payload.tf ?? "",
    side: (payload.action ?? "").toUpperCase(),
    grade,
    score: payload.score ?? "",
    adx: payload.adx ?? "",
    mtfBias: payload.mtfBias ?? "",
    entry: payload.price ?? "",
    sl: payload.sl ?? "",
    tp1: payload.tp1 ?? "",
    tp2: payload.tp2 ?? "",
    tp3: payload.tp3 ?? "",
    status: decision,
    rHit: payload.action === "tp_hit" ? "TP" : payload.action === "sl_hit" ? "SL" : "",
    pnlR: "",
    mode,
    notes: `${payload.source}: ${reasons.join(" | ")}`,
  });

  // Email + webhook for GO, CONTEXT, and FOLLOWUP. NO-GO is silent (audit only).
  if (decision !== "NO-GO") {
    const subject = buildSubject(payload, decision, grade);
    const text = buildBody(payload, decision, reasons, tradesToday, maxPerDay);
    await sendAlert({ subject, text });
    await forwardWebhook({ ...payload, decision, grade });
  }

  return jsonResponse(res, 200, {
    ok: true,
    decision,
    grade,
    mode,
    tradesToday,
    reasons,
  });
}

const server = createServer(async (req, res) => {
  // Allow CORS for testing
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "POST, GET, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type, x-webhook-secret");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/healthz")) {
    return jsonResponse(res, 200, {
      ok: true,
      service: "hybrid-ai-webhook",
      paper_trading: PAPER,
      tv_secret_set: Boolean(SECRET),
      uptime_seconds: Math.floor(process.uptime()),
    });
  }

  if (req.method === "POST" && url.pathname === "/tv-webhook") {
    try {
      return await handleWebhook(req, res);
    } catch (err) {
      console.error("[hybrid-ai] handler error", err);
      return jsonResponse(res, 500, { ok: false, error: err.message });
    }
  }

  jsonResponse(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, () => {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Hybrid AI · TradingView Webhook Server");
  console.log(`  Listening on http://0.0.0.0:${PORT}`);
  console.log(`  Mode:      ${PAPER ? "📋 PAPER" : "🔴 LIVE"}`);
  console.log(`  Secret:    ${SECRET ? "set ✓" : "MISSING ✗"}`);
  console.log(`  Alert to:  ${process.env.ALERT_EMAIL ?? "(none)"}`);
  console.log(`  Rules:     rules.json`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  POST  /tv-webhook   — TradingView alert endpoint");
  console.log("  GET   /healthz      — liveness probe");
  console.log("═══════════════════════════════════════════════════════════\n");
});
