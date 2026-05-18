/**
 * US economic calendar — Financial Modeling Prep API.
 * Free tier covers economic_calendar endpoint.
 *
 * Set FMP_API_KEY in env. Returns null if unset.
 *
 * Filters down to US releases for "today" in ET, medium + high impact only.
 */

export async function gatherEconCalendar() {
  const key = process.env.FMP_API_KEY;
  if (!key) return null;

  const fmtFmp = (d) => d.toISOString().slice(0, 10);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const url =
    `https://financialmodelingprep.com/api/v3/economic_calendar?` +
    `from=${fmtFmp(today)}&to=${fmtFmp(tomorrow)}&apikey=${key}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[econ] HTTP ${res.status}`);
      return null;
    }
    const list = await res.json();
    if (!Array.isArray(list)) return null;
    const todayEt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(today);
    return list
      .filter((e) => e.country === "US")
      .filter((e) => /high|medium/i.test(e.impact ?? ""))
      .filter((e) => {
        // Only releases happening today in ET
        const releaseEt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(
          new Date(e.date),
        );
        return releaseEt === todayEt;
      })
      .map((e) => ({
        name: e.event,
        time_iso: e.date,
        time_et: new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date(e.date)),
        impact: e.impact,
        actual: e.actual,
        estimate: e.estimate,
        previous: e.previous,
      }));
  } catch (err) {
    console.warn(`[econ] fetch failed:`, err.message);
    return null;
  }
}
