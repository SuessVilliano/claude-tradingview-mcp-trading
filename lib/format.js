/**
 * Format normalized webhook payloads into human-readable email + plain text alerts.
 */

const ICON = {
  buy: "🟢",
  sell: "🔴",
  tp_hit: "🎯",
  sl_hit: "🛑",
};

const SOURCE_LABEL = {
  optimized: "OPTIMIZED · executor",
  hybrid: "HYBRID AI · context",
  supercator: "SUPERCATOR · 15m",
  unknown: "UNKNOWN",
};

export function buildSubject(p, decision, grade) {
  const icon = ICON[p.action] ?? "⚡";
  const sideLabel = (p.action ?? "alert").toUpperCase();
  const ticker = p.ticker ?? "—";
  const tf = p.tf ? `${p.tf}m` : "";
  const price = p.price != null ? p.price : "";
  const tag = decision === "NO-GO" ? "NO-GO" : decision === "CONTEXT" ? "CTX" : decision === "FOLLOWUP" ? "FOLLOW-UP" : "GO";
  const gradeBit = grade && grade !== "—" ? ` ${grade}` : "";
  return `${icon} [Hybrid AI · ${tag}${gradeBit}] ${ticker} ${tf} ${sideLabel} @ ${price}`.trim();
}

export function buildBody(p, decision, reasons, tradesToday, maxPerDay) {
  const lines = [];
  lines.push(`HYBRID AI ALERT  ·  ${SOURCE_LABEL[p.source] ?? p.source}`);
  lines.push(`Decision: ${decision}`);
  lines.push(`Time:     ${p.timeIso}`);
  lines.push(`Symbol:   ${p.ticker ?? "—"}  ${p.tf ? `TF ${p.tf}m` : ""}`);
  lines.push(`Action:   ${(p.action ?? "—").toUpperCase()}`);
  if (p.price != null) lines.push(`Price:    ${p.price}`);
  lines.push("");

  if (p.score != null) lines.push(`Score:    ${p.score} / 100`);
  if (p.adx != null)   lines.push(`ADX:      ${p.adx}`);
  if (p.atr != null)   lines.push(`ATR:      ${p.atr}`);
  if (p.mtfBias)       lines.push(`MTF:      ${p.mtfBias}`);

  if (p.sl != null || p.tp1 != null) {
    lines.push("");
    if (p.sl  != null) lines.push(`SL:       ${p.sl}`);
    if (p.tp1 != null) lines.push(`TP1:      ${p.tp1}`);
    if (p.tp2 != null) lines.push(`TP2:      ${p.tp2}`);
    if (p.tp3 != null) lines.push(`TP3:      ${p.tp3}`);
  }

  lines.push("");
  lines.push("Reasons:");
  for (const r of reasons) lines.push(`  • ${r}`);

  lines.push("");
  lines.push(`Trades today: ${tradesToday} / ${maxPerDay}`);
  lines.push(`Paper mode:   ${process.env.PAPER_TRADING !== "false"}`);
  lines.push(`Logged to:    trades.csv`);

  return lines.join("\n");
}
