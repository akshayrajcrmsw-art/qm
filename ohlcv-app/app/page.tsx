"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Chart from "@/components/Chart";
import Controls from "@/components/Controls";
import { Candle, YahooMeta } from "@/lib/yahoo";
import { SRLevel } from "@/lib/supportResistance";
import { DEFAULT_RANGE_LABEL, DEFAULT_SYMBOL, RANGE_OPTIONS } from "@/lib/ranges";

interface ChartResponse {
  candles: Candle[];
  levels: SRLevel[];
  meta: YahooMeta;
  error?: string;
}

function fmt(n: number | undefined | null, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function Page() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [rangeLabel, setRangeLabel] = useState(DEFAULT_RANGE_LABEL);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [levels, setLevels] = useState<SRLevel[]>([]);
  const [meta, setMeta] = useState<YahooMeta | null>(null);
  const [liveTick, setLiveTick] = useState<Candle | null>(null);
  const [hover, setHover] = useState<Candle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeOpt = RANGE_OPTIONS.find((o) => o.label === rangeLabel)!;

  const loadChart = useCallback(async (sym: string, label: string) => {
    const opt = RANGE_OPTIONS.find((o) => o.label === label)!;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/chart?symbol=${encodeURIComponent(sym)}&range=${opt.range}&interval=${opt.interval}`
      );
      const data: ChartResponse = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to load chart");
      setCandles(data.candles);
      setLevels(data.levels);
      setMeta(data.meta);
      setLiveTick(null);
    } catch (e: any) {
      setError(e?.message || "Failed to load chart");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChart(symbol, rangeLabel);
  }, [symbol, rangeLabel, loadChart]);

  // live polling for latest price / last-bar update
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);

    async function tick() {
      try {
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
        const data = await res.json();
        if (data?.meta) setMeta(data.meta);
        if (data?.last) setLiveTick(data.last as Candle);
      } catch {
        // silent — keep last known state, try again next interval
      }
    }

    tick();
    pollRef.current = setInterval(tick, activeOpt.pollMs);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [symbol, activeOpt.pollMs]);

  const displayCandle = hover || liveTick || candles[candles.length - 1] || null;
  const price = meta?.regularMarketPrice ?? displayCandle?.close;
  const prevClose = meta?.previousClose;
  const change = price != null && prevClose != null ? price - prevClose : null;
  const changePct = change != null && prevClose ? (change / prevClose) * 100 : null;
  const isUp = (change ?? 0) >= 0;

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◈</span>
          <span className="brand-name">Ticker</span>
        </div>
        <Controls
          symbol={symbol}
          rangeLabel={rangeLabel}
          onSymbolChange={setSymbol}
          onRangeChange={setRangeLabel}
        />
      </header>

      <section className="pricebar">
        <div className="pricebar-left">
          <span className="mono symbol-label">{meta?.symbol || symbol}</span>
          <span className="mono price" style={{ color: isUp ? "var(--up)" : "var(--down)" }}>
            {fmt(price)}
          </span>
          {change != null && (
            <span
              className="mono change"
              style={{ color: isUp ? "var(--up)" : "var(--down)" }}
            >
              {isUp ? "▲" : "▼"} {fmt(Math.abs(change))} ({fmt(Math.abs(changePct ?? 0))}%)
            </span>
          )}
          <span className="mono currency">{meta?.currency}</span>
          <span className="live-dot" title="Live" />
        </div>

        {displayCandle && (
          <div className="ohlc mono">
            <span>O <b style={{ color: "var(--text)" }}>{fmt(displayCandle.open)}</b></span>
            <span>H <b style={{ color: "var(--up)" }}>{fmt(displayCandle.high)}</b></span>
            <span>L <b style={{ color: "var(--down)" }}>{fmt(displayCandle.low)}</b></span>
            <span>C <b style={{ color: "var(--text)" }}>{fmt(displayCandle.close)}</b></span>
          </div>
        )}
      </section>

      <section className="chart-area">
        {loading && <div className="overlay">Loading {symbol}…</div>}
        {!loading && error && (
          <div className="overlay error">
            Couldn&rsquo;t load &ldquo;{symbol}&rdquo; — {error}
          </div>
        )}
        {!loading && !error && candles.length > 0 && (
          <Chart
            candles={candles}
            levels={levels}
            currency={meta?.currency || ""}
            liveTick={liveTick}
            onCrosshair={setHover}
          />
        )}
      </section>

      <footer className="levels-bar">
        <span className="levels-label mono">S/R</span>
        <div className="levels-list">
          {levels.length === 0 && !loading && (
            <span className="mono levels-empty">No clear levels detected in this range</span>
          )}
          {levels.map((l) => (
            <span
              key={`${l.type}-${l.price}`}
              className="mono level-chip"
              style={{
                borderColor: l.type === "resistance" ? "var(--down)" : "var(--up)",
                color: l.type === "resistance" ? "var(--down)" : "var(--up)",
              }}
            >
              {l.type === "resistance" ? "R" : "S"} {fmt(l.price)}
              <span className="level-strength">×{l.strength}</span>
            </span>
          ))}
        </div>
      </footer>

      <style jsx>{`
        .page {
          display: flex;
          flex-direction: column;
          height: 100vh;
          padding: 14px 18px 10px;
          gap: 12px;
        }
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .brand-mark {
          color: var(--accent);
          font-size: 18px;
        }
        .brand-name {
          font-family: var(--font-display), sans-serif;
          font-weight: 700;
          font-size: 18px;
          letter-spacing: 0.01em;
        }
        .pricebar {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--border);
        }
        .pricebar-left {
          display: flex;
          align-items: baseline;
          gap: 12px;
          flex-wrap: wrap;
        }
        .symbol-label {
          font-size: 14px;
          color: var(--text-dim);
          letter-spacing: 0.03em;
        }
        .price {
          font-size: 28px;
          font-weight: 600;
        }
        .change {
          font-size: 14px;
        }
        .currency {
          font-size: 11px;
          color: var(--text-faint);
          text-transform: uppercase;
        }
        .live-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--up);
          box-shadow: 0 0 0 3px rgba(61, 220, 151, 0.15);
          animation: pulse 1.8s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        .ohlc {
          display: flex;
          gap: 14px;
          font-size: 12px;
          color: var(--text-dim);
        }
        .chart-area {
          position: relative;
          flex: 1;
          min-height: 0;
          background: var(--bg-panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          overflow: hidden;
        }
        .overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-dim);
          font-family: var(--font-mono), monospace;
          font-size: 13px;
        }
        .overlay.error {
          color: var(--down);
          text-align: center;
          padding: 0 24px;
        }
        .levels-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          overflow-x: auto;
          padding-top: 2px;
        }
        .levels-label {
          font-size: 11px;
          color: var(--text-faint);
          flex-shrink: 0;
        }
        .levels-list {
          display: flex;
          gap: 8px;
          flex-wrap: nowrap;
          overflow-x: auto;
        }
        .levels-empty {
          font-size: 12px;
          color: var(--text-faint);
        }
        .level-chip {
          flex-shrink: 0;
          font-size: 11px;
          border: 1px solid;
          border-radius: 999px;
          padding: 3px 9px;
          display: inline-flex;
          gap: 5px;
          align-items: baseline;
          white-space: nowrap;
        }
        .level-strength {
          color: var(--text-faint);
        }
      `}</style>
    </main>
  );
}
