export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface YahooMeta {
  symbol: string;
  currency: string;
  exchangeName: string;
  instrumentType: string;
  regularMarketPrice: number;
  previousClose: number;
  timezone: string;
  gmtoffset: number;
}

const YAHOO_HOSTS = [
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com",
];

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
};

export async function fetchYahooChart(
  symbol: string,
  range: string,
  interval: string
): Promise<{ candles: Candle[]; meta: YahooMeta }> {
  let lastErr: unknown = null;

  for (const host of YAHOO_HOSTS) {
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(
        symbol
      )}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(
        range
      )}&includePrePost=false`;

      const res = await fetch(url, {
        headers: BROWSER_HEADERS,
        cache: "no-store",
      });

      if (!res.ok) {
        lastErr = new Error(`Yahoo responded ${res.status} for ${symbol}`);
        continue;
      }

      const json = await res.json();
      const result = json?.chart?.result?.[0];

      if (!result) {
        const desc = json?.chart?.error?.description || "No data returned";
        lastErr = new Error(desc);
        continue;
      }

      const timestamps: number[] = result.timestamp || [];
      const quote = result.indicators?.quote?.[0] || {};
      const adjclose = result.indicators?.adjclose?.[0]?.adjclose;

      const candles: Candle[] = timestamps
        .map((t: number, i: number) => ({
          time: t,
          open: quote.open?.[i],
          high: quote.high?.[i],
          low: quote.low?.[i],
          close: adjclose ? adjclose[i] : quote.close?.[i],
          volume: quote.volume?.[i] ?? 0,
        }))
        .filter(
          (c: Candle) =>
            c.open != null &&
            c.high != null &&
            c.low != null &&
            c.close != null &&
            !Number.isNaN(c.open)
        );

      const m = result.meta;
      const meta: YahooMeta = {
        symbol: m.symbol,
        currency: m.currency,
        exchangeName: m.exchangeName,
        instrumentType: m.instrumentType,
        regularMarketPrice: m.regularMarketPrice,
        previousClose: m.chartPreviousClose ?? m.previousClose,
        timezone: m.exchangeTimezoneName,
        gmtoffset: m.gmtoffset,
      };

      return { candles, meta };
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("Failed to reach Yahoo Finance");
}

export interface YahooQuote {
  symbol: string;
  regularMarketPrice: number | null;
  regularMarketChange: number | null;
  regularMarketChangePercent: number | null;
  currency: string | null;
  shortName: string | null;
}

/** Batched live-quote lookup — one request for many symbols via v7/finance/quote. */
export async function fetchYahooQuotes(symbols: string[]): Promise<YahooQuote[]> {
  if (symbols.length === 0) return [];
  let lastErr: unknown = null;

  for (const host of YAHOO_HOSTS) {
    try {
      const url = `${host}/v7/finance/quote?symbols=${symbols
        .map((s) => encodeURIComponent(s))
        .join(",")}`;
      const res = await fetch(url, { headers: BROWSER_HEADERS, cache: "no-store" });
      if (!res.ok) {
        lastErr = new Error(`Yahoo quote responded ${res.status}`);
        continue;
      }
      const json = await res.json();
      const results = json?.quoteResponse?.result;
      if (!Array.isArray(results)) {
        lastErr = new Error(json?.quoteResponse?.error?.description || "No quote data");
        continue;
      }
      return results.map((q: any) => ({
        symbol: q.symbol,
        regularMarketPrice: q.regularMarketPrice ?? null,
        regularMarketChange: q.regularMarketChange ?? null,
        regularMarketChangePercent: q.regularMarketChangePercent ?? null,
        currency: q.currency ?? null,
        shortName: q.shortName ?? q.longName ?? null,
      }));
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("Failed to reach Yahoo Finance");
}

export interface OptionsChainResult {
  spotPrice: number;
  expiry: number; // unix seconds, the expiry actually returned
  availableExpiries: number[];
  contracts: { strike: number; openInterest: number; impliedVolatility: number; type: "call" | "put" }[];
}

// --- Yahoo crumb/cookie bootstrap -------------------------------------
// Yahoo increasingly requires a session cookie + "crumb" token for some
// v7/v8 endpoints (v7/finance/options among them — this is what was
// producing the 401 here). The standard workaround, used by yfinance and
// similar tools: hit a Yahoo domain to collect a session cookie, then
// exchange that cookie for a crumb, then send both together on the real
// request. Cached at module scope so a warm serverless instance reuses it
// instead of doing this dance on every request — crumbs are valid for a
// while, not just one call.
let cachedCrumb: { crumb: string; cookie: string; expiresAt: number } | null = null;

async function getYahooCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (cachedCrumb && cachedCrumb.expiresAt > Date.now()) {
    return { crumb: cachedCrumb.crumb, cookie: cachedCrumb.cookie };
  }

  try {
    // Step 1: visit a Yahoo domain to collect a session cookie.
    const cookieRes = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": BROWSER_HEADERS["User-Agent"] },
      redirect: "manual",
      cache: "no-store",
    });
    const cookie = cookieRes.headers.get("set-cookie");
    if (!cookie) return null;

    // Step 2: exchange that cookie for a crumb.
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": BROWSER_HEADERS["User-Agent"], Cookie: cookie },
      cache: "no-store",
    });
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.includes("<html")) return null; // Yahoo sometimes returns an error page, not a crumb

    cachedCrumb = { crumb, cookie, expiresAt: Date.now() + 25 * 60 * 1000 }; // ~25 min
    return { crumb, cookie };
  } catch {
    return null;
  }
}

/**
 * Yahoo's options-chain endpoint — a v7 endpoint, same family as
 * v7/finance/quote, which we've already found can be gated behind a
 * session cookie + crumb that anonymous server requests don't have. This
 * fetch is wrapped defensively by the caller (the gamma-exposure route)
 * for exactly that reason: if Yahoo blocks it, callers should get a clear
 * "options data unavailable" rather than a crash.
 */
export async function fetchYahooOptions(
  symbol: string,
  expiry?: number
): Promise<OptionsChainResult> {
  let lastErr: unknown = null;

  for (const host of YAHOO_HOSTS) {
    for (const withAuth of [false, true]) {
      try {
        let headers: Record<string, string> = { ...BROWSER_HEADERS };
        let crumbParam = "";

        if (withAuth) {
          const auth = await getYahooCrumb();
          if (!auth) continue; // couldn't get a crumb this round — try next option
          headers = { ...headers, Cookie: auth.cookie };
          crumbParam = `&crumb=${encodeURIComponent(auth.crumb)}`;
        }

        const url = `${host}/v7/finance/options/${encodeURIComponent(symbol)}?${
          expiry ? `date=${expiry}` : ""
        }${crumbParam}`;
        const res = await fetch(url, { headers, cache: "no-store" });

        if (!res.ok) {
          lastErr = new Error(`Yahoo options responded ${res.status}`);
          if (res.status === 401 && !withAuth) continue; // retry this host with a crumb
          continue;
        }

        const json = await res.json();
        const result = json?.optionChain?.result?.[0];
        if (!result) {
          const desc = json?.optionChain?.error?.description || "No options data returned";
          lastErr = new Error(desc);
          continue;
        }

        const spotPrice: number = result.quote?.regularMarketPrice;
        const availableExpiries: number[] = result.expirationDates || [];
        const optionsBlock = result.options?.[0];
        if (!spotPrice || !optionsBlock) {
          lastErr = new Error("Options chain response missing quote or contracts");
          continue;
        }

        const contracts: OptionsChainResult["contracts"] = [
          ...(optionsBlock.calls || []).map((c: any) => ({
            strike: c.strike,
            openInterest: c.openInterest || 0,
            impliedVolatility: c.impliedVolatility || 0,
            type: "call" as const,
          })),
          ...(optionsBlock.puts || []).map((c: any) => ({
            strike: c.strike,
            openInterest: c.openInterest || 0,
            impliedVolatility: c.impliedVolatility || 0,
            type: "put" as const,
          })),
        ];

        return {
          spotPrice,
          expiry: optionsBlock.expirationDate || expiry || availableExpiries[0],
          availableExpiries,
          contracts,
        };
      } catch (e) {
        lastErr = e;
      }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("Failed to reach Yahoo options chain");
}

export async function searchYahooSymbols(query: string) {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    query
  )}&quotesCount=8&newsCount=0`;
  const res = await fetch(url, { headers: BROWSER_HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`Symbol search failed: ${res.status}`);
  const json = await res.json();
  const quotes = (json?.quotes || []) as any[];
  return quotes
    .filter((q) => q.symbol)
    .map((q) => ({
      symbol: q.symbol as string,
      name: (q.shortname || q.longname || q.symbol) as string,
      exchange: (q.exchange || "") as string,
      type: (q.quoteType || "") as string,
    }));
}
