import { NextRequest, NextResponse } from "next/server";
import { fetchRSS, hostnameOf } from "@/lib/rss";

export const runtime = "nodejs";

const FEEDS: Record<string, string> = {
  india: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
  global: "https://finance.yahoo.com/news/rssindex",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region") || "india";
  const url = FEEDS[region];

  if (!url) {
    return NextResponse.json({ error: `Unknown region "${region}"` }, { status: 400 });
  }

  try {
    const items = await fetchRSS(url);

    const uniqueTitles = new Set<string>();
    const deduped = items.filter((it) => {
      if (uniqueTitles.has(it.title)) return false;
      uniqueTitles.add(it.title);
      return true;
    });

    const withSource = deduped.slice(0, 20).map((it) => ({
      ...it,
      source: hostnameOf(it.link) || region,
    }));

    return NextResponse.json(
      { region, items: withSource },
      { headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=300" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load news" },
      { status: 502 }
    );
  }
}
