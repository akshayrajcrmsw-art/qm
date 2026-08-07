# Ticker — market dashboard with auto support/resistance

A self-hosted trading dashboard, built on Yahoo Finance's free public API (no keys required):

- **Global markets ticker tape** — TradingView-style scrolling strip (S&P 500, Nasdaq, Nikkei,
  Nifty sector indices, BTC/ETH/SOL/BNB/XRP, etc.), live price, % change, and a mini sparkline per symbol
- **Dual-timeframe chart panel** — weekly candles (full history, S/R + trendlines) stacked above
  daily candles (full history, S/R + trendlines + EMA 50/200), both following whatever ticker
  you type in the search box
- **Fin News India / Fin News Global** — live RSS panels (Economic Times Markets / Yahoo Finance News)
- **NSE Events** — merged feed of NSE's financial results, board meetings, announcements, and
  buyback RSS feeds, categorized and sorted by time
- **Position sizing calculator** — risk % or fixed ₹ amount, long/short auto-detected from your
  stop, either give a target price (get the R:R) or a target R:R (get the implied target price)
- **Advanced chart** (`/chart`) — the original single-symbol view: zoom/pan, custom candle size
  (1m–1M), 1D–MAX range tabs, live polling, S/R, trendlines, EMA — kept as a separate page so the
  dashboard stays uncluttered

## How it's put together

```
app/
  page.tsx                    → dashboard home (this is what "Make it a Dashboard" built)
  chart/page.tsx               → the original advanced single-chart view, now at /chart
  api/chart/route.ts            → GET /api/chart?symbol=^NSEI&range=1y&interval=1d
                                   candles + S/R + trendlines + EMA50/200 + meta
  api/quote/route.ts            → lightweight live-price poll target
  api/search/route.ts            → symbol autocomplete
  api/ticker-tape/route.ts       → batched quotes + sparklines for the global markets strip
  api/news/route.ts              → GET /api/news?region=india|global — RSS → JSON
  api/nse-events/route.ts        → merges the 4 NSE RSS feeds into one sorted, categorized list
lib/
  yahoo.ts                      → fetch + normalize Yahoo's chart/quote/search JSON
  supportResistance.ts          → fractal pivot detection + price clustering + trendline fitting
  indicators.ts                  → EMA (50/200), plain TypeScript
  ranges.ts                      → range/interval option tables + validity rules
  globalMarkets.ts                → the ticker-tape symbol list
  rss.ts                          → RSS/Atom fetch + parse (handles CDATA, single-item feeds,
                                     and NSE's cookie-gate quirk)
components/
  Chart.tsx                      → lightweight-charts wrapper (candles, S/R lines, trendlines, EMA, live update)
  Controls.tsx                    → full range/interval controls, used on /chart
  SymbolSearchBox.tsx              → just the ticker search box, used on the dashboard
  DashboardChartPanel.tsx          → fixed weekly/daily chart panel for the dashboard
  TickerTape.tsx                   → the scrolling global-markets strip
  NewsPanel.tsx                    → India/Global news card list
  NseEventsPanel.tsx                → NSE events card list with category badges
  PositionSizingCalculator.tsx      → the risk/position-size calculator
```

**Why the requests are proxied through `/api/*` instead of calling Yahoo (or NSE, or the news
sources) from the browser:** none of these send CORS headers, so a direct client-side `fetch`
gets blocked by the browser. Routing everything through Next.js Route Handlers (server-side on
Vercel) sidesteps that, and lets you add caching and error handling in one place.

**Why the S/R algorithm isn't `trendln`:** `trendln` is a Python package built on
`numpy`/`scipy`/`sklearn`. Running it on Vercel means either a separate Python serverless
function (extra deployment, larger cold starts, cross-language JSON plumbing) or bundling those
libraries into a Node process, which doesn't work. `lib/supportResistance.ts` reimplements the
same core idea — find local swing highs/lows, cluster nearby prices, rank by touches, and (for
trendlines) fit lines through pairs of pivots and score by validity/touches — in plain
TypeScript. One deploy, one language, fast cold starts.

**Why EMA(50)/EMA(200) aren't computed with pandas-ta or TA-Lib:** same reasoning — both are
Python. EMA is just standard exponential smoothing (seed with an SMA, then recursively blend
with `k = 2/(period+1)`), the same formula TA-Lib and pandas-ta's default EMA use internally, so
`lib/indicators.ts` reimplements it directly and the numbers match either library to the decimal.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 for the dashboard, or http://localhost:3000/chart for the advanced
single-chart view. No environment variables or API keys are required.

## Deploy: GitHub → Vercel

1. Push this folder to your GitHub repo (replace your existing files if updating).
2. Import it at [vercel.com/new](https://vercel.com/new) — Framework Preset should auto-detect
   **Next.js**, Root Directory should point at the folder containing `package.json`.
3. No environment variables needed. Deploy.

## Notes, limits, and things to tune

- **NSE's feed can be flaky from a server.** `nsearchives.nseindia.com` sometimes rejects
  requests from datacenter IPs outright (a WAF/Akamai thing), independent of headers or cookies.
  `lib/rss.ts` does the usual workaround — hit `nseindia.com` first and replay its session
  cookie — but if NSE blocks Vercel's IP range that day, the NSE Events panel will show a
  friendly error instead of crashing. This is the one panel that's genuinely outside your
  control to guarantee uptime for.
- **The ticker tape does ~32 parallel fetches per refresh** (one quote batch + one sparkline
  fetch per symbol). It's cached at the edge for 30s and refreshes client-side every 60s, so
  steady-state load is light, but on Vercel's **Hobby** plan, function duration caps may be
  lower than the `maxDuration: 30` set in `vercel.json` — if you see timeouts, either trim
  `lib/globalMarkets.ts` down to fewer symbols or move to a paid plan.
- **News/NSE cadence**: both poll every 5 minutes client-side and are cached for 2 minutes
  server-side, matching how often these sources actually publish.
- **Global news source**: uses Yahoo Finance's own news RSS plus UK Yahoo Finance, CNBC, and
  MarketWatch, merged and deduped. **India news**: Economic Times, Moneycontrol, LiveMint,
  Business Standard, and Financial Express, merged and deduped — not just one publisher. Each
  source fails independently (`Promise.allSettled` in `app/api/news/route.ts`), so if one feed's
  URL changes or goes down, the others still show; edit the `FEEDS` arrays there to add, remove,
  or swap sources.
- **Position sizing calculator** is pure client-side arithmetic — no API calls, no persistence.
  It infers long/short from where your stop sits relative to entry (stop below entry = long).
- **Tuning S/R/trendline sensitivity**: see `lib/supportResistance.ts` — `clusterPct`,
  `minTouches`, `swingWindow`, `maxPivots` control how aggressive the detection is.

### Swapping in `trendln` instead

If you specifically want `trendln`'s numpy/scipy trendline output, the cleanest path on Vercel is
a separate Python serverless function using Vercel's
[Python runtime](https://vercel.com/docs/functions/runtimes/python) — add `api/srlevels.py` with
a `requirements.txt` listing `trendln`, `numpy`, `pandas`, have it accept OHLCV bars over POST,
and call it from `app/api/chart/route.ts` instead of `calculateSupportResistance()`. Expect
noticeably slower cold starts on that route since `numpy`/`scipy` are large native dependencies.
