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
import { VolumeProfileResult } from "@/lib/volumeProfile";

function fmt(n: number | undefined | null, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

interface VolumeProfilePanelProps {
  candles: Candle[];
  profile: VolumeProfileResult | null;
}

export default function VolumeProfilePanel({ candles, profile }: VolumeProfilePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [vpBars, setVpBars] = useState<
    { top: number; height: number; widthPct: number; isPoc: boolean }[]
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
      timeScale: { borderColor: "#1d2430", timeVisible: false, secondsVisible: false },
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
    // Zoom to the most recent ~120 bars so it's readable rather than a smudge.
    const visibleBars = 120;
    if (candles.length > visibleBars) {
      chartRef.current
        ?.timeScale()
        .setVisibleLogicalRange({ from: candles.length - visibleBars, to: candles.length - 1 + 2 });
    } else {
      chartRef.current?.timeScale().fitContent();
    }
  }, [candles]);

  // POC / VAH / VAL / developing-POC price lines.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    // lightweight-charts doesn't expose a "clear all price lines" call, so
    // we track and remove the ones we've added ourselves.
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
          color: "#7c879b",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "VAH",
        })
      );
      lines.push(
        series.createPriceLine({
          price: profile.valueAreaLow,
          color: "#7c879b",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "VAL",
        })
      );
      if (profile.developingPoc != null) {
        lines.push(
          series.createPriceLine({
            price: profile.developingPoc,
            color: "#5b8def",
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
  // so they line up with the candles regardless of zoom/pan.
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
          return {
            top: Math.min(yHigh, yLow),
            height: Math.max(1, Math.abs(yLow - yHigh) - 1),
            widthPct: (b.volume / maxVol) * 100,
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

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title mono">VOLUME PROFILE</span>
        {profile && (
          <span className="stats mono">
            POC <b className="poc">{fmt(pocPrice)}</b>
            VAH <b>{fmt(profile.valueAreaHigh)}</b>
            VAL <b>{fmt(profile.valueAreaLow)}</b>
            {profile.developingPoc != null && (
              <>
                Dev POC <b className="dev">{fmt(profile.developingPoc)}</b>
              </>
            )}
          </span>
        )}
      </div>

      <div className="panel-body">
        {(!candles || candles.length === 0) && (
          <div className="panel-msg mono">Not enough data for a volume profile yet.</div>
        )}
        <div ref={containerRef} className="chart-container" />
        {vpBars.length > 0 && (
          <div className="vp-overlay">
            {vpBars.map((bar, i) => (
              <div
                key={i}
                className={`vp-bar ${bar.isPoc ? "poc" : ""}`}
                style={{ top: bar.top, height: bar.height, width: `${bar.widthPct}%` }}
              />
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
        .stats b.dev {
          color: var(--focus);
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
        .vp-overlay {
          position: absolute;
          right: 0;
          top: 0;
          width: 26%;
          height: 100%;
          pointer-events: none;
        }
        .vp-bar {
          position: absolute;
          right: 0;
          background: rgba(91, 141, 239, 0.32);
        }
        .vp-bar.poc {
          background: rgba(240, 168, 104, 0.55);
        }
      `}</style>
    </div>
  );
}
