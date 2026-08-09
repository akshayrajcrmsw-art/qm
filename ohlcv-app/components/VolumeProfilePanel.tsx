"use client";

import { VolumeProfileResult } from "@/lib/volumeProfile";

function fmt(n: number | undefined | null, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export default function VolumeProfilePanel({ profile }: { profile: VolumeProfileResult | null }) {
  // Highest price at top, like a real volume profile read top-to-bottom.
  const rows = profile ? [...profile.buckets].reverse() : [];
  const maxVol = profile?.maxVolume || 1;

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title mono">VOLUME PROFILE</span>
      </div>

      <div className="panel-body">
        {!profile || rows.length === 0 ? (
          <div className="panel-msg mono">Not enough data for a volume profile yet.</div>
        ) : (
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
          padding: 12px 14px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .panel-title {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-faint);
          letter-spacing: 0.06em;
        }
        .panel-body {
          flex: 1;
          min-height: 0;
        }
        .panel-msg {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          font-size: 12px;
          color: var(--text-dim);
          text-align: center;
          padding: 0 20px;
        }
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
