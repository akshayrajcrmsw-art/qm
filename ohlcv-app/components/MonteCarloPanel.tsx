"use client";

import { MonteCarloResult } from "@/lib/monteCarlo";

function fmt(n: number | undefined | null, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

interface MonteCarloPanelProps {
  result: MonteCarloResult | null;
  barsAhead: number;
  onBarsAheadChange: (n: number) => void;
}

export default function MonteCarloPanel({
  result,
  barsAhead,
  onBarsAheadChange,
}: MonteCarloPanelProps) {
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

    // Four evenly-spaced gridlines between min and max, so the chart reads
    // as an actual price scale rather than just two numbers at the corners.
    const gridLines = [0, 1, 2, 3, 4].map((i) => {
      const v = min + (range * i) / 4;
      return { value: v, y: yAt(v) };
    });

    // Bars-ahead ticks along the bottom — start, a couple of midpoints, end.
    const xTicks = [0, Math.round((n - 1) / 2), n - 1].map((i) => ({
      bar: i,
      x: xAt(i),
    }));

    return { min, max, pathFor, bandPoints, xAt, yAt, gridLines, xTicks };
  })();

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title mono">MONTE CARLO</span>
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
        </div>
      </div>

      <div className="panel-body">
        {result && (
          <div className="mc-stats mono">
            {result.simulations} sims · vol {(result.stdDevLogReturn * 100).toFixed(2)}%/bar ·
            median target {fmt(result.median[result.median.length - 1]?.value)}
          </div>
        )}

        <div className="mc-chart-wrap">
          {!result && (
            <div className="panel-msg mono">Needs at least 30 candles of history to run.</div>
          )}
          {result && content && (
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="mc-svg"
              preserveAspectRatio="xMidYMid meet"
            >
              {content.gridLines.map((g, i) => (
                <g key={i}>
                  <line
                    x1={padding}
                    x2={width - 8}
                    y1={g.y}
                    y2={g.y}
                    stroke="#1d2430"
                    strokeWidth="1"
                  />
                  <text x={4} y={g.y + 3} fill="#7c879b" fontSize="9">
                    {fmt(g.value)}
                  </text>
                </g>
              ))}

              {/* Starting price reference — everything fans out from here */}
              <line
                x1={padding}
                x2={width - 8}
                y1={content.yAt(result.startPrice)}
                y2={content.yAt(result.startPrice)}
                stroke="#48505f"
                strokeWidth="1"
                strokeDasharray="2 2"
              />

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

              {content.xTicks.map((t, i) => (
                <text
                  key={i}
                  x={t.x}
                  y={height - padding + 16}
                  fill="#48505f"
                  fontSize="9"
                  textAnchor={i === 0 ? "start" : i === content.xTicks.length - 1 ? "end" : "middle"}
                >
                  {t.bar === 0 ? "now" : `+${t.bar}`}
                </text>
              ))}
            </svg>
          )}
        </div>
      </div>

      <style jsx>{`
        .panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-panel);
          border: 1px solid var(--border);
          border-top: 2px solid var(--violet);
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
        .mc-controls {
          display: flex;
          gap: 4px;
        }
        .mc-bar-opt {
          background: var(--bg-panel-raised);
          border: 1px solid var(--border);
          color: var(--text-dim);
          font-size: 10.5px;
          font-family: var(--font-mono), monospace;
          border-radius: 2px;
          padding: 3px 7px;
        }
        .mc-bar-opt.active {
          color: #a78bfa;
          border-color: #a78bfa;
        }
        .panel-body {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          padding: 8px 14px;
        }
        .mc-stats {
          font-size: 10.5px;
          color: var(--text-faint);
          padding-bottom: 6px;
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
      `}</style>
    </div>
  );
}
