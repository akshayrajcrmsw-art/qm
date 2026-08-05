"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  UTCTimestamp,
  IPriceLine,
} from "lightweight-charts";
import { Candle } from "@/lib/yahoo";
import { SRLevel } from "@/lib/supportResistance";

interface ChartProps {
  candles: Candle[];
  levels: SRLevel[];
  currency: string;
  liveTick?: Candle | null;
  onCrosshair?: (candle: Candle | null) => void;
}

function toChartData(candles: Candle[]): CandlestickData[] {
  return candles.map((c) => ({
    time: c.time as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
}

export default function Chart({ candles, levels, currency, liveTick, onCrosshair }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  // create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#7c879b",
        fontFamily: "var(--font-mono), monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#151a23" },
        horzLines: { color: "#151a23" },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: "#4b5568", labelBackgroundColor: "#212836" },
        horzLine: { color: "#4b5568", labelBackgroundColor: "#212836" },
      },
      rightPriceScale: {
        borderColor: "#212836",
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor: "#212836",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      autoSize: true,
    });

    const series = chart.addCandlestickSeries({
      upColor: "#3ddc97",
      downColor: "#ff5c5c",
      borderUpColor: "#3ddc97",
      borderDownColor: "#ff5c5c",
      wickUpColor: "#3ddc97",
      wickDownColor: "#ff5c5c",
    });

    chart.subscribeCrosshairMove((param) => {
      if (!onCrosshair) return;
      if (!param.time || !param.seriesData.size) {
        onCrosshair(null);
        return;
      }
      const d = param.seriesData.get(series) as CandlestickData | undefined;
      if (!d) {
        onCrosshair(null);
        return;
      }
      onCrosshair({
        time: d.time as number,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: 0,
      });
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // update data
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;
    seriesRef.current.setData(toChartData(candles));
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // update S/R price lines
  useEffect(() => {
    if (!seriesRef.current) return;

    for (const line of priceLinesRef.current) {
      seriesRef.current.removePriceLine(line);
    }
    priceLinesRef.current = [];

    for (const level of levels) {
      const line = seriesRef.current.createPriceLine({
        price: level.price,
        color: level.type === "resistance" ? "#ff5c5c" : "#3ddc97",
        lineWidth: 1,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: `${level.type === "resistance" ? "R" : "S"} ${level.strength}x`,
      });
      priceLinesRef.current.push(line);
    }
  }, [levels]);

  // live-update: merge the latest 1m tick into the chart without a full reload.
  // lightweight-charts' series.update() replaces the bar if the time matches
  // the last bar, or appends a new one if the time is newer.
  const lastLiveTimeRef = useRef<number | null>(null);
  useEffect(() => {
    if (!seriesRef.current || !liveTick || candles.length === 0) return;
    const lastKnown = candles[candles.length - 1];

    // Only push the live tick forward in time relative to what's already
    // rendered, so switching timeframes doesn't get stomped by a stray tick.
    if (liveTick.time < lastKnown.time) return;
    if (lastLiveTimeRef.current === liveTick.time && liveTick.time !== lastKnown.time) {
      // avoid redundant updates for an unchanged tick
    }
    lastLiveTimeRef.current = liveTick.time;

    seriesRef.current.update({
      time: liveTick.time as UTCTimestamp,
      open: liveTick.time === lastKnown.time ? lastKnown.open : liveTick.open,
      high: Math.max(liveTick.high, liveTick.time === lastKnown.time ? lastKnown.high : liveTick.high),
      low: Math.min(liveTick.low, liveTick.time === lastKnown.time ? lastKnown.low : liveTick.low),
      close: liveTick.close,
    });
  }, [liveTick, candles]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
