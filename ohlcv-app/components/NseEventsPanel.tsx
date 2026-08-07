"use client";

import { useCallback, useEffect, useState } from "react";

interface NseEvent {
  title: string;
  link: string;
  pubDate: string;
  category: string;
}

const CATEGORY_COLOR: Record<string, string> = {
  Results: "var(--up)",
  "Board Meeting": "var(--focus)",
  Announcement: "var(--accent)",
  Buyback: "var(--down)",
};

function formatDate(dateString: string): string {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "Recent";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NseEventsPanel() {
  const [items, setItems] = useState<NseEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch("/api/nse-events");
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to load NSE feed");
      setItems(data.items || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Unable to load NSE feed");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(() => load(true), 300000);
    return () => clearInterval(poll);
  }, [load]);

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">NSE Events</span>
        <button
          className={`refresh-btn ${refreshing ? "spinning" : ""}`}
          onClick={() => load(true)}
          title="Refresh"
        >
          ↻
        </button>
        <span className="live">
          <span className="dot" />
          LIVE
        </span>
      </div>

      <div className="panel-body">
        {loading && <div className="empty mono">Loading NSE feed…</div>}
        {!loading && error && <div className="empty error mono">{error}</div>}
        {!loading && !error && items.length === 0 && (
          <div className="empty mono">No recent filings found</div>
        )}
        {!loading &&
          !error &&
          items.map((item, i) => (
            <a
              key={`${item.link}-${i}`}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="event-card"
            >
              <span
                className="badge mono"
                style={{ color: CATEGORY_COLOR[item.category] || "var(--text-dim)" }}
              >
                {item.category}
              </span>
              <div className="event-title">{item.title}</div>
              <div className="event-time mono">{formatDate(item.pubDate)}</div>
            </a>
          ))}
      </div>

      <style jsx>{`
        .panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          overflow: hidden;
        }
        .panel-head {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .panel-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
        }
        .refresh-btn {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: 1px solid var(--border);
          background: transparent;
          color: var(--text-dim);
          font-size: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .refresh-btn:hover {
          color: var(--text);
          border-color: var(--text-faint);
        }
        .refresh-btn.spinning {
          animation: spin 0.6s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        .live {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          font-weight: 700;
          color: var(--text-faint);
          letter-spacing: 0.06em;
        }
        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--up);
        }
        .panel-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .empty {
          font-size: 12px;
          color: var(--text-faint);
          padding: 12px 4px;
        }
        .empty.error {
          color: var(--down);
        }
        .event-card {
          display: block;
          text-decoration: none;
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 10px 12px;
          color: var(--text);
          transition: border-color 0.15s ease;
        }
        .event-card:hover {
          border-color: var(--text-faint);
        }
        .badge {
          display: inline-block;
          font-size: 9.5px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          border: 1px solid currentColor;
          border-radius: 999px;
          padding: 1px 7px;
          margin-bottom: 6px;
        }
        .event-title {
          font-size: 12.5px;
          line-height: 1.45;
          margin-bottom: 6px;
        }
        .event-time {
          font-size: 10.5px;
          color: var(--text-faint);
        }
      `}</style>
    </div>
  );
}
