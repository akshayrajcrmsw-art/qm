import { NextRequest, NextResponse } from "next/server";
import { searchYahooSymbols } from "@/lib/yahoo";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";

  if (q.trim().length < 1) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchYahooSymbols(q);
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" } }
    );
  } catch (e: any) {
    return NextResponse.json({ results: [], error: e?.message }, { status: 200 });
  }
}
