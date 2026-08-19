"use client";

import { useEffect, useId, useState } from "react";

interface TickerItem {
  label: string;
  symbol: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  currency: string;
  spark: number[];
}

function AreaSparkline({ values, isUp }: { values: number[]; isUp: boolean | null }) {
  const gradientId = useId();
  const width = 84;
  const height = 32;

  if (values.length < 2) {
    return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const color = isUp == null ? "#7c879b" : isUp ? "#2ee6a6" : "#ff4d4d";

  const linePoints = values.map(
    (v, i) => [i * step, height - 2 - ((v - min) / range) * (height - 6)] as const
  );
  const lineStr = linePoints.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaStr =
    `0,${height} ` + lineStr + ` ${width.toFixed(1)},${height}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaStr} fill={`url(#${gradientId})`} />
      <polyline
        points={lineStr}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TickerChip({ item }: { item: TickerItem }) {
  const isUp = item.changePct == null ? null : item.changePct >= 0;
  const color = isUp == null ? "var(--text-faint)" : isUp ? "var(--up)" : "var(--down)";

  return (
    <div className="chip">
      <div className="chip-info">
        <span className="chip-label">{item.label}</span>
        <span className="chip-price mono">
          {item.price != null
            ? item.price.toLocaleString(undefined, { maximumFractionDigits: 2 })
            : "—"}
          <span className="chip-currency">{item.currency}</span>
        </span>
        <span className="chip-change mono" style={{ color }}>
          {item.changePct != null ? `${isUp ? "+" : ""}${item.changePct.toFixed(2)}%` : "—"}
        </span>
      </div>

      <AreaSparkline values={item.spark} isUp={isUp} />

      <style jsx>{`
        .chip {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          padding: 10px 20px;
          white-space: nowrap;
          border-right: 1px solid var(--border);
          flex-shrink: 0;
        }
        .chip-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .chip-label {
          font-size: 11px;
          color: var(--text-dim);
        }
        .chip-price {
          font-size: 14px;
          color: var(--text);
          font-weight: 500;
        }
        .chip-currency {
          font-size: 9px;
          color: var(--text-faint);
          margin-left: 4px;
        }
        .chip-change {
          font-size: 11px;
          font-weight: 500;
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
      <div
        className="tape-track"
        style={{ animationPlayState: items.length ? "running" : "paused" }}
      >
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
          border-radius: 3px;
        }
        .tape-track {
          display: flex;
          width: max-content;
          animation: scroll 110s linear infinite;
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
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
}
