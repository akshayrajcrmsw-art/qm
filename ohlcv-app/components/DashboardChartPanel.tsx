"use client";

import { useEffect, useState } from "react";
import Chart from "@/components/Chart";
import { Candle, YahooMeta } from "@/lib/yahoo";
import { SRLevel, TrendLine } from "@/lib/supportResistance";
import { IndicatorPoint, StdDevBands } from "@/lib/indicators";

interface DashboardChartPanelProps {
  symbol: string;
  interval: "1wk" | "1d";
  label: string;
  /** Also enables StdDev bands. */
  showEMA: boolean;
  defaultVisibleBars?: number;
}

interface ChartResponse {
  candles: Candle[];
  levels: SRLevel[];
  trendlines: TrendLine[];
  ewma50: IndicatorPoint[];
  ewma200: IndicatorPoint[];
  stdDevBands: StdDevBands;
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
  defaultVisibleBars,
}: DashboardChartPanelProps) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [levels, setLevels] = useState<SRLevel[]>([]);
  const [trendlines, setTrendlines] = useState<TrendLine[]>([]);
  const [ewma50, setEwma50] = useState<IndicatorPoint[]>([]);
  const [ewma200, setEwma200] = useState<IndicatorPoint[]>([]);
  const [stdDevBands, setStdDevBands] = useState<StdDevBands | null>(null);
  const [currency, setCurrency] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Live price/% change come from a separate, cheap quote poll — not from
  // the chart's own meta. Yahoo's `previousClose` on a weekly/daily *range*
  // fetch refers to the bar just before the plotted range (which can be
  // long ago), not "yesterday's close", so computing % change from it
  // produces nonsense (e.g. 400%+) once the range spans more than a day.
  const [quotePrice, setQuotePrice] = useState<number | null>(null);
  const [quotePrevClose, setQuotePrevClose] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/chart?symbol=${encodeURIComponent(symbol)}&range=30y&interval=${interval}`
        );
        const data: ChartResponse = await res.json();
        if (cancelled) return;
        if (!res.ok || data.error) throw new Error(data.error || "Failed to load chart");
        setCandles(data.candles);
        setLevels(data.levels);
        setTrendlines(data.trendlines || []);
        setEwma50(showEMA ? data.ewma50 || [] : []);
        setEwma200(showEMA ? data.ewma200 || [] : []);
        setStdDevBands(showEMA ? data.stdDevBands || null : null);
        setCurrency(data.meta?.currency || "");
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

  useEffect(() => {
    let cancelled = false;

    async function loadQuote() {
      try {
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
        const data = await res.json();
        if (cancelled || !data?.meta) return;
        if (typeof data.meta.regularMarketPrice === "number") {
          setQuotePrice(data.meta.regularMarketPrice);
        }
        if (typeof data.meta.previousClose === "number") {
          setQuotePrevClose(data.meta.previousClose);
        }
      } catch {
        // keep last known values
      }
    }

    loadQuote();
    const poll = setInterval(loadQuote, 30000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [symbol]);

  const last = candles[candles.length - 1];
  const price = quotePrice ?? last?.close ?? null;
  const change = price != null && quotePrevClose != null ? price - quotePrevClose : null;
  const changePct =
    change != null && quotePrevClose ? (change / quotePrevClose) * 100 : null;
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
            ewma50={ewma50}
            ewma200={ewma200}
            stdDevBands={stdDevBands}
            currency={currency}
            livePrice={null}
            defaultVisibleBars={defaultVisibleBars}
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
