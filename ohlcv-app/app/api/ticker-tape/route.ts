import { NextResponse } from "next/server";
import { fetchYahooChart, fetchYahooQuotes } from "@/lib/yahoo";
import { GLOBAL_MARKETS } from "@/lib/globalMarkets";

export const runtime = "nodejs";
export const maxDuration = 30;

async function sparkline(symbol: string): Promise<number[]> {
  try {
    // Today's minute-by-minute price path, as specified.
    const { candles } = await fetchYahooChart(symbol, "1d", "1m");
    if (candles.length >= 2) return candles.map((c) => c.close);
  } catch {
    // fall through to the fallback below
  }

  // Outside market hours (or right after a holiday) 1d/1m can come back
  // empty — fall back to a short recent window so the sparkline still shows
  // something rather than going blank.
  try {
    const { candles } = await fetchYahooChart(symbol, "5d", "1h");
    return candles.map((c) => c.close);
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const symbols = GLOBAL_MARKETS.map((m) => m.symbol);

    const [quotes, sparks] = await Promise.all([
      fetchYahooQuotes(symbols).catch(() => []),
      Promise.all(symbols.map(sparkline)),
    ]);

    const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

    const items = GLOBAL_MARKETS.map((m, i) => {
      const q = quoteMap.get(m.symbol);
      return {
        label: m.label,
        symbol: m.symbol,
        price: q?.regularMarketPrice ?? null,
        change: q?.regularMarketChange ?? null,
        changePct: q?.regularMarketChangePercent ?? null,
        currency: q?.currency ?? "",
        spark: sparks[i] || [],
      };
    });

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
