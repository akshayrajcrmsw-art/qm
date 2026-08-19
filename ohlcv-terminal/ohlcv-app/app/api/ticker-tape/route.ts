import { NextResponse } from "next/server";
import { fetchYahooChart } from "@/lib/yahoo";
import { GLOBAL_MARKETS } from "@/lib/globalMarkets";

export const runtime = "nodejs";
export const maxDuration = 30;

interface MarketItem {
  label: string;
  symbol: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  currency: string;
  spark: number[];
}

// v8/finance/chart's `meta` already carries regularMarketPrice and
// previousClose, so one call per symbol gets both the live price/% change
// AND the sparkline data. This intentionally avoids v7/finance/quote (the
// batched quote endpoint) — Yahoo has increasingly gated that one behind a
// session cookie + crumb token that anonymous server requests don't have,
// which was failing silently and leaving every price/% blank.
async function fetchMarketItem(label: string, symbol: string): Promise<MarketItem> {
  const empty: MarketItem = {
    label,
    symbol,
    price: null,
    change: null,
    changePct: null,
    currency: "",
    spark: [],
  };

  try {
    const { candles, meta } = await fetchYahooChart(symbol, "1d", "1m");
    if (candles.length >= 2) {
      const price = meta.regularMarketPrice ?? candles[candles.length - 1].close;
      const prevClose = meta.previousClose;
      const change = prevClose != null ? price - prevClose : null;
      const changePct = change != null && prevClose ? (change / prevClose) * 100 : null;

      return {
        label,
        symbol,
        price,
        change,
        changePct,
        currency: meta.currency || "",
        spark: candles.map((c) => c.close),
      };
    }
  } catch {
    // fall through to the 5d/1h fallback below
  }

  // Outside market hours (or right after a holiday) 1d/1m can come back
  // empty — fall back to a slightly wider window so there's still a
  // sparkline and a price, even if % change ends up derived from that
  // window's own start rather than yesterday's official close.
  try {
    const { candles, meta } = await fetchYahooChart(symbol, "5d", "1h");
    if (candles.length >= 2) {
      const price = meta.regularMarketPrice ?? candles[candles.length - 1].close;
      const prevClose = meta.previousClose;
      const change = prevClose != null ? price - prevClose : null;
      const changePct = change != null && prevClose ? (change / prevClose) * 100 : null;

      return {
        label,
        symbol,
        price,
        change,
        changePct,
        currency: meta.currency || "",
        spark: candles.map((c) => c.close),
      };
    }
  } catch {
    // give up, return the empty placeholder
  }

  return empty;
}

export async function GET() {
  try {
    const items = await Promise.all(
      GLOBAL_MARKETS.map((m) => fetchMarketItem(m.label, m.symbol))
    );

    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=90" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load market data" },
      { status: 502 }
    );
  }
}
