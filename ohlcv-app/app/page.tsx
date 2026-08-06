"use client";

import Link from "next/link";
import { useState } from "react";
import TickerTape from "@/components/TickerTape";
import SymbolSearchBox from "@/components/SymbolSearchBox";
import DashboardChartPanel from "@/components/DashboardChartPanel";
import NewsPanel from "@/components/NewsPanel";
import NseEventsPanel from "@/components/NseEventsPanel";
import PositionSizingCalculator from "@/components/PositionSizingCalculator";
import { DEFAULT_SYMBOL } from "@/lib/ranges";

export default function Dashboard() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);

  return (
    <main className="dashboard">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◈</span>
          <span className="brand-name">Ticker</span>
          <span className="brand-sub">Dashboard</span>
        </div>
        <Link href={`/chart?symbol=${encodeURIComponent(symbol)}`} className="advanced-link">
          Advanced chart →
        </Link>
      </header>

      <TickerTape />

      <div className="grid">
        <section className="charts-column">
          <div className="ticker-search">
            <span className="ticker-search-label">Ticker</span>
            <SymbolSearchBox symbol={symbol} onSymbolChange={setSymbol} />
          </div>

          <div className="chart-slot">
            <DashboardChartPanel
              symbol={symbol}
              interval="1wk"
              label="Weekly — S/R & trendlines"
              showEMA={false}
            />
          </div>
          <div className="chart-slot">
            <DashboardChartPanel
              symbol={symbol}
              interval="1d"
              label="Daily — EMA 50/200, S/R & trendlines"
              showEMA={true}
            />
          </div>
        </section>

        <section className="side-column">
          <div className="side-slot">
            <NewsPanel title="Fin News India" region="india" />
          </div>
          <div className="side-slot">
            <NewsPanel title="Fin News Global" region="global" />
          </div>
          <div className="side-slot">
            <PositionSizingCalculator />
          </div>
          <div className="side-slot">
            <NseEventsPanel />
          </div>
        </section>
      </div>

      <style jsx>{`
        .dashboard {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          padding: 14px 18px 18px;
          gap: 14px;
        }
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
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
        }
        .brand-sub {
          font-size: 11px;
          color: var(--text-faint);
          border-left: 1px solid var(--border);
          padding-left: 8px;
          margin-left: 2px;
        }
        .advanced-link {
          font-size: 12px;
          color: var(--text-dim);
          text-decoration: none;
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 6px 12px;
        }
        .advanced-link:hover {
          color: var(--accent);
          border-color: var(--accent-dim);
        }
        .grid {
          display: grid;
          grid-template-columns: minmax(0, 2.2fr) minmax(280px, 1fr);
          gap: 14px;
          flex: 1;
          min-height: 0;
        }
        .charts-column {
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-height: 0;
        }
        .ticker-search {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ticker-search-label {
          font-size: 12px;
          color: var(--text-faint);
          flex-shrink: 0;
        }
        .chart-slot {
          flex: 1;
          min-height: 320px;
        }
        .side-column {
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr;
          gap: 12px;
          min-height: 0;
        }
        .side-slot {
          min-height: 260px;
        }

        @media (max-width: 1100px) {
          .grid {
            grid-template-columns: 1fr;
          }
          .side-column {
            grid-template-columns: 1fr 1fr;
          }
        }
        @media (max-width: 640px) {
          .side-column {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
