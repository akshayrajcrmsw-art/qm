"use client";

import { useEffect, useState } from "react";

interface TickerItem {
  label: string;
  symbol: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  currency: string;
  spark: number[];
}

function Sparkline({ values, isUp }: { values: number[]; isUp: boolean }) {
  if (values.length < 2) {
    return <svg width="56" height="24" viewBox="0 0 56 24" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = 56 / (values.length - 1);

  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(24 - ((v - min) / range) * 22 - 1).toFixed(1)}`)
    .join(" ");

  return (
    <svg width="56" height="24" viewBox="0 0 56 24">
      <polyline
        points={points}
        fill="none"
        stroke={isUp ? "#3ddc97" : "#ff5c5c"}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TickerChip({ item }: { item: TickerItem }) {
  const isUp = (item.changePct ?? 0) >= 0;
  const color = isUp ? "var(--up)" : "var(--down)";

  return (
    <div className="chip">
      <span className="chip-label">{item.label}</span>
      <span className="chip-price mono">
        {item.price != null
          ? item.price.toLocaleString(undefined, { maximumFractionDigits: 2 })
          : "—"}
      </span>
      <Sparkline values={item.spark} isUp={isUp} />
      <span className="chip-change mono" style={{ color }}>
        {item.changePct != null
          ? `${isUp ? "+" : ""}${item.changePct.toFixed(2)}%`
          : "—"}
      </span>

      <style jsx>{`
        .chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 0 18px;
          white-space: nowrap;
          border-right: 1px solid var(--border);
          flex-shrink: 0;
        }
        .chip-label {
          font-size: 12px;
          color: var(--text-dim);
        }
        .chip-price {
          font-size: 12px;
          color: var(--text);
        }
        .chip-change {
          font-size: 12px;
          font-weight: 500;
          min-width: 52px;
        }
      `}</style>
    </div>
  );
}

export default function TickerTape() {
  const [items, setItems] = useState<TickerItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/ticker-tape");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || data.error) {
          setError(data.error || "Failed to load markets");
          return;
        }
        setError(null);
        setItems(data.items || []);
      } catch {
        if (!cancelled) setError("Failed to load markets");
      }
    }

    load();
    const poll = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, []);

  if (error && items.length === 0) {
    return <div className="tape-error mono">{error}</div>;
  }

  // Duplicate the list so the CSS marquee can loop seamlessly at -50%.
  const loopItems = [...items, ...items];

  return (
    <div className="tape">
      <div className="tape-track" style={{ animationPlayState: items.length ? "running" : "paused" }}>
        {loopItems.map((item, i) => (
          <TickerChip key={`${item.symbol}-${i}`} item={item} />
        ))}
      </div>

      <style jsx>{`
        .tape {
          width: 100%;
          overflow: hidden;
          background: var(--bg-panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 10px 0;
        }
        .tape-track {
          display: flex;
          width: max-content;
          animation: scroll 90s linear infinite;
        }
        .tape:hover .tape-track {
          animation-play-state: paused;
        }
        @keyframes scroll {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
        .tape-error {
          padding: 12px 16px;
          font-size: 12px;
          color: var(--text-faint);
          background: var(--bg-panel);
          border: 1px solid var(--border);
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}
