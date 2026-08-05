import { NextRequest, NextResponse } from "next/server";
import { fetchYahooChart } from "@/lib/yahoo";
import { calculateSupportResistance, calculateTrendlines } from "@/lib/supportResistance";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "^NSEI";
  const range = searchParams.get("range") || "1y";
  const interval = searchParams.get("interval") || "1d";

  try {
    const { candles, meta } = await fetchYahooChart(symbol, range, interval);
    const levels = calculateSupportResistance(candles);
    const trendlines = calculateTrendlines(candles);

    return NextResponse.json(
      { symbol, range, interval, candles, levels, trendlines, meta },
      { headers: { "Cache-Control": "s-maxage=10, stale-while-revalidate=30" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to fetch chart data" },
      { status: 502 }
    );
  }
}
