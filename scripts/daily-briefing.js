/**
 * Hybrid AI — Daily Briefing Runner
 *
 * Runs once before the cash open (configured via DAILY_BRIEFING_TIME).
 * Gathers market data + news + econ, calls the AI provider with the
 * `hybrid-ai-one-shot.md` Mode A prompt, emails the result to ALERT_EMAIL.
 *
 * Skip weekends. Skip if DAILY_BRIEFING_ENABLED=false.
 *
 * Cron (Hostinger VPS, weekdays 8:00 AM ET):
 *   0 12 * * 1-5  cd /root/bot && /usr/bin/node scripts/daily-briefing.js >> brief.log 2>&1
 *   (12:00 UTC = 08:00 ET during DST; use 13:00 UTC during EST. Or use TZ=America/New_York in crontab.)
 *
 * Local test:
 *   npm run brief
 *   npm run brief -- --dry-run   (composes the email but does not send)
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { gatherMarketData } from "../lib/market-data.js";
import { gatherNews } from "../lib/news.js";
import { gatherEconCalendar } from "../lib/econ.js";
import { askAi } from "../lib/ai.js";
import { sendAlert } from "../lib/email.js";
import { appendRow, etDate, etTimeString } from "../lib/csv.js";

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE   = process.argv.includes("--force");

const PROMPT_PATH = new URL("../prompts/hybrid-ai-one-shot.md", import.meta.url).pathname;

function todayInEt() {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
  return fmt.format(new Date());
}

function weekdayInEt() {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" });
  return fmt.format(new Date());
}

async function main() {
  const enabled = process.env.DAILY_BRIEFING_ENABLED !== "false";
  if (!enabled && !FORCE) {
    console.log("Briefing disabled (DAILY_BRIEFING_ENABLED=false). Use --force to override.");
    return;
  }

  const weekday = weekdayInEt();
  if (!FORCE && (weekday === "Sat" || weekday === "Sun")) {
    console.log(`Skipping — ${weekday} (weekend).`);
    return;
  }

  const dateEt = todayInEt();
  console.log(`▶ Hybrid AI daily briefing for ${dateEt} (${weekday})\n`);

  console.log("• Gathering market data (Yahoo Finance)...");
  const market = await gatherMarketData();

  console.log("• Gathering news (NewsAPI)...");
  const news = await gatherNews({ limit: 8 });
  if (!news) console.log("  ↳ skipped (NEWS_API_KEY unset)");

  console.log("• Gathering econ calendar (FMP)...");
  const econ = await gatherEconCalendar();
  if (!econ) console.log("  ↳ skipped (FMP_API_KEY unset)");

  console.log("• Loading prompt...");
  const promptFile = readFileSync(PROMPT_PATH, "utf8");

  const userPayload = {
    mode: "daily_briefing",
    date_iso: dateEt,
    weekday_et: weekday,
    tz: "America/New_York",
    market_data: market,
    news_headlines: news ?? "Not fetched — set NEWS_API_KEY in env to enable.",
    econ_calendar: econ ?? "Not fetched — set FMP_API_KEY in env to enable.",
    user_email: process.env.ALERT_EMAIL ?? "suessvilliano@gmail.com",
  };

  const userMsg =
    `Generate the daily briefing now. Here is the structured context to draw from. ` +
    `Wherever a value is missing, say "unknown" in the briefing — do not invent.\n\n` +
    "```json\n" +
    JSON.stringify(userPayload, null, 2) +
    "\n```";

  console.log("• Calling AI provider...");
  let aiResponse;
  try {
    aiResponse = await askAi({
      system: promptFile,
      user: userMsg,
      maxTokens: 2500,
    });
  } catch (err) {
    console.error("AI call failed:", err.message);
    process.exit(1);
  }

  const briefingText = aiResponse.text.trim();
  if (!briefingText) {
    console.error("AI returned empty response. Aborting.");
    process.exit(1);
  }

  console.log(`• AI returned ${briefingText.length} chars (${aiResponse.model})`);

  // Pull a subject line out of the response if it follows the prompt's convention
  const subjectMatch = briefingText.match(/^\[JAMAUR · NQ Brief[^\]]+\].*$/m);
  const subject =
    subjectMatch?.[0] ?? `[JAMAUR · NQ Brief · ${dateEt}] Daily briefing`;

  const bodyText = briefingText;
  const bodyHtml = renderHtml(briefingText, dateEt);

  console.log(`\nSubject: ${subject}\n`);
  if (DRY_RUN) {
    console.log("--- DRY RUN, body below, no email sent ---\n");
    console.log(bodyText);
    return;
  }

  console.log("• Sending email...");
  const result = await sendAlert({ subject, text: bodyText, html: bodyHtml });
  console.log("Email:", result);

  appendRow({
    date: etDate(),
    timeEt: etTimeString(),
    symbol: "NQ/NAS100",
    tf: "1d",
    side: "BRIEF",
    grade: "",
    score: "",
    adx: "",
    mtfBias: "",
    entry: "",
    sl: "",
    tp1: "",
    tp2: "",
    tp3: "",
    status: "BRIEF",
    rHit: "",
    pnlR: "",
    mode: "BRIEF",
    notes: `Model ${aiResponse.model} · ${briefingText.length} chars · ${result.delivered ? "delivered" : "console"}`,
  });
  console.log("Logged to trades.csv.\n");
}

function renderHtml(text, date) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#03040a;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
  <table cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;margin:24px auto;background:#0f121b;border:1px solid #1a1f2b;border-radius:14px;overflow:hidden">
    <tr>
      <td style="padding:18px 22px;background:linear-gradient(135deg,#4ee0ff22,#8b5cf622);border-bottom:1px solid #1a1f2b">
        <div style="font-size:11px;letter-spacing:3px;color:#4ee0ff;text-transform:uppercase">⚡ JAMAUR · Hybrid AI</div>
        <div style="font-size:18px;color:#f5f7ff;margin-top:4px;font-weight:600">Daily Briefing · ${date}</div>
      </td>
    </tr>
    <tr><td style="padding:22px;color:#e0e0e0">
      <pre style="font:13px/1.55 ui-monospace,Menlo,monospace;color:#e0e0e0;white-space:pre-wrap;margin:0">${escaped}</pre>
    </td></tr>
    <tr><td style="padding:14px 22px;background:#0b0d13;border-top:1px solid #1a1f2b;font-size:11px;color:#666">
      Hybrid AI · jamaurjohnson.com · auto-generated 08:00 ET weekdays
    </td></tr>
  </table>
</body></html>`;
}

main().catch((err) => {
  console.error("Briefing runner crashed:", err);
  process.exit(1);
});
