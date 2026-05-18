/**
 * trades.csv writer — matches the Hybrid AI schema.
 * Columns: Date, Time (ET), Symbol, TF, Side, Grade, Score, ADX, MTF Bias,
 *          Entry, Stop Loss, TP1, TP2, TP3, Status, R Hit, P/L (R), Mode, Notes
 */

import { existsSync, writeFileSync, appendFileSync, readFileSync } from "fs";

const CSV_FILE = "trades.csv";

const HEADERS = [
  "Date",
  "Time (ET)",
  "Symbol",
  "TF",
  "Side",
  "Grade",
  "Score",
  "ADX",
  "MTF Bias",
  "Entry",
  "Stop Loss",
  "TP1",
  "TP2",
  "TP3",
  "Status",
  "R Hit",
  "P/L (R)",
  "Mode",
  "Notes",
].join(",");

export function ensureCsv() {
  if (!existsSync(CSV_FILE)) {
    writeFileSync(CSV_FILE, HEADERS + "\n");
  }
}

function csvEscape(v) {
  if (v == null || v === "") return "";
  const s = String(v);
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function appendRow(row) {
  ensureCsv();
  const cells = [
    row.date,
    row.timeEt,
    row.symbol,
    row.tf,
    row.side,
    row.grade,
    row.score,
    row.adx,
    row.mtfBias,
    row.entry,
    row.sl,
    row.tp1,
    row.tp2,
    row.tp3,
    row.status,
    row.rHit,
    row.pnlR,
    row.mode,
    row.notes,
  ].map(csvEscape);
  appendFileSync(CSV_FILE, cells.join(",") + "\n");
}

export function countTodaysExecutedTrades() {
  if (!existsSync(CSV_FILE)) return 0;
  const lines = readFileSync(CSV_FILE, "utf8").trim().split("\n");
  if (lines.length <= 1) return 0;
  // Match today in ET — derive from clock with rough DST adjust
  const todayEt = etDateString(new Date());
  let count = 0;
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const date = cols[0]?.replace(/^"|"$/g, "");
    const mode = cols[17]?.replace(/^"|"$/g, "");
    if (date === todayEt && (mode === "PAPER" || mode === "LIVE")) count += 1;
  }
  return count;
}

const ET_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const ET_TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function etDateString(d) {
  return ET_DATE_FMT.format(d); // "2026-05-17"
}

export function etTimeString(d = new Date()) {
  return ET_TIME_FMT.format(d); // "13:42:08"
}

export function etDate(d = new Date()) {
  return etDateString(d);
}
