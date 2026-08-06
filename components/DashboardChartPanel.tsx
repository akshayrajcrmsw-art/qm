"use client";

import { useEffect, useState } from "react";
import Chart from "@/components/Chart";
import { Candle, YahooMeta } from "@/lib/yahoo";
import { SRLevel, TrendLine } from "@/lib/supportResistance";
import { EMAPoint } from "@/lib/indicators";

interface DashboardChartPanelProps {
  symbol: string;
  interval: "1wk" | "1d";
  label: string;
  showEMA: boolean;
}

interface ChartResponse {
  candles: Candle[];
  levels: SRLevel[];
  trendlines: TrendLine[];
  ema50: EMAPoint[];
  ema200: EMAPoint[];
  meta: YahooMeta;
  error?: string;
}

function fmt(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function DashboardChartPanel({
  symbol,
  interval,
  label,
  showEMA,
}: DashboardChartPanelProps) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [levels, setLevels] = useState<SRLevel[]>([]);
  const [trendlines, setTrendlines] = useState<TrendLine[]>([]);
  const [ema50, setEma50] = useState<EMAPoint[]>([]);
  const [ema200, setEma200] = useState<EMAPoint[]>([]);
  const [meta, setMeta] = useState<YahooMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/chart?symbol=${encodeURIComponent(symbol)}&range=max&interval=${interval}`
        );
        const data: ChartResponse = await res.json();
        if (cancelled) return;
        if (!res.ok || data.error) throw new Error(data.error || "Failed to load chart");
        setCandles(data.candles);
        setLevels(data.levels);
        setTrendlines(data.trendlines || []);
        setEma50(showEMA ? data.ema50 || [] : []);
        setEma200(showEMA ? data.ema200 || [] : []);
        setMeta(data.meta);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load chart");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    // background refresh so the current bar keeps up as time passes —
    // weekly/daily bars close infrequently, so a slow cadence is enough here.
    const poll = setInterval(load, 120000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [symbol, interval, showEMA]);

  const last = candles[candles.length - 1];
  const price = meta?.regularMarketPrice ?? last?.close;
  const prevClose = meta?.previousClose;
  const change = price != null && prevClose != null ? price - prevClose : null;
  const changePct = change != null && prevClose ? (change / prevClose) * 100 : null;
  const isUp = (change ?? 0) >= 0;

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">{label}</span>
        <span className="mono price" style={{ color: isUp ? "var(--up)" : "var(--down)" }}>
          {fmt(price)}
        </span>
        {changePct != null && (
          <span className="mono change" style={{ color: isUp ? "var(--up)" : "var(--down)" }}>
            {isUp ? "+" : ""}
            {fmt(changePct)}%
          </span>
        )}
      </div>
      <div className="chart-area">
        {loading && <div className="overlay mono">Loading…</div>}
        {!loading && error && <div className="overlay error mono">{error}</div>}
        {!loading && !error && candles.length > 0 && (
          <Chart
            candles={candles}
            levels={levels}
            trendlines={trendlines}
            ema50={ema50}
            ema200={ema200}
            currency={meta?.currency || ""}
            livePrice={null}
          />
        )}
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
          align-items: baseline;
          gap: 10px;
          padding: 10px 14px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .panel-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
        }
        .price {
          font-size: 13px;
        }
        .change {
          font-size: 11px;
        }
        .chart-area {
          position: relative;
          flex: 1;
          min-height: 0;
        }
        .overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: var(--text-dim);
        }
        .overlay.error {
          color: var(--down);
          text-align: center;
          padding: 0 20px;
        }
      `}</style>
    </div>
  );
}
