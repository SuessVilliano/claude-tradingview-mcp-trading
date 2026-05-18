/**
 * Normalize inbound TradingView webhook payloads from three sources:
 *
 *   - "optimized"   — Optimized Auto Hybrid AI strategy (10m, executor)
 *   - "hybrid"      — Hybrid AI base indicator (any TF, context)
 *   - "supercator"  — Hybrid AI Supercator Edition (15m, rich SL/TP/score)
 *
 * Returns a uniform shape the rest of the server can operate on.
 */

export function normalize(raw) {
  // Accept both JSON object and string (some TV configs double-encode)
  let body = raw;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = { _text: raw }; }
  }
  if (!body || typeof body !== "object") body = { _text: String(raw) };

  // Infer source if missing — Supercator is the only one that ships score+sl+tp1
  let source = body.source;
  if (!source) {
    if (body.score != null && body.sl != null && body.tp1 != null) source = "supercator";
    else if (body.action === "buy" || body.action === "sell") source = "hybrid";
    else source = "unknown";
  }

  const action = body.action ?? body.side ?? null; // "buy" | "sell" | "tp_hit" | "sl_hit"
  const ticker = body.ticker ?? body.symbol ?? null;
  const tf = body.tf ?? body.timeframe ?? null;
  const price = numOr(body.price ?? body.close, null);
  const score = numOr(body.score, null);
  const sl = numOr(body.sl ?? body.stopLoss, null);
  const tp1 = numOr(body.tp1, null);
  const tp2 = numOr(body.tp2, null);
  const tp3 = numOr(body.tp3, null);
  const adx = numOr(body.adx, null);
  const atr = numOr(body.atr, null);
  const mtf = body.mtf_bias ?? body.mtf ?? null;
  const time = body.time ?? body.time_iso ?? new Date().toISOString();

  return {
    source,
    action,
    ticker,
    tf,
    price,
    score,
    sl,
    tp1,
    tp2,
    tp3,
    adx,
    atr,
    mtfBias: mtf,
    timeIso: time,
    raw: body,
  };
}

function numOr(v, fallback) {
  if (v == null || v === "") return fallback;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}
