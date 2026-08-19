"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  UTCTimestamp,
} from "lightweight-charts";
import { Candle } from "@/lib/yahoo";
import { VolumeProfileResult, calculateVolumeProfile } from "@/lib/volumeProfile";

function fmt(n: number | undefined | null, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

interface VolumeProfilePanelProps {
  symbol: string;
}

interface ChartResponse {
  candles: Candle[];
  error?: string;
}

async function fetchSessionCandles(symbol: string): Promise<Candle[]> {
  // Today's session, 5-minute bars — a real "session" window, not months of
  // daily bars. Falls back to a slightly wider window if the market's
  // closed and today has no bars yet (e.g. before open, or a holiday).
  try {
    const res = await fetch(
      `/api/chart?symbol=${encodeURIComponent(symbol)}&range=1d&interval=5m`
    );
    const data: ChartResponse = await res.json();
    if (res.ok && !data.error && data.candles.length >= 3) return data.candles;
  } catch {
    // fall through
  }

  try {
    const res = await fetch(
      `/api/chart?symbol=${encodeURIComponent(symbol)}&range=5d&interval=15m`
    );
    const data: ChartResponse = await res.json();
    if (res.ok && !data.error) return data.candles;
  } catch {
    // fall through
  }

  return [];
}

export default function VolumeProfilePanel({ symbol }: VolumeProfilePanelProps) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const c = await fetchSessionCandles(symbol);
        if (cancelled) return;
        if (c.length === 0) {
          setError("No session data available for this symbol");
        } else {
          setCandles(c);
        }
      } catch {
        if (!cancelled) setError("Failed to load session data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const poll = setInterval(load, 60000); // keep the developing session profile live
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [symbol]);

  const profile: VolumeProfileResult | null =
    candles.length > 0 ? calculateVolumeProfile(candles, 60) : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [vpBars, setVpBars] = useState<
    { top: number; height: number; buyPct: number; sellPct: number; isPoc: boolean }[]
  >([]);

  // Create the mini chart once.
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#7c879b",
        fontFamily: "var(--font-mono), monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "#151a23" },
        horzLines: { color: "#151a23" },
      },
      rightPriceScale: { borderColor: "#1d2430", scaleMargins: { top: 0.06, bottom: 0.06 } },
      timeScale: { borderColor: "#1d2430", timeVisible: true, secondsVisible: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      autoSize: true,
    });

    const series = chart.addCandlestickSeries({
      upColor: "#2ee6a6",
      downColor: "#ff4d4d",
      borderUpColor: "#2ee6a6",
      borderDownColor: "#ff4d4d",
      wickUpColor: "#2ee6a6",
      wickDownColor: "#ff4d4d",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Push candle data.
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;
    seriesRef.current.setData(
      candles.map(
        (c): CandlestickData => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })
      )
    );
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // POC / VAH / VAL / developing-POC price lines.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    const lines: ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[] = [];

    if (profile) {
      const pocPrice =
        (profile.buckets[profile.pocIndex].priceLow + profile.buckets[profile.pocIndex].priceHigh) /
        2;

      lines.push(
        series.createPriceLine({
          price: pocPrice,
          color: "#f0a868",
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: true,
          title: "POC",
        })
      );
      lines.push(
        series.createPriceLine({
          price: profile.valueAreaHigh,
          color: "#5b8def",
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: true,
          title: "VAH",
        })
      );
      lines.push(
        series.createPriceLine({
          price: profile.valueAreaLow,
          color: "#5b8def",
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: true,
          title: "VAL",
        })
      );
      if (profile.developingPoc != null) {
        lines.push(
          series.createPriceLine({
            price: profile.developingPoc,
            color: "#a78bfa",
            lineWidth: 1,
            lineStyle: 3,
            axisLabelVisible: true,
            title: "Dev POC",
          })
        );
      }
    }

    return () => {
      for (const line of lines) series.removePriceLine(line);
    };
  }, [profile]);

  // Volume profile bars, anchored to the mini chart's own price coordinates
  // so they line up with the candles regardless of zoom/pan. Each bar is
  // split into a buy segment and a sell segment by width, so the color
  // split within the bar shows the buy/sell mix at that price level.
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) {
      setVpBars([]);
      return;
    }
    if (!profile || profile.buckets.length === 0) {
      setVpBars([]);
      return;
    }

    function recompute() {
      if (!seriesRef.current || !profile) return;
      const maxVol = profile.maxVolume || 1;
      const bars = profile.buckets
        .map((b, i) => {
          const yHigh = seriesRef.current!.priceToCoordinate(b.priceHigh);
          const yLow = seriesRef.current!.priceToCoordinate(b.priceLow);
          if (yHigh == null || yLow == null) return null;
          const totalWidthPct = (b.volume / maxVol) * 100;
          const buyPct = b.volume > 0 ? (b.buyVolume / b.volume) * totalWidthPct : 0;
          const sellPct = b.volume > 0 ? (b.sellVolume / b.volume) * totalWidthPct : 0;
          return {
            top: Math.min(yHigh, yLow),
            height: Math.max(1, Math.abs(yLow - yHigh) - 1),
            buyPct,
            sellPct,
            isPoc: i === profile.pocIndex,
          };
        })
        .filter((b): b is NonNullable<typeof b> => b !== null);
      setVpBars(bars);
    }

    recompute();
    chartRef.current.timeScale().subscribeVisibleLogicalRangeChange(recompute);
    const ro = new ResizeObserver(recompute);
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      chartRef.current?.timeScale().unsubscribeVisibleLogicalRangeChange(recompute);
      ro.disconnect();
    };
  }, [profile, candles]);

  const pocPrice = profile
    ? (profile.buckets[profile.pocIndex].priceLow + profile.buckets[profile.pocIndex].priceHigh) / 2
    : null;

  const totalVol = profile ? profile.totalBuyVolume + profile.totalSellVolume : 0;
  const buyPctOfTotal = profile && totalVol > 0 ? (profile.totalBuyVolume / totalVol) * 100 : null;

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title mono">SESSION VOLUME PROFILE</span>
        {profile && (
          <span className="stats mono">
            POC <b className="poc">{fmt(pocPrice)}</b>
            VAH <b className="va">{fmt(profile.valueAreaHigh)}</b>
            VAL <b className="va">{fmt(profile.valueAreaLow)}</b>
            {profile.developingPoc != null && (
              <>
                Dev POC <b className="dev">{fmt(profile.developingPoc)}</b>
              </>
            )}
            {buyPctOfTotal != null && (
              <>
                <b className="buy">{buyPctOfTotal.toFixed(0)}% buy</b>
                <b className="sell">{(100 - buyPctOfTotal).toFixed(0)}% sell</b>
              </>
            )}
          </span>
        )}
      </div>

      <div className="panel-body">
        {loading && candles.length === 0 && (
          <div className="panel-msg mono">Loading session data…</div>
        )}
        {!loading && error && candles.length === 0 && (
          <div className="panel-msg mono error">{error}</div>
        )}
        <div ref={containerRef} className="chart-container" />
        {vpBars.length > 0 && (
          <div className="vp-overlay">
            {vpBars.map((bar, i) => (
              <div
                key={i}
                className={`vp-bar-track ${bar.isPoc ? "poc" : ""}`}
                style={{ top: bar.top, height: bar.height }}
              >
                <div className="vp-buy" style={{ width: `${bar.buyPct}%` }} />
                <div className="vp-sell" style={{ width: `${bar.sellPct}%` }} />
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-panel);
          border: 1px solid var(--border);
          border-top: 2px solid var(--focus);
          border-radius: 3px;
          overflow: hidden;
        }
        .panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 12px 14px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
          flex-wrap: wrap;
        }
        .panel-title {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-faint);
          letter-spacing: 0.06em;
        }
        .stats {
          display: flex;
          gap: 8px;
          font-size: 10px;
          color: var(--text-faint);
        }
        .stats b {
          color: var(--text);
          font-weight: 600;
          margin-right: 4px;
        }
        .stats b.poc {
          color: var(--accent);
        }
        .stats b.va {
          color: var(--focus);
        }
        .stats b.dev {
          color: var(--violet);
        }
        .stats b.buy {
          color: var(--up);
        }
        .stats b.sell {
          color: var(--down);
        }
        .panel-body {
          position: relative;
          flex: 1;
          min-height: 0;
        }
        .chart-container {
          width: 100%;
          height: 100%;
        }
        .panel-msg {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: var(--text-dim);
          text-align: center;
          padding: 0 20px;
          z-index: 2;
        }
        .panel-msg.error {
          color: var(--down);
        }
        .vp-overlay {
          position: absolute;
          right: 0;
          top: 0;
          width: 26%;
          height: 100%;
          pointer-events: none;
        }
        .vp-bar-track {
          position: absolute;
          right: 0;
          width: 100%;
          display: flex;
          flex-direction: row-reverse;
        }
        .vp-bar-track.poc {
          outline: 1px solid rgba(240, 168, 104, 0.7);
        }
        .vp-buy {
          height: 100%;
          background: rgba(46, 230, 166, 0.55);
        }
        .vp-sell {
          height: 100%;
          background: rgba(255, 77, 77, 0.55);
        }
      `}</style>
    </div>
  );
}
