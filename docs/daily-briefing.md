# Daily Briefing Runner

Runs once every US weekday before the cash open. Gathers market data, news, and the econ calendar, calls Anthropic Claude (or Vercel AI Gateway / OpenAI) with `prompts/hybrid-ai-one-shot.md` Mode A, and emails the briefing to `ALERT_EMAIL` via Resend.

Covers, per `rules.json.daily_briefing.covers`:

1. **Bias** for NQ / NAS100 today
2. **Key levels** — prior day H/L/C, overnight session, floor pivots
3. **Top news** — US business headlines (NewsAPI)
4. **Economic data** — releases today with consensus + impact (FMP)
5. **Sentiment edge** — VIX / DXY / 10Y yield / put-call / breadth

## Required environment

| Variable               | What it does                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` *  | The AI provider. Set one of Anthropic / Gateway / OpenAI keys.                     |
| `AI_PROVIDER`          | `anthropic` (default) / `gateway` / `openai`                                       |
| `AI_MODEL`             | Optional override. Defaults to `claude-sonnet-4-5`.                                |
| `RESEND_API_KEY`       | Sends the email. Without it, the briefing prints to console instead.              |
| `ALERT_EMAIL`          | Where it lands. Defaults to `suessvilliano@gmail.com`.                            |
| `NEWS_API_KEY`         | Optional. https://newsapi.org — 100 reqs/day free. Skipped if unset.              |
| `FMP_API_KEY`          | Optional. https://financialmodelingprep.com — econ calendar. Skipped if unset.    |
| `DAILY_BRIEFING_ENABLED` | Set to `false` to disable. Default `true`.                                       |

\* or `AI_GATEWAY_API_KEY` (gateway) / `OPENAI_API_KEY` (openai).

## Run it locally

```bash
# Compose + send the briefing email now (skips weekend check with --force)
npm run brief -- --force

# Compose but DON'T send — prints the body to stdout
npm run brief:dry
```

## Run it on cron (Hostinger VPS)

Use the VPS's local timezone to keep DST simple. Set the system TZ to `America/New_York`:

```bash
ssh root@YOUR_VPS_IP "timedatectl set-timezone America/New_York"
```

Then add to crontab:

```bash
ssh root@YOUR_VPS_IP "(crontab -l 2>/dev/null; echo '0 8 * * 1-5 cd /root/bot && /usr/bin/node scripts/daily-briefing.js >> brief.log 2>&1') | crontab -"
```

That fires Mon–Fri at 08:00 America/New_York. The script itself also has a weekend check as a belt-and-braces guard.

## What gets logged

Every successful briefing appends one row to `trades.csv`:

```
2026-05-17,08:00:14,NQ/NAS100,1d,BRIEF,,,,,,,,,,BRIEF,,,BRIEF,Model claude-sonnet-4-5-... · 1842 chars · delivered
```

Failed runs print to `brief.log` (or stdout if running manually). No row is appended on failure.

## Cost

About $0.02–$0.05 per briefing using `claude-sonnet-4-5` (≈3K input + 1.5K output tokens). Roughly **$1/month** for 22 weekday runs.
