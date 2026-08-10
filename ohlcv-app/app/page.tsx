"use client";

import { useEffect, useMemo, useState } from "react";
import TickerTape from "@/components/TickerTape";
import SymbolSearchBox from "@/components/SymbolSearchBox";
import DashboardChartPanel from "@/components/DashboardChartPanel";
import NewsPanel from "@/components/NewsPanel";
import NseEventsPanel from "@/components/NseEventsPanel";
import VolumeProfilePanel from "@/components/VolumeProfilePanel";
import MonteCarloPanel from "@/components/MonteCarloPanel";
import GammaExposurePanel from "@/components/GammaExposurePanel";
import CalculatorDrawer from "@/components/CalculatorDrawer";
import { Candle } from "@/lib/yahoo";
import { VolumeProfileResult, calculateVolumeProfile } from "@/lib/volumeProfile";
import { MonteCarloResult, runMonteCarloSimulation } from "@/lib/monteCarlo";
import { DEFAULT_SYMBOL } from "@/lib/ranges";

export default function Dashboard() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);

  // Monte Carlo and Volume Profile on the dashboard are based on daily
  // candles — fetched here independently of the two DashboardChartPanel
  // instances above (which manage their own weekly/daily data internally)
  // since those don't expose their candles back up to the page.
  const [dailyCandles, setDailyCandles] = useState<Candle[]>([]);
  const [monteCarloBars, setMonteCarloBars] = useState(60);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `/api/chart?symbol=${encodeURIComponent(symbol)}&range=30y&interval=1d`
        );
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && !data.error) setDailyCandles(data.candles || []);
      } catch {
        // keep last known candles
      }
    }

    load();
    const poll = setInterval(load, 120000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [symbol]);

  const volumeProfile: VolumeProfileResult | null = useMemo(
    () => (dailyCandles.length > 0 ? calculateVolumeProfile(dailyCandles, 24) : null),
    [dailyCandles]
  );

  const monteCarlo: MonteCarloResult | null = useMemo(
    () =>
      dailyCandles.length > 0
        ? runMonteCarloSimulation(dailyCandles, { barsAhead: monteCarloBars, simulations: 500 })
        : null,
    [dailyCandles, monteCarloBars]
  );

  return (
    <main className="dashboard">
      <div className="tape-wrap">
        <div className="tape-label mono">GLOBAL WATCHLIST</div>
        <TickerTape />
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <SymbolSearchBox symbol={symbol} onSymbolChange={setSymbol} />
        </div>
        <CalculatorDrawer />
      </div>

      <div className="row">
        <div className="slot slot-wide">
          <DashboardChartPanel
            symbol={symbol}
            interval="1wk"
            label="Weekly — S/R & trendlines"
            showEMA={false}
            defaultVisibleBars={150}
          />
        </div>
        <div className="slot slot-wide">
          <DashboardChartPanel
            symbol={symbol}
            interval="1d"
            label="Daily — EWMA 50/200, S/R & trendlines"
            showEMA={true}
            defaultVisibleBars={120}
          />
        </div>
        <div className="slot slot-narrow">
          <NewsPanel title="Fin News India" region="india" />
        </div>
        <div className="slot slot-narrow">
          <NewsPanel title="Fin News Global" region="global" />
        </div>
      </div>

      <div className="row">
        <div className="slot slot-wide">
          <MonteCarloPanel
            result={monteCarlo}
            barsAhead={monteCarloBars}
            onBarsAheadChange={setMonteCarloBars}
          />
        </div>
        <div className="slot slot-wide">
          <VolumeProfilePanel candles={dailyCandles} profile={volumeProfile} />
        </div>
        <div className="slot slot-narrow">
          <GammaExposurePanel symbol={symbol} />
        </div>
        <div className="slot slot-narrow">
          <NseEventsPanel />
        </div>
      </div>

      <style jsx>{`
        .dashboard {
          display: flex;
          flex-direction: column;
          height: 100vh;
          padding: 14px 18px 18px;
          gap: 12px;
          overflow: hidden;
        }
        .tape-wrap {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .tape-label {
          font-size: 10px;
          color: var(--text-faint);
          letter-spacing: 0.1em;
          padding-left: 2px;
        }
        .toolbar {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }
        .search-wrap {
          max-width: 360px;
          flex: 1;
          min-width: 0;
        }
        .row {
          display: grid;
          grid-template-columns: 2fr 2fr 1fr 1fr;
          gap: 12px;
          flex: 1;
          min-height: 0;
        }
        .slot {
          min-height: 0;
        }
        .slot-wide {
          min-height: 280px;
        }
        .slot-narrow {
          min-height: 220px;
        }

        @media (max-width: 1200px) {
          .dashboard {
            height: auto;
            min-height: 100vh;
            overflow: visible;
          }
          .row {
            grid-template-columns: 1fr 1fr;
          }
        }
        @media (max-width: 700px) {
          .row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
