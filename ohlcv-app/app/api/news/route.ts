import { NextRequest, NextResponse } from "next/server";
import { fetchRSS, hostnameOf } from "@/lib/rss";

export const runtime = "nodejs";

// Multiple sources per region, merged into one feed — a single publisher
// (even a good one like ET) skews coverage and repeats its own house
// angle on every story. Each URL fails independently (Promise.allSettled
// below), so one dead/renamed feed doesn't take the whole panel down —
// it just quietly drops out until it's fixed.
const FEEDS: Record<string, { url: string }[]> = {
  india: [
    { url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms" },
    { url: "https://www.moneycontrol.com/rss/business.xml" },
    { url: "https://www.livemint.com/rss/markets" },
    { url: "https://www.business-standard.com/rss/markets-106.rss" },
    { url: "https://www.financialexpress.com/market/feed/" },
  ],
  global: [
    { url: "https://finance.yahoo.com/news/rssindex" },
    { url: "https://uk.finance.yahoo.com/news/rssindex" },
    { url: "https://www.cnbc.com/id/20910258/device/rss/rss.html" },
    { url: "http://feeds.marketwatch.com/marketwatch/topstories/" },
  ],
};

function normalizeTitle(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region") || "india";
  const feeds = FEEDS[region];

  if (!feeds) {
    return NextResponse.json({ error: `Unknown region "${region}"` }, { status: 400 });
  }

  const results = await Promise.allSettled(feeds.map((f) => fetchRSS(f.url)));

  const merged = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const failedCount = results.filter((r) => r.status === "rejected").length;

  if (merged.length === 0) {
    return NextResponse.json(
      { error: "None of this region's news sources responded — try again shortly." },
      { status: 502 }
    );
  }

  const seen = new Set<string>();
  const deduped = merged.filter((it) => {
    const key = normalizeTitle(it.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  const withSource = deduped.slice(0, 30).map((it) => ({
    ...it,
    source: hostnameOf(it.link) || region,
  }));

  return NextResponse.json(
    { region, items: withSource, sourcesUsed: feeds.length - failedCount, sourcesTotal: feeds.length },
    { headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=300" } }
  );
}
