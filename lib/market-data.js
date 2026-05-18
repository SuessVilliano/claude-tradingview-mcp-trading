/**
 * Free market data fetcher — Yahoo Finance unofficial endpoints.
 * No API key required. Works for index quotes, FX, rates.
 *
 * Symbols used by the daily briefing:
 *   ^NDX     — Nasdaq-100 index (for prior day H/L/C + RTH pivots)
 *   NQ=F     — NQ continuous futures (overnight session H/L)
 *   ^VIX     — Volatility index
 *   DX-Y.NYB — Dollar index
 *   ^TNX     — 10-year US Treasury yield
 */

const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

async function fetchYahoo(symbol, range = "5d", interval = "1d") {
  const url = `${YF_BASE}/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  try {
    const res = await fetch(url, {
      headers: {
        // Yahoo blocks empty UAs
        "user-agent": "Mozilla/5.0 (HybridAI/1.0)",
      },
    });
    if (!res.ok) throw new Error(`Yahoo ${symbol}: HTTP ${res.status}`);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error(`Yahoo ${symbol}: no result`);
    return result;
  } catch (err) {
    console.warn(`[market-data] ${symbol} fetch failed:`, err.message);
    return null;
  }
}

function lastDailyCandle(r) {
  if (!r) return null;
  const q = r.indicators?.quote?.[0];
  if (!q) return null;
  const ts = r.timestamp ?? [];
  // Find the most recent fully-closed candle (not today if intraday still going)
  for (let i = ts.length - 1; i >= 0; i--) {
    if (q.close[i] != null) {
      return {
        time: ts[i],
        open: q.open[i],
        high: q.high[i],
        low: q.low[i],
        close: q.close[i],
        volume: q.volume?.[i],
      };
    }
  }
  return null;
}

function priorDailyCandle(r) {
  if (!r) return null;
  const q = r.indicators?.quote?.[0];
  if (!q) return null;
  const ts = r.timestamp ?? [];
  let found = 0;
  for (let i = ts.length - 1; i >= 0; i--) {
    if (q.close[i] != null) {
      found += 1;
      if (found === 2) {
        return {
          time: ts[i],
          open: q.open[i],
          high: q.high[i],
          low: q.low[i],
          close: q.close[i],
          volume: q.volume?.[i],
        };
      }
    }
  }
  return null;
}

function pctChange(curr, prev) {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function floorPivots({ high, low, close }) {
  if (high == null || low == null || close == null) return null;
  const p = (high + low + close) / 3;
  return {
    pivot: p,
    r1: 2 * p - low,
    s1: 2 * p - high,
    r2: p + (high - low),
    s2: p - (high - low),
  };
}

export async function gatherMarketData() {
  const [ndx, vix, dxy, tnx, nqFut] = await Promise.all([
    fetchYahoo("^NDX", "10d", "1d"),
    fetchYahoo("^VIX", "10d", "1d"),
    fetchYahoo("DX-Y.NYB", "10d", "1d"),
    fetchYahoo("^TNX", "10d", "1d"),
    fetchYahoo("NQ=F", "2d", "30m"),
  ]);

  const ndxToday = lastDailyCandle(ndx);
  const ndxPrior = priorDailyCandle(ndx);
  const vixToday = lastDailyCandle(vix);
  const vixPrior = priorDailyCandle(vix);
  const dxyToday = lastDailyCandle(dxy);
  const dxyPrior = priorDailyCandle(dxy);
  const tnxToday = lastDailyCandle(tnx);
  const tnxPrior = priorDailyCandle(tnx);

  // NQ overnight session approximation — high/low from 30m candles since prior US close
  let overnightHigh = null;
  let overnightLow = null;
  if (nqFut?.indicators?.quote?.[0]) {
    const q = nqFut.indicators.quote[0];
    const highs = q.high.filter((v) => v != null);
    const lows = q.low.filter((v) => v != null);
    if (highs.length) overnightHigh = Math.max(...highs);
    if (lows.length) overnightLow = Math.min(...lows);
  }

  return {
    fetched_at_iso: new Date().toISOString(),
    ndx: ndxToday
      ? {
          today_close: ndxToday.close,
          prior_close: ndxPrior?.close ?? null,
          prior_high: ndxPrior?.high ?? null,
          prior_low: ndxPrior?.low ?? null,
          pivots: ndxPrior ? floorPivots(ndxPrior) : null,
          chg_pct: pctChange(ndxToday.close, ndxPrior?.close),
        }
      : null,
    nq_futures: {
      overnight_high: overnightHigh,
      overnight_low: overnightLow,
    },
    vix: vixToday
      ? {
          value: vixToday.close,
          chg: vixPrior ? vixToday.close - vixPrior.close : null,
          chg_pct: pctChange(vixToday.close, vixPrior?.close),
        }
      : null,
    dxy: dxyToday
      ? {
          value: dxyToday.close,
          chg: dxyPrior ? dxyToday.close - dxyPrior.close : null,
          chg_pct: pctChange(dxyToday.close, dxyPrior?.close),
        }
      : null,
    us_10y: tnxToday
      ? {
          value: tnxToday.close, // ^TNX returns yield as percentage (e.g. 4.59 for 4.59%)
          chg_bps: tnxPrior ? (tnxToday.close - tnxPrior.close) * 100 : null,
        }
      : null,
  };
}
