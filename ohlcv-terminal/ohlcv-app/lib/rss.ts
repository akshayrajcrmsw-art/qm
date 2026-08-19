import { XMLParser } from "fast-xml-parser";

export interface RSSItem {
  title: string;
  link: string;
  pubDate: string;
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

function textOf(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if ("#text" in obj) return String(obj["#text"]).trim();
    return "";
  }
  return String(v).trim();
}

export function parseRSSXml(xml: string): RSSItem[] {
  const data = parser.parse(xml);
  const channel = data?.rss?.channel ?? data?.feed; // fall back to bare Atom <feed>
  if (!channel) return [];

  let items = channel.item ?? channel.entry;
  if (!items) return [];
  if (!Array.isArray(items)) items = [items];

  return items
    .map((it: any): RSSItem => {
      const link =
        typeof it.link === "object" && it.link?.["@_href"]
          ? it.link["@_href"] // Atom-style <link href="..."/>
          : textOf(it.link);
      return {
        title: textOf(it.title),
        link,
        pubDate: textOf(it.pubDate ?? it.published ?? it.updated),
      };
    })
    .filter((it: RSSItem) => it.title && it.link);
}

export async function fetchRSS(
  url: string,
  opts?: { referer?: string; bootstrapFrom?: string }
): Promise<RSSItem[]> {
  const headers: Record<string, string> = {
    "User-Agent": BROWSER_UA,
    Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
  };
  if (opts?.referer) headers["Referer"] = opts.referer;

  let res = await fetch(url, { headers, cache: "no-store" });

  // Some sources (notably NSE) reject bare requests without a session
  // cookie. Hitting the homepage first and replaying its Set-Cookie is the
  // usual workaround — best-effort, since a WAF can still block a
  // datacenter IP outright regardless.
  if ((res.status === 401 || res.status === 403) && opts?.bootstrapFrom) {
    try {
      const home = await fetch(opts.bootstrapFrom, {
        headers: { "User-Agent": BROWSER_UA },
        cache: "no-store",
      });
      const cookie = home.headers.get("set-cookie");
      if (cookie) {
        res = await fetch(url, { headers: { ...headers, Cookie: cookie }, cache: "no-store" });
      }
    } catch {
      // fall through to the error below
    }
  }

  if (!res.ok) throw new Error(`RSS fetch failed (${res.status}) for ${url}`);
  const xml = await res.text();
  return parseRSSXml(xml);
}

export function hostnameOf(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
