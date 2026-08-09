import { NextRequest, NextResponse } from "next/server";
import { fetchYahooChart } from "@/lib/yahoo";

export const runtime = "nodejs";

// Small, frequent-poll-friendly endpoint: returns just the meta (live price,
// previous close) and the most recent 1-minute candle so the frontend can
// update the last bar and the price ticker without re-fetching full history.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "^NSEI";

  try {
    const { candles, meta } = await fetchYahooChart(symbol, "1d", "1m");
    const last = candles[candles.length - 1] || null;

    return NextResponse.json(
      { symbol, meta, last },
      { headers: { "Cache-Control": "s-maxage=3, stale-while-revalidate=5" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to fetch quote" },
      { status: 502 }
    );
  }
}
