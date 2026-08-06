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
