/**
 * Strategy rules + decision evaluation against rules.json.
 *
 * Used by server.js to decide whether to honor an inbound TradingView webhook,
 * apply daily trade limits, and tag each event with a grade + status.
 */

import { readFileSync, existsSync, statSync } from "fs";

const RULES_PATH = new URL("../rules.json", import.meta.url).pathname;

let cachedRules = null;
let cachedMtime = 0;

export function loadRules() {
  if (!existsSync(RULES_PATH)) {
    throw new Error(`rules.json not found at ${RULES_PATH}`);
  }
  // Cheap reload — re-read if file mtime changes
  const mtime = statSync(RULES_PATH).mtimeMs;
  if (!cachedRules || mtime !== cachedMtime) {
    cachedRules = JSON.parse(readFileSync(RULES_PATH, "utf8"));
    cachedMtime = mtime;
  }
  return cachedRules;
}

export function gradeFromScore(score, rules) {
  const g = rules.confluence_score?.grades ?? { "A+": 80, A: 65, B: 50 };
  if (score == null) return "—";
  if (score >= g["A+"]) return "A+";
  if (score >= g.A) return "A";
  if (score >= g.B) return "B";
  return "—";
}

/**
 * Decide whether to honor an inbound webhook based on rules.json + today's trade count.
 *
 * @param {object} payload — normalized webhook payload (see normalize.js shape)
 * @param {object} rules — parsed rules.json
 * @param {number} tradesToday — count of executed (paper or live) trades today
 * @returns {{decision: "GO"|"NO-GO"|"CONTEXT"|"FOLLOWUP", reasons: string[], grade: string}}
 */
export function evaluate(payload, rules, tradesToday = 0) {
  const reasons = [];
  const grade = gradeFromScore(payload.score, rules);

  // Follow-up events (TP/SL hits) — always pass-through, no rule checks
  if (payload.action === "tp_hit" || payload.action === "sl_hit") {
    return { decision: "FOLLOWUP", reasons: [`${payload.action} on prior signal`], grade };
  }

  // Hybrid AI indicator alerts are CONTEXT only — they notify, they don't fire trades
  if (payload.source === "hybrid") {
    return { decision: "CONTEXT", reasons: ["Hybrid AI indicator — context notification only"], grade };
  }

  // sell_only mode — block longs
  if (rules.sell_only && payload.action === "buy") {
    reasons.push("sell_only=true in rules.json — long entries disabled");
    return { decision: "NO-GO", reasons, grade };
  }

  // Daily limit
  const maxPerDay = parseInt(process.env.MAX_TRADES_PER_DAY ?? "3", 10);
  if (tradesToday >= maxPerDay) {
    reasons.push(`Daily limit reached: ${tradesToday}/${maxPerDay}`);
    return { decision: "NO-GO", reasons, grade };
  }

  // Score threshold (if supplied — only Supercator sends score)
  if (payload.score != null) {
    const min = rules.confluence_score?.minimum_to_fire ?? 50;
    if (payload.score < min) {
      reasons.push(`Score ${payload.score} below minimum ${min}`);
      return { decision: "NO-GO", reasons, grade };
    }
  }

  // Session guardrail — skip last 15 min before US close (16:00 ET) if symbol is NQ/NAS100
  if (/NQ|NAS100/i.test(payload.ticker)) {
    const { hour, minute, weekday } = nowEt();
    if (weekday === 0 || weekday === 6) {
      reasons.push("Weekend — markets closed");
      return { decision: "NO-GO", reasons, grade };
    }
    if (hour === 15 && minute >= 45) {
      reasons.push("Within 15 min of US close — no new entries");
      return { decision: "NO-GO", reasons, grade };
    }
    if (hour >= 16 || hour < 9 || (hour === 9 && minute < 30)) {
      reasons.push("Outside RTH session (09:30–16:00 ET)");
      return { decision: "NO-GO", reasons, grade };
    }
  }

  reasons.push("All hard rules pass");
  if (payload.score != null) reasons.push(`Score ${payload.score} → grade ${grade}`);
  return { decision: "GO", reasons, grade };
}

const ET_PARTS_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function nowEt() {
  const parts = ET_PARTS_FMT.formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdayMap[get("weekday")] ?? 0,
    hour: parseInt(get("hour") ?? "0", 10),
    minute: parseInt(get("minute") ?? "0", 10),
  };
}
