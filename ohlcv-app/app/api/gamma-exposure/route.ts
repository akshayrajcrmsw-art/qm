import { NextRequest, NextResponse } from "next/server";
import { fetchYahooOptions } from "@/lib/yahoo";
import { calculateGammaExposure } from "@/lib/gammaExposure";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "^NSEI";
  const expiryParam = searchParams.get("expiry");
  const expiry = expiryParam ? Number(expiryParam) : undefined;

  try {
    const chain = await fetchYahooOptions(symbol, expiry);
    const result = calculateGammaExposure(chain.contracts, chain.spotPrice, chain.expiry);

    if (!result) {
      return NextResponse.json(
        { error: "No usable open interest in this options chain" },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { ...result, availableExpiries: chain.availableExpiries },
      { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=180" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        error:
          e?.message ||
          "Options chain unavailable — even after attempting Yahoo's crumb/cookie auth flow, this symbol may not have listed options, or Yahoo may be blocking this server's IP outright.",
      },
      { status: 502 }
    );
  }
}
