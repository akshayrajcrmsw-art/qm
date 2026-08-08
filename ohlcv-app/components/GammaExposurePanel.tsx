"use client";

import { useEffect, useState } from "react";

interface GammaStrike {
  strike: number;
  callGEX: number;
  putGEX: number;
  netGEX: number;
}

interface GammaResponse {
  spotPrice: number;
  expiry: number;
  strikes: GammaStrike[];
  gammaFlipStrike: number | null;
  totalGEX: number;
  error?: string;
}

function fmtGEX(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

export default function GammaExposurePanel({ symbol }: { symbol: string }) {
  const [data, setData] = useState<GammaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/gamma-exposure?symbol=${encodeURIComponent(symbol)}`)
      .then((res) => res.json())
      .then((json: GammaResponse) => {
        if (cancelled) return;
        if (json.error) throw new Error(json.error);
        setData(json);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Failed to load options data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (loading) {
    return <div className="gex-panel mono gex-msg">Loading options chain…</div>;
  }

  if (error || !data) {
    return (
      <div className="gex-panel mono gex-msg gex-error">
        {error || "No data"}
        <style jsx>{`
          .gex-error {
            color: var(--down);
          }
        `}</style>
      </div>
    );
  }

  const maxAbs = Math.max(...data.strikes.map((s) => Math.abs(s.netGEX)), 1);
  const expiryDate = new Date(data.expiry * 1000).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  let spotIndex = 0;
  data.strikes.forEach((s, i) => {
    if (
      Math.abs(s.strike - data.spotPrice) <
      Math.abs(data.strikes[spotIndex].strike - data.spotPrice)
    ) {
      spotIndex = i;
    }
  });

  return (
    <div className="gex-panel">
      <div className="gex-head mono">
        <span>Gamma exposure · exp {expiryDate}</span>
        <span
          className="gex-total"
          style={{ color: data.totalGEX >= 0 ? "var(--up)" : "var(--down)" }}
        >
          Net {fmtGEX(data.totalGEX)}
        </span>
        {data.gammaFlipStrike != null && (
          <span className="gex-flip">Flip ~{data.gammaFlipStrike}</span>
        )}
      </div>

      <div className="gex-chart">
        {data.strikes.map((s, i) => {
          const heightPct = (Math.abs(s.netGEX) / maxAbs) * 100;
          return (
            <div key={s.strike} className="gex-col" title={`${s.strike}: ${fmtGEX(s.netGEX)}`}>
              <div className="gex-bar-wrap">
                <div
                  className={`gex-bar ${s.netGEX >= 0 ? "up" : "down"}`}
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <span className={`gex-strike mono ${i === spotIndex ? "gex-spot" : ""}`}>
                {s.strike}
              </span>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .gex-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          padding: 10px 4px 4px;
        }
        .gex-msg {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          font-size: 12px;
          color: var(--text-dim);
          text-align: center;
          padding: 0 20px;
        }
        .gex-head {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 11px;
          color: var(--text-dim);
          padding: 0 10px 8px;
          flex-wrap: wrap;
        }
        .gex-total {
          font-weight: 600;
        }
        .gex-flip {
          color: var(--accent);
        }
        .gex-chart {
          flex: 1;
          min-height: 0;
          display: flex;
          align-items: flex-end;
          gap: 2px;
          overflow-x: auto;
          padding: 0 8px 4px;
        }
        .gex-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          flex-shrink: 0;
          width: 26px;
          height: 100%;
        }
        .gex-bar-wrap {
          flex: 1;
          display: flex;
          align-items: flex-end;
          width: 100%;
        }
        .gex-bar {
          width: 100%;
          border-radius: 2px 2px 0 0;
          min-height: 2px;
        }
        .gex-bar.up {
          background: rgba(61, 220, 151, 0.65);
        }
        .gex-bar.down {
          background: rgba(255, 92, 92, 0.65);
        }
        .gex-strike {
          font-size: 8.5px;
          color: var(--text-faint);
          margin-top: 4px;
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          white-space: nowrap;
        }
        .gex-strike.gex-spot {
          color: var(--accent);
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
