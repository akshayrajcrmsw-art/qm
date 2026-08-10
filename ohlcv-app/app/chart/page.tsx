"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Chart from "@/components/Chart";
import Controls from "@/components/Controls";
import VolumeProfilePanel from "@/components/VolumeProfilePanel";
import MonteCarloPanel from "@/components/MonteCarloPanel";
import GammaExposurePanel from "@/components/GammaExposurePanel";
import { Candle, YahooMeta } from "@/lib/yahoo";
import { SRLevel, TrendLine } from "@/lib/supportResistance";
import { IndicatorPoint, StdDevBands } from "@/lib/indicators";
import { VolumeProfileResult } from "@/lib/volumeProfile";
import { MonteCarloResult, runMonteCarloSimulation } from "@/lib/monteCarlo";
import {
  DEFAULT_INTERVAL_LABEL,
  DEFAULT_RANGE_LABEL,
  DEFAULT_SYMBOL,
  INTERVAL_OPTIONS,
  RANGE_OPTIONS,
  bestIntervalForRange,
  bestRangeForInterval,
  isValidCombo,
} from "@/lib/ranges";

interface ChartResponse {
  candles: Candle[];
  levels: SRLevel[];
  trendlines: TrendLine[];
  ewma50: IndicatorPoint[];
  ewma200: IndicatorPoint[];
  stdDevBands: StdDevBands;
  volumeProfile: VolumeProfileResult | null;
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
  return (
    <Suspense fallback={null}>
      <PageInner />
    </Suspense>
  );
}

function PageInner() {
  const pageRef = useRef<HTMLElement>(null);
  const searchParams = useSearchParams();
  const initialSymbol = searchParams.get("symbol");
  const [symbol, setSymbol] = useState(initialSymbol || DEFAULT_SYMBOL);
  const [rangeLabel, setRangeLabel] = useState(DEFAULT_RANGE_LABEL);
  const [intervalLabel, setIntervalLabel] = useState(DEFAULT_INTERVAL_LABEL);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [levels, setLevels] = useState<SRLevel[]>([]);
  const [trendlines, setTrendlines] = useState<TrendLine[]>([]);
  const [ewma50, setEwma50] = useState<IndicatorPoint[]>([]);
  const [ewma200, setEwma200] = useState<IndicatorPoint[]>([]);
  const [stdDevBandsRaw, setStdDevBandsRaw] = useState<StdDevBands | null>(null);
  const [volumeProfileRaw, setVolumeProfileRaw] = useState<VolumeProfileResult | null>(null);
  const [meta, setMeta] = useState<YahooMeta | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [hover, setHover] = useState<Candle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [monteCarloBars, setMonteCarloBars] = useState(60);
  const [monteCarlo, setMonteCarlo] = useState<MonteCarloResult | null>(null);

  const [stdDevOn, setStdDevOn] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Range and interval are picked independently, but not every combination
  // is valid against Yahoo's lookback limits (e.g. 5m candles only go back
  // ~60 days). Changing one auto-corrects the other to the nearest valid
  // choice rather than erroring out.
  function handleRangeChange(label: string) {
    setRangeLabel(label);
    if (!isValidCombo(label, intervalLabel)) {
      setIntervalLabel(bestIntervalForRange(label));
    }
  }

  function handleIntervalChange(label: string) {
    setIntervalLabel(label);
    if (!isValidCombo(rangeLabel, label)) {
      setRangeLabel(bestRangeForInterval(label));
    }
  }

  const rangeOpt = RANGE_OPTIONS.find((o) => o.label === rangeLabel)!;
  const intervalOpt = INTERVAL_OPTIONS.find((o) => o.label === intervalLabel)!;

  const loadChart = useCallback(async (sym: string, range: string, interval: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/chart?symbol=${encodeURIComponent(sym)}&range=${range}&interval=${interval}`
      );
      const data: ChartResponse = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to load chart");
      setCandles(data.candles);
      setLevels(data.levels);
      setTrendlines(data.trendlines || []);
      setEwma50(data.ewma50 || []);
      setEwma200(data.ewma200 || []);
      setStdDevBandsRaw(data.stdDevBands || null);
      setVolumeProfileRaw(data.volumeProfile || null);
      setMeta(data.meta);
      setLivePrice(null);
    } catch (e: any) {
      setError(e?.message || "Failed to load chart");
    } finally {
      setLoading(false);
    }
  }, []);

  // Same fetch, but for background refreshes: no loading spinner, and a
  // failure just keeps the last known-good data instead of showing an error.
  const refreshChartSilently = useCallback(async (sym: string, range: string, interval: string) => {
    try {
      const res = await fetch(
        `/api/chart?symbol=${encodeURIComponent(sym)}&range=${range}&interval=${interval}`
      );
      const data: ChartResponse = await res.json();
      if (!res.ok || data.error) return;
      setCandles(data.candles);
      setLevels(data.levels);
      setTrendlines(data.trendlines || []);
      setEwma50(data.ewma50 || []);
      setEwma200(data.ewma200 || []);
      setStdDevBandsRaw(data.stdDevBands || null);
      setVolumeProfileRaw(data.volumeProfile || null);
      setMeta((prev) => data.meta ?? prev);
    } catch {
      // ignore — next cycle will retry
    }
  }, []);

  useEffect(() => {
    loadChart(symbol, rangeOpt.range, intervalOpt.value);
  }, [symbol, rangeOpt.range, intervalOpt.value, loadChart]);

  // Fast poll: just the latest traded price, used to grow the in-progress
  // candle smoothly between bar closes.
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);

    async function tick() {
      try {
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
        const data = await res.json();
        if (data?.meta) {
          setMeta(data.meta);
          if (typeof data.meta.regularMarketPrice === "number") {
            setLivePrice(data.meta.regularMarketPrice);
          }
        }
      } catch {
        // silent — keep last known state, try again next interval
      }
    }

    tick();
    pollRef.current = setInterval(tick, intervalOpt.pollMs);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [symbol, intervalOpt.pollMs]);

  // Slow poll: re-pull the actual candle history so a new bar shows up once
  // the current one closes (e.g. every 5 minutes on the 5m timeframe),
  // instead of endlessly stretching whatever the last fetched bar happens to
  // be. Runs less often than the price poll since it's a heavier request.
  const chartPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (chartPollRef.current) clearInterval(chartPollRef.current);

    const refreshMs = Math.max(intervalOpt.pollMs * 4, 20000);
    chartPollRef.current = setInterval(() => {
      refreshChartSilently(symbol, rangeOpt.range, intervalOpt.value);
    }, refreshMs);

    return () => {
      if (chartPollRef.current) clearInterval(chartPollRef.current);
    };
  }, [symbol, rangeOpt.range, intervalOpt.value, intervalOpt.pollMs, refreshChartSilently]);

  // Monte Carlo projection lives in the standalone analysis panel now (not
  // overlaid on the price chart), but still recomputes whenever the bar
  // count changes or fresh candles come in. Pure client-side math over data
  // already loaded — no extra API call.
  useEffect(() => {
    if (candles.length === 0) {
      setMonteCarlo(null);
      return;
    }
    const result = runMonteCarloSimulation(candles, {
      barsAhead: monteCarloBars,
      simulations: 500,
    });
    setMonteCarlo(result);
  }, [monteCarloBars, candles]);

  const stdDevBands = stdDevOn ? stdDevBandsRaw : null;

  // Merge the live price into the last known candle for display purposes
  // (the chart component does the same merge internally for the plotted bar).
  const rawLast = candles[candles.length - 1] || null;
  const mergedLast: Candle | null =
    rawLast && livePrice != null
      ? {
          ...rawLast,
          close: livePrice,
          high: Math.max(rawLast.high, livePrice),
          low: Math.min(rawLast.low, livePrice),
        }
      : rawLast;

  const displayCandle = hover || mergedLast;
  const price = meta?.regularMarketPrice ?? displayCandle?.close;
  const prevClose = meta?.previousClose;
  const change = price != null && prevClose != null ? price - prevClose : null;
  const changePct = change != null && prevClose ? (change / prevClose) * 100 : null;
  const isUp = (change ?? 0) >= 0;

  return (
    <main className="page" ref={pageRef}>
      <header className="topbar">
        <div className="brand">
          <Link href="/" className="brand-back" title="Back to dashboard">
            ←
          </Link>
          <span className="brand-mark">◈</span>
          <span className="brand-name">Ticker</span>
          <span className="brand-sub">Advanced chart</span>
        </div>
        <Controls
          symbol={symbol}
          rangeLabel={rangeLabel}
          intervalLabel={intervalLabel}
          onSymbolChange={setSymbol}
          onRangeChange={handleRangeChange}
          onIntervalChange={handleIntervalChange}
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
          <span className="mono delay-note">via Yahoo Finance — may lag real-time by up to ~15 min</span>
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

      <section className="mc-bar">
        <button
          className={`mc-toggle mono sd-toggle ${stdDevOn ? "active" : ""}`}
          onClick={() => setStdDevOn((v) => !v)}
        >
          <span className="mc-dot sd-dot" />
          Std Dev
        </button>
        <span className="mc-hint mono">
          Volume Profile, Monte Carlo, and Gamma Exposure are in the panel below
        </span>
      </section>

      <section className="chart-stack">
        <div className="chart-area">
          <button
            className="fs-btn"
            onClick={() => {
              if (pageRef.current) {
                if (document.fullscreenElement) {
                  document.exitFullscreen();
                } else {
                  pageRef.current.requestFullscreen();
                }
              }
            }}
            title="Fullscreen (Controls stay usable)"
            aria-label="Toggle fullscreen"
          >
            ⛶
          </button>
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
              trendlines={trendlines}
              ewma50={ewma50}
              ewma200={ewma200}
              stdDevBands={stdDevBands}
              currency={meta?.currency || ""}
              livePrice={livePrice}
              onCrosshair={setHover}
            />
          )}
        </div>

        <div className="analysis-row">
          <div className="analysis-slot">
            <VolumeProfilePanel candles={candles} profile={volumeProfileRaw} />
          </div>
          <div className="analysis-slot">
            <MonteCarloPanel
              result={monteCarlo}
              barsAhead={monteCarloBars}
              onBarsAheadChange={setMonteCarloBars}
            />
          </div>
          <div className="analysis-slot">
            <GammaExposurePanel symbol={symbol} />
          </div>
        </div>
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
          {trendlines.length > 0 && (
            <>
              <span className="levels-divider" />
              <span className="levels-label mono">Trend</span>
              {trendlines.map((t, i) => (
                <span
                  key={`trend-${t.type}-${i}`}
                  className="mono level-chip"
                  style={{
                    borderColor: t.type === "resistance" ? "var(--down)" : "var(--up)",
                    color: t.type === "resistance" ? "var(--down)" : "var(--up)",
                  }}
                >
                  {t.type === "resistance" ? "↘" : "↗"} {fmt(t.projectedEnd.price)}
                  <span className="level-strength">×{t.touches}</span>
                </span>
              ))}
            </>
          )}
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
        .brand-back {
          color: var(--text-dim);
          text-decoration: none;
          font-size: 16px;
          padding: 2px 4px;
        }
        .brand-back:hover {
          color: var(--text);
        }
        .brand-sub {
          font-size: 11px;
          color: var(--text-faint);
          border-left: 1px solid var(--border);
          padding-left: 8px;
          margin-left: 2px;
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
        .mc-bar {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
          padding: 8px 0;
        }
        .mc-toggle {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: var(--bg-panel-raised);
          border: 1px solid var(--border);
          border-radius: 3px;
          padding: 5px 12px;
          font-size: 11.5px;
          color: var(--text-dim);
        }
        .mc-toggle.active {
          border-color: #a78bfa;
          color: #a78bfa;
        }
        .mc-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--text-faint);
        }
        .mc-toggle.active .mc-dot {
          background: #a78bfa;
        }
        .sd-toggle.active {
          border-color: #7c879b;
          color: #b6bfcf;
        }
        .sd-toggle.active .sd-dot {
          background: #b6bfcf;
        }
        .mc-hint {
          font-size: 11px;
          color: var(--text-faint);
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
        .delay-note {
          font-size: 10px;
          color: var(--text-faint);
          margin-left: 4px;
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
        .chart-stack {
          display: flex;
          flex-direction: column;
          gap: 10px;
          flex: 1;
          min-height: 0;
        }
        .chart-area {
          position: relative;
          flex: 1 1 60%;
          min-height: 0;
          background: var(--bg-panel);
          border: 1px solid var(--border);
          border-radius: 3px;
          overflow: hidden;
        }
        .fs-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 5;
          background: var(--bg-panel-raised);
          border: 1px solid var(--border);
          color: var(--text-dim);
          font-size: 13px;
          border-radius: 3px;
          padding: 4px 8px;
          line-height: 1;
        }
        .fs-btn:hover {
          color: var(--text);
          border-color: var(--text-faint);
        }
        .analysis-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 10px;
          flex: 0 0 260px;
          min-height: 0;
        }
        .analysis-slot {
          min-height: 0;
        }
        @media (max-width: 1000px) {
          .analysis-row {
            grid-template-columns: 1fr;
            flex-basis: auto;
          }
          .analysis-slot {
            min-height: 220px;
          }
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
          border-radius: 3px;
          padding: 3px 9px;
          display: inline-flex;
          gap: 5px;
          align-items: baseline;
          white-space: nowrap;
        }
        .level-strength {
          color: var(--text-faint);
        }
        .levels-divider {
          width: 1px;
          align-self: stretch;
          background: var(--border);
          flex-shrink: 0;
          margin: 0 2px;
        }
      `}</style>
    </main>
  );
}
