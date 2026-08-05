# Ticker — live OHLCV chart with auto support/resistance

A self-hosted, TradingView-style candlestick chart:

- Live-ish OHLCV data pulled server-side from Yahoo Finance's public chart API (no API key)
- Automatic support & resistance detection (swing-point / fractal clustering — a dependency-free
  analogue to what `trendln` does, but pure TypeScript so it runs in a Vercel serverless function
  with no Python/scipy build step)
- Zoom + pan on both axes (mouse wheel, pinch, drag) via [lightweight-charts](https://tradingview.github.io/lightweight-charts/)
- Type a new ticker and the chart, price, and levels all update
- 1D/5D/1M/3M/6M/1Y/2Y/5Y/MAX range tabs, each mapped to a sensible Yahoo interval
- Polls for the latest price/bar every few seconds so the chart updates live while the tab is open

## How it's put together

```
app/
  api/chart/route.ts   → GET /api/chart?symbol=^NSEI&range=1y&interval=1d
                          fetches Yahoo, computes S/R, returns { candles, levels, meta }
  api/quote/route.ts    → GET /api/quote?symbol=^NSEI
                          lightweight endpoint polled every few seconds for the live tick
  api/search/route.ts   → GET /api/search?q=reliance
                          symbol autocomplete via Yahoo's search endpoint
  page.tsx              → top-level state: symbol, range, polling, layout
lib/
  yahoo.ts               → fetch + normalize Yahoo's chart/search JSON
  supportResistance.ts   → fractal pivot detection + price clustering
  ranges.ts               → range → interval → poll-frequency table
components/
  Chart.tsx               → lightweight-charts wrapper (candles + S/R price lines + live update)
  Controls.tsx             → symbol search box + range tabs
```

**Why the requests are proxied through `/api/*` instead of calling Yahoo from the browser:**
Yahoo's endpoint doesn't send CORS headers, so a direct client-side `fetch` to
`query1.finance.yahoo.com` is blocked by the browser. Routing it through a Next.js
Route Handler (which runs server-side on Vercel) sidesteps that entirely and lets you
add caching, error handling, and the S/R calculation in one place.

**Why the S/R algorithm isn't `trendln`:** `trendln` is a Python package built on
`numpy`/`scipy`/`sklearn`. Running it on Vercel means either a separate Python serverless
function (extra deployment, larger cold starts, and cross-language JSON plumbing) or bundling
those libraries into a Node process, which doesn't work. `lib/supportResistance.ts`
reimplements the same core idea — find local swing highs/lows, then cluster nearby prices
together and rank by how many times price touched that zone — in plain TypeScript so it's
one deploy, one language, fast cold starts. If you'd rather use real `trendln`, see
"Swapping in trendln" below.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. No environment variables or API keys are required — Yahoo's
chart and search endpoints used here are public.

## Deploy: GitHub → Vercel

1. Push this folder to a new GitHub repo:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. Go to [vercel.com/new](https://vercel.com/new), import that repo.
3. Framework preset: Vercel auto-detects **Next.js** — leave build/output settings as default
   (`next build`, `.next`).
4. No environment variables needed. Click **Deploy**.
5. Every push to `main` redeploys automatically.

## Notes, limits, and things to tune

- **"Live" is polling, not a websocket.** Yahoo's public chart endpoint has no streaming API,
  so the frontend polls `/api/quote` (interval scales with the selected range — every 5s on the
  1D view, every few minutes on 5Y/MAX). This is the same approach most free Yahoo-based tools use.
  For true tick-by-tick data you'd need a paid market-data websocket feed (e.g. Polygon.io,
  Twelve Data, or a broker's streaming API) — swapping that in only touches `api/quote/route.ts`
  and the polling `useEffect` in `app/page.tsx`.
- **Rate limits.** Yahoo isn't an official public API and can throttle or 429 aggressive polling,
  especially from a shared IP like a serverless region. If you see errors under load, raise the
  poll intervals in `lib/ranges.ts` or add a small in-memory/Redis cache in front of `/api/chart`.
- **Symbols**: use Yahoo's own tickers — e.g. `^NSEI` (Nifty 50), `^GSPC` (S&P 500), `AAPL`,
  `RELIANCE.NS`, `BTC-USD`. The search box (`/api/search`) helps you find the right suffix.
- **Tuning the S/R sensitivity**: `calculateSupportResistance()` in `lib/supportResistance.ts`
  takes `swingWindow` (how many bars on each side define a swing point), `clusterPct` (how close
  two swing prices need to be to count as the same level), and `minTouches` (how many times price
  must revisit a zone before it's shown). Loosen `clusterPct` for more levels, tighten it for fewer,
  stronger ones.

### Swapping in `trendln` instead

If you specifically want `trendln`'s numpy/scipy trendline output (not just horizontal S/R), the
cleanest path on Vercel is a separate Python serverless function:

1. Add `api/srlevels.py` using Vercel's [Python runtime](https://vercel.com/docs/functions/runtimes/python),
   with a `requirements.txt` listing `trendln`, `numpy`, `pandas`.
2. Have that function accept a JSON array of OHLCV bars (POST) and return `trendln`'s calculated levels.
3. In `app/api/chart/route.ts`, replace the call to `calculateSupportResistance()` with a `fetch()`
   to that Python function.

This works, but expect meaingfully slower cold starts on that route since `numpy`/`scipy` are large
native dependencies — that tradeoff is why this template ships the TypeScript version by default.
