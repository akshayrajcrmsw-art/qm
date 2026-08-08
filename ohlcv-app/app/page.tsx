"use client";

import { useState } from "react";
import TickerTape from "@/components/TickerTape";
import SymbolSearchBox from "@/components/SymbolSearchBox";
import DashboardChartPanel from "@/components/DashboardChartPanel";
import NewsPanel from "@/components/NewsPanel";
import NseEventsPanel from "@/components/NseEventsPanel";
import CalculatorDrawer from "@/components/CalculatorDrawer";
import { DEFAULT_SYMBOL } from "@/lib/ranges";

export default function Dashboard() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);

  return (
    <main className="dashboard">
      <div className="tape-wrap">
        <TickerTape />
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <SymbolSearchBox symbol={symbol} onSymbolChange={setSymbol} />
        </div>
        <CalculatorDrawer />
      </div>

      <div className="grid">
        <section className="charts-row">
          <div className="chart-slot">
            <DashboardChartPanel
              symbol={symbol}
              interval="1wk"
              label="Weekly — S/R & trendlines"
              showEMA={false}
              defaultVisibleBars={260}
            />
          </div>
          <div className="chart-slot">
            <DashboardChartPanel
              symbol={symbol}
              interval="1d"
              label="Daily — EWMA 50/200, S/R & trendlines"
              showEMA={true}
              defaultVisibleBars={180}
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
          <div className="side-slot side-slot-wide">
            <NseEventsPanel />
          </div>
        </section>
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
        .grid {
          display: grid;
          grid-template-columns: minmax(0, 2.2fr) minmax(280px, 1fr);
          gap: 14px;
          flex: 1;
          min-height: 0;
        }
        .charts-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          min-height: 0;
        }
        .chart-slot {
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
        .side-slot-wide {
          grid-column: 1 / -1;
        }

        @media (max-width: 1100px) {
          .dashboard {
            height: auto;
            min-height: 100vh;
            overflow: visible;
          }
          .grid {
            grid-template-columns: 1fr;
          }
          .charts-row {
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
