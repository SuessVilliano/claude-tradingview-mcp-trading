/**
 * News fetcher — NewsAPI.org top business/markets headlines.
 * Free tier: 100 reqs/day. Returns null if NEWS_API_KEY is unset.
 */

export async function gatherNews({ limit = 8 } = {}) {
  const key = process.env.NEWS_API_KEY;
  if (!key) return null;

  const url =
    `https://newsapi.org/v2/top-headlines?` +
    `country=us&category=business&pageSize=${limit}&apiKey=${key}`;

  try {
    const res = await fetch(url, { headers: { "user-agent": "HybridAI/1.0" } });
    if (!res.ok) {
      console.warn(`[news] HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    return (json.articles ?? [])
      .filter((a) => a.title && a.title !== "[Removed]")
      .map((a) => ({
        title: a.title,
        source: a.source?.name,
        published_at: a.publishedAt,
        url: a.url,
        summary: a.description ?? "",
      }));
  } catch (err) {
    console.warn(`[news] fetch failed:`, err.message);
    return null;
  }
}
