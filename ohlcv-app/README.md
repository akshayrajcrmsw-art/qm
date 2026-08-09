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
  (1m–1M), 1D–MAX range tabs, live polling, S/R, trendlines, EWMA 50/200, and Standard Deviation
  bands as overlays directly on the price chart, plus a **separate tabbed panel below the
  chart** for Volume Profile / Monte Carlo / Gamma Exposure — kept off the candles themselves so
  the chart doesn't turn into visual noise when several indicators are active at once
- **Dashboard's daily panel** shows EWMA/StdDev/S-R/trendlines only (same "keep the chart clean"
  approach); the weekly panel stays even simpler (S/R + trendlines only)

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
  api/gamma-exposure/route.ts    → fetches Yahoo's options chain, computes GEX by strike
lib/
  yahoo.ts                      → fetch + normalize Yahoo's chart/quote/search JSON
  supportResistance.ts          → fractal pivot detection + price clustering + trendline fitting
  indicators.ts                  → EWMA (50/200) + Standard Deviation bands, plain TypeScript
  volumeProfile.ts                 → volume-by-price bucketing
  gammaExposure.ts                  → Black-Scholes gamma + GEX-by-strike aggregation
  monteCarlo.ts                    → GBM Monte Carlo price-path simulation (client-side)
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

**Why EWMA(50)/EWMA(200) aren't computed with pandas-ta or TA-Lib:** same reasoning — both are
Python. What's commonly labeled "EMA" on charting platforms is exactly an Exponentially
Weighted Moving Average — seed with an SMA, then recursively blend with `k = 2/(period+1)` — the
same formula TA-Lib and pandas-ta's default EMA use internally, and what `pandas.ewm(span=period,
adjust=False).mean()` computes directly. `lib/indicators.ts` reimplements it under the more
precise EWMA name and the numbers match either library to the decimal.

**Standard Deviation bands** (`lib/indicators.ts`): a rolling 20-period SMA ± 2 standard
deviations, recomputed at every bar from a trailing window — the classic volatility-band
indicator (Bollinger-style), distinct from the EWMA lines, which track trend rather than
dispersion. Validated against a zero-variance (flat-price) case and a known small integer
sequence rather than eyeballed.

**Volume Profile, Monte Carlo, and Gamma Exposure live in their own tabbed panel below the
chart** (`components/AnalysisPanel.tsx`) rather than overlaid on the candles — with all of them,
EWMA lines, S/R levels, trendlines, and a Standard Deviation band stacked on one price chart at
once, it turns into unreadable noise. Only one of the three renders at a time; switching tabs
doesn't touch the chart above it.

**Volume Profile** (`lib/volumeProfile.ts`): buckets traded volume into 24 horizontal price bins
across the loaded candles' full range, splitting each candle's volume across every bucket its
own high/low overlaps (weighted by overlap, not just dumped on the close) — validated to
conserve total volume exactly and correctly locate the point of control (the highest-volume
bucket) against synthetic data with a known concentration. Rendered as a standalone horizontal
bar list (highest price at top), independent of the price chart's own coordinate system.

**Gamma Exposure** (`lib/gammaExposure.ts` — the one feature here with a real
external-data risk): fetches Yahoo's options chain (`v7/finance/options/{symbol}`), computes
Black-Scholes gamma per strike from each contract's implied volatility, and aggregates
`gamma × open interest × contract size × spot² × 1%` into net GEX per strike — the standard
public/retail approximation of dealer gamma positioning (calls counted positive, puts negative;
this is a convention, not a claim about any specific dealer's actual book). The gamma formula
itself is validated against a hand-computed textbook case and checked for the right shape
(peaks at-the-money, decays with time). **The real risk**: `v7/finance/options` is the same
endpoint family as `v7/finance/quote`, which this project already found Yahoo increasingly
gates behind a session cookie + crumb that anonymous server requests don't have (see the
ticker-tape history below). If Yahoo blocks it, the panel shows a clear error instead of
crashing — same pattern as the NSE feed — but there's no guarantee it'll work for every symbol
or every deployment. It also only works for symbols with listed options (indices, large-cap
stocks) — crypto and forex pairs will just show "no options data."

**Monte Carlo price projection** (`lib/monteCarlo.ts`): estimates drift and
volatility from the log returns of whatever candles are currently loaded, then runs a standard
Geometric Brownian Motion simulation forward from the last close, plotting
the 25th/50th/75th percentile paths (with the 5–95% range shaded) on its own small chart in the
tab — separate from, and independent of, the main price chart's time axis. It's pure math over
data already in the browser — no extra API call, no Python — validated against the theoretical
√N scaling of Brownian motion rather than eyeballed. Two things worth
knowing: it needs at least 30 candles of history to get a stable volatility estimate, and the
projection is always in units of "one more bar like the ones on screen" (days for a daily chart,
weeks for weekly, etc.) — not literal calendar days — so it stays correct regardless of which
candle size is selected.

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
