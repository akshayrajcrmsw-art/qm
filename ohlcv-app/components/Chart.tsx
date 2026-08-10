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
import { SRLevel, TrendLine } from "@/lib/supportResistance";
import { IndicatorPoint, StdDevBands } from "@/lib/indicators";

interface ChartProps {
  candles: Candle[];
  levels: SRLevel[];
  trendlines: TrendLine[];
  ewma50: IndicatorPoint[];
  ewma200: IndicatorPoint[];
  currency: string;
  livePrice?: number | null;
  stdDevBands?: StdDevBands | null;
  /**
   * If set, the chart initially zooms to just the most recent N bars instead
   * of fitting all loaded history into view. Full history is still loaded
   * (so long-window EWMAs/trendlines are computed correctly) and still
   * reachable by scrolling/zooming out — this only controls the starting
   * viewport. Without it, the chart fits all loaded candles (the old
   * behavior), which is fine for weekly bars but turns years of daily bars
   * into an unreadable smudge.
   */
  defaultVisibleBars?: number;
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

export default function Chart({
  candles,
  levels,
  trendlines,
  ewma50,
  ewma200,
  currency,
  livePrice,
  stdDevBands,
  defaultVisibleBars,
  onCrosshair,
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const trendSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const ewma50SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ewma200SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stdDevSeriesRef = useRef<ISeriesApi<"Line">[]>([]);

  // Tracked in refs (not just closed-over props) so the ResizeObserver
  // fallback below — set up once at mount — always reads current values
  // instead of whatever was current the first time it was created.
  const latestCandlesRef = useRef<Candle[]>([]);
  const defaultVisibleBarsRef = useRef<number | undefined>(defaultVisibleBars);
  const viewAppliedRef = useRef(false);
  const cleanupRafRef = useRef<number | null>(null);

  useEffect(() => {
    defaultVisibleBarsRef.current = defaultVisibleBars;
  }, [defaultVisibleBars]);

  function applyDefaultView() {
    if (!chartRef.current) return;
    const candlesForView = latestCandlesRef.current;
    if (candlesForView.length === 0) return;

    const bars = defaultVisibleBarsRef.current;
    if (bars && candlesForView.length > bars) {
      const from = candlesForView.length - bars;
      const to = candlesForView.length - 1 + 3; // a little right-side breathing room
      chartRef.current.timeScale().setVisibleLogicalRange({ from, to });
    } else {
      chartRef.current.timeScale().fitContent();
    }
  }

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
      upColor: "#2ee6a6",
      downColor: "#ff4d4d",
      borderUpColor: "#2ee6a6",
      borderDownColor: "#ff4d4d",
      wickUpColor: "#2ee6a6",
      wickDownColor: "#ff4d4d",
    });

    const ewma50Series = chart.addLineSeries({
      color: "#f0a868",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "EWMA 50",
    });
    const ewma200Series = chart.addLineSeries({
      color: "#5b8def",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "EWMA 200",
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
    ewma50SeriesRef.current = ewma50Series;
    ewma200SeriesRef.current = ewma200Series;

    // Fallback for the case where the container is still zero-sized (or
    // mid-layout) when data first loads — common inside nested CSS Grid
    // dashboards, where a chart's final pixel size can settle a frame or
    // two after mount. Calling fitContent()/setVisibleLogicalRange() before
    // that happens can silently apply against the wrong size. Once the
    // container actually has real dimensions and we haven't applied a view
    // for the current data yet, apply it then.
    const ro = new ResizeObserver(() => {
      if (viewAppliedRef.current) return;
      if (!containerRef.current) return;
      if (containerRef.current.clientWidth === 0 || containerRef.current.clientHeight === 0) return;
      applyDefaultView();
      viewAppliedRef.current = true;
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      ewma50SeriesRef.current = null;
      ewma200SeriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // update data
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;
    seriesRef.current.setData(toChartData(candles));
    latestCandlesRef.current = candles;
    viewAppliedRef.current = false;

    // Primary path: defer past the current layout pass. A single rAF is
    // usually enough, but a second one is cheap insurance against the chart
    // library's own internal resize handling still being mid-flight.
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        applyDefaultView();
        viewAppliedRef.current = true;
      });
      cleanupRafRef.current = raf2;
    });
    cleanupRafRef.current = raf1;

    return () => {
      cancelAnimationFrame(raf1);
      if (cleanupRafRef.current) cancelAnimationFrame(cleanupRafRef.current);
    };
  }, [candles, defaultVisibleBars]);

  // EWMA 50 / 200 overlays
  useEffect(() => {
    if (!ewma50SeriesRef.current) return;
    ewma50SeriesRef.current.setData(
      ewma50.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
    );
  }, [ewma50]);

  useEffect(() => {
    if (!ewma200SeriesRef.current) return;
    ewma200SeriesRef.current.setData(
      ewma200.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
    );
  }, [ewma200]);

  // Standard Deviation bands: basis (dotted center), upper/lower (dashed)
  useEffect(() => {
    if (!chartRef.current) return;

    for (const s of stdDevSeriesRef.current) {
      chartRef.current.removeSeries(s);
    }
    stdDevSeriesRef.current = [];

    if (!stdDevBands || stdDevBands.basis.length === 0) return;

    const toPoints = (pts: IndicatorPoint[]) =>
      pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));

    const basisSeries = chartRef.current.addLineSeries({
      color: "rgba(124, 135, 155, 0.7)",
      lineWidth: 1,
      lineStyle: 1, // dotted
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    basisSeries.setData(toPoints(stdDevBands.basis));
    stdDevSeriesRef.current.push(basisSeries);

    const upperSeries = chartRef.current.addLineSeries({
      color: "rgba(124, 135, 155, 0.45)",
      lineWidth: 1,
      lineStyle: 2, // dashed
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
      title: "StdDev",
    });
    upperSeries.setData(toPoints(stdDevBands.upper));
    stdDevSeriesRef.current.push(upperSeries);

    const lowerSeries = chartRef.current.addLineSeries({
      color: "rgba(124, 135, 155, 0.45)",
      lineWidth: 1,
      lineStyle: 2, // dashed
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    lowerSeries.setData(toPoints(stdDevBands.lower));
    stdDevSeriesRef.current.push(lowerSeries);
  }, [stdDevBands]);

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
        color: level.type === "resistance" ? "#ff4d4d" : "#2ee6a6",
        lineWidth: 1,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: `${level.type === "resistance" ? "R" : "S"} ${level.strength}x`,
      });
      priceLinesRef.current.push(line);
    }
  }, [levels]);

  // trendlines: two segments per line — solid between the actual anchor
  // points it was fit to, dashed for the forward projection to "now".
  useEffect(() => {
    if (!chartRef.current) return;

    for (const s of trendSeriesRef.current) {
      chartRef.current.removeSeries(s);
    }
    trendSeriesRef.current = [];

    for (const line of trendlines) {
      const color = line.type === "resistance" ? "#ff4d4d" : "#2ee6a6";

      const solid = chartRef.current.addLineSeries({
        color,
        lineWidth: 2,
        lineStyle: 0,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      solid.setData([
        { time: line.start.time as UTCTimestamp, value: line.start.price },
        { time: line.end.time as UTCTimestamp, value: line.end.price },
      ]);
      trendSeriesRef.current.push(solid);

      if (line.projectedEnd.time > line.end.time) {
        const dashed = chartRef.current.addLineSeries({
          color,
          lineWidth: 1,
          lineStyle: 2, // dashed
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        dashed.setData([
          { time: line.end.time as UTCTimestamp, value: line.end.price },
          { time: line.projectedEnd.time as UTCTimestamp, value: line.projectedEnd.price },
        ]);
        trendSeriesRef.current.push(dashed);
      }
    }
  }, [trendlines]);

  // Live update: grow the currently-forming candle with the latest traded
  // price, always keeping the last bar's own timestamp. This works no matter
  // what candle size is selected — 1m, 1h, 1D, etc — because it never invents
  // a new timestamp; it only extends open/high/low/close of the bar that's
  // already on the chart.
  useEffect(() => {
    if (!seriesRef.current || livePrice == null || candles.length === 0) return;
    const lastKnown = candles[candles.length - 1];

    seriesRef.current.update({
      time: lastKnown.time as UTCTimestamp,
      open: lastKnown.open,
      high: Math.max(lastKnown.high, livePrice),
      low: Math.min(lastKnown.low, livePrice),
      close: livePrice,
    });
  }, [livePrice, candles]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
