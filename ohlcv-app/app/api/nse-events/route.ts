import { NextResponse } from "next/server";
import { fetchRSS } from "@/lib/rss";

export const runtime = "nodejs";

const NSE_HOME = "https://www.nseindia.com/";

const FEEDS: { url: string; category: string }[] = [
  { url: "https://nsearchives.nseindia.com/content/RSS/Financial_Results.xml", category: "Results" },
  { url: "https://nsearchives.nseindia.com/content/RSS/Board_Meetings.xml", category: "Board Meeting" },
  { url: "https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml", category: "Announcement" },
  { url: "https://nsearchives.nseindia.com/content/RSS/Daily_Buyback.xml", category: "Buyback" },
];

export async function GET() {
  const results = await Promise.allSettled(
    FEEDS.map((f) => fetchRSS(f.url, { referer: NSE_HOME, bootstrapFrom: NSE_HOME }))
  );

  const items = results.flatMap((r, i) =>
    r.status === "fulfilled" ? r.value.map((it) => ({ ...it, category: FEEDS[i].category })) : []
  );

  items.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  const failedFeeds = results
    .map((r, i) => (r.status === "rejected" ? FEEDS[i].category : null))
    .filter((x): x is string => x !== null);

  // If every single feed failed, surface that as a real error; a partial
  // failure (some categories missing) still returns whatever came through.
  if (items.length === 0 && failedFeeds.length === FEEDS.length) {
    return NextResponse.json(
      {
        error:
          "NSE's feed didn't respond to this server — their archive endpoint sometimes blocks datacenter IPs regardless of headers.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json(
    { items: items.slice(0, 40), failedFeeds },
    { headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=300" } }
  );
}
