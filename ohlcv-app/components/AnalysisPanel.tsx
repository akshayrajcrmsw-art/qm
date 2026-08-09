"use client";

import { useState } from "react";
import { VolumeProfileResult } from "@/lib/volumeProfile";
import { MonteCarloResult } from "@/lib/monteCarlo";
import GammaExposurePanel from "@/components/GammaExposurePanel";

type Tab = "volume" | "montecarlo" | "gamma";

function fmt(n: number | undefined | null, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function VolumeProfileTab({ profile }: { profile: VolumeProfileResult | null }) {
  if (!profile || profile.buckets.length === 0) {
    return <div className="tab-msg mono">Not enough data for a volume profile yet.</div>;
  }

  // Highest price at top, like a real volume profile read top-to-bottom.
  const rows = [...profile.buckets].reverse();
  const maxVol = profile.maxVolume || 1;

  return (
    <div className="vp-rows">
      {rows.map((b, i) => {
        const origIndex = profile.buckets.length - 1 - i;
        const isPoc = origIndex === profile.pocIndex;
        const widthPct = (b.volume / maxVol) * 100;
        return (
          <div key={i} className={`vp-row ${isPoc ? "poc" : ""}`}>
            <span className="vp-price mono">{fmt((b.priceLow + b.priceHigh) / 2)}</span>
            <div className="vp-track">
              <div className="vp-fill" style={{ width: `${widthPct}%` }} />
            </div>
          </div>
        );
      })}
      <style jsx>{`
        .vp-rows {
          display: flex;
          flex-direction: column;
          gap: 1px;
          height: 100%;
          padding: 8px 14px;
          overflow-y: auto;
        }
        .vp-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
          min-height: 0;
        }
        .vp-price {
          width: 66px;
          flex-shrink: 0;
          font-size: 10.5px;
          color: var(--text-faint);
          text-align: right;
        }
        .vp-row.poc .vp-price {
          color: var(--accent);
          font-weight: 700;
        }
        .vp-track {
          flex: 1;
          height: 70%;
          background: var(--bg-panel-raised);
          border-radius: 2px;
          overflow: hidden;
        }
        .vp-fill {
          height: 100%;
          background: rgba(91, 141, 239, 0.55);
          border-radius: 2px;
        }
        .vp-row.poc .vp-fill {
          background: rgba(240, 168, 104, 0.75);
        }
      `}</style>
    </div>
  );
}

function MonteCarloTab({
  result,
  barsAhead,
  onBarsAheadChange,
}: {
  result: MonteCarloResult | null;
  barsAhead: number;
  onBarsAheadChange: (n: number) => void;
}) {
  const width = 640;
  const height = 220;
  const padding = 36;

  const content = (() => {
    if (!result) return null;

    const allValues = [...result.p5.map((p) => p.value), ...result.p95.map((p) => p.value)];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min || 1;
    const n = result.median.length;

    const xAt = (i: number) => padding + (i / (n - 1)) * (width - padding * 2);
    const yAt = (v: number) => height - padding + ((v - min) / range) * -(height - padding * 2);

    const pathFor = (pts: { value: number }[]) =>
      pts.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(" ");

    const bandPoints =
      result.p95.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(" ") +
      " " +
      [...result.p5]
        .reverse()
        .map((p, i) => `${xAt(n - 1 - i).toFixed(1)},${yAt(p.value).toFixed(1)}`)
        .join(" ");

    return { min, max, xAt, yAt, pathFor, bandPoints };
  })();

  return (
    <div className="mc-tab">
      <div className="mc-controls">
        {[30, 60, 90, 180].map((b) => (
          <button
            key={b}
            className={`mc-bar-opt ${barsAhead === b ? "active" : ""}`}
            onClick={() => onBarsAheadChange(b)}
          >
            {b}
          </button>
        ))}
        <span className="mc-controls-label mono">bars ahead</span>
        {result && (
          <span className="mc-stats mono">
            {result.simulations} sims · per-bar volatility{" "}
            {(result.stdDevLogReturn * 100).toFixed(2)}% · median target{" "}
            {fmt(result.median[result.median.length - 1]?.value)}
          </span>
        )}
      </div>

      <div className="mc-chart-wrap">
        {!result && <div className="tab-msg mono">Needs at least 30 candles of history to run.</div>}
        {result && content && (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="mc-svg"
            preserveAspectRatio="xMidYMid meet"
          >
            <polygon points={content.bandPoints} fill="rgba(167, 139, 250, 0.12)" />
            <polyline
              points={content.pathFor(result.p75)}
              fill="none"
              stroke="rgba(167,139,250,0.5)"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
            <polyline
              points={content.pathFor(result.p25)}
              fill="none"
              stroke="rgba(167,139,250,0.5)"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
            <polyline
              points={content.pathFor(result.median)}
              fill="none"
              stroke="#a78bfa"
              strokeWidth="2"
            />
            <text x={padding} y={14} fill="#7c879b" fontSize="10">
              {fmt(content.max)}
            </text>
            <text x={padding} y={height - 6} fill="#7c879b" fontSize="10">
              {fmt(content.min)}
            </text>
          </svg>
        )}
      </div>

      <style jsx>{`
        .mc-tab {
          display: flex;
          flex-direction: column;
          height: 100%;
          padding: 8px 14px;
        }
        .mc-controls {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
          padding-bottom: 8px;
        }
        .mc-bar-opt {
          background: var(--bg-panel-raised);
          border: 1px solid var(--border);
          color: var(--text-dim);
          font-size: 11px;
          font-family: var(--font-mono), monospace;
          border-radius: 6px;
          padding: 4px 8px;
        }
        .mc-bar-opt.active {
          color: #a78bfa;
          border-color: #a78bfa;
        }
        .mc-controls-label {
          font-size: 10.5px;
          color: var(--text-faint);
          margin-right: 10px;
        }
        .mc-stats {
          font-size: 11px;
          color: var(--text-faint);
        }
        .mc-chart-wrap {
          flex: 1;
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .mc-svg {
          width: 100%;
          height: 100%;
        }
      `}</style>
    </div>
  );
}

interface AnalysisPanelProps {
  symbol: string;
  volumeProfile: VolumeProfileResult | null;
  monteCarlo: MonteCarloResult | null;
  monteCarloBars: number;
  onMonteCarloBarsChange: (n: number) => void;
}

export default function AnalysisPanel({
  symbol,
  volumeProfile,
  monteCarlo,
  monteCarloBars,
  onMonteCarloBarsChange,
}: AnalysisPanelProps) {
  const [tab, setTab] = useState<Tab>("volume");

  return (
    <div className="analysis-panel">
      <div className="tabs">
        <button
          className={`tab-btn mono ${tab === "volume" ? "active" : ""}`}
          onClick={() => setTab("volume")}
        >
          Volume Profile
        </button>
        <button
          className={`tab-btn mono ${tab === "montecarlo" ? "active" : ""}`}
          onClick={() => setTab("montecarlo")}
        >
          Monte Carlo
        </button>
        <button
          className={`tab-btn mono ${tab === "gamma" ? "active" : ""}`}
          onClick={() => setTab("gamma")}
        >
          Gamma Exposure
        </button>
      </div>

      <div className="tab-body">
        {tab === "volume" && <VolumeProfileTab profile={volumeProfile} />}
        {tab === "montecarlo" && (
          <MonteCarloTab
            result={monteCarlo}
            barsAhead={monteCarloBars}
            onBarsAheadChange={onMonteCarloBarsChange}
          />
        )}
        {tab === "gamma" && <GammaExposurePanel symbol={symbol} />}
      </div>

      <style jsx>{`
        .analysis-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          overflow: hidden;
        }
        .tabs {
          display: flex;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .tab-btn {
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--text-dim);
          font-size: 11.5px;
          padding: 10px 16px;
        }
        .tab-btn:hover {
          color: var(--text);
        }
        .tab-btn.active {
          color: var(--accent);
          border-bottom-color: var(--accent);
        }
        .tab-body {
          flex: 1;
          min-height: 0;
        }
        .tab-msg {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          font-size: 12px;
          color: var(--text-dim);
          text-align: center;
          padding: 0 20px;
        }
      `}</style>
    </div>
  );
}
