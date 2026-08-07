"use client";

import { useMemo, useState } from "react";

type InputMode = "price" | "percent";
type Direction = "long" | "short";

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function rrRating(rr: number): { label: string; color: string } {
  if (rr >= 2) return { label: "GOOD", color: "var(--up)" };
  if (rr >= 1) return { label: "FAIR", color: "var(--accent)" };
  return { label: "POOR", color: "var(--down)" };
}

export default function PositionSizingCalculator() {
  const [accountSize, setAccountSize] = useState("100000");
  const [riskPct, setRiskPct] = useState("2");
  const [entry, setEntry] = useState("500");
  const [leverage, setLeverage] = useState("5");

  const [mode, setMode] = useState<InputMode>("price");
  const [direction, setDirection] = useState<Direction>("long"); // only used in percent mode

  // Price mode
  const [stopLossPrice, setStopLossPrice] = useState("490");
  const [targetPrice, setTargetPrice] = useState("520");

  // Percent mode (always entered as positive distances from entry)
  const [stopLossPct, setStopLossPct] = useState("2");
  const [targetPct, setTargetPct] = useState("4");

  const result = useMemo(() => {
    const acc = parseFloat(accountSize);
    const e = parseFloat(entry);
    const lev = Math.max(parseFloat(leverage) || 1, 1);
    if (!Number.isFinite(e) || e <= 0) return null;

    let stop: number;
    let target: number;
    let dir: Direction;

    if (mode === "price") {
      stop = parseFloat(stopLossPrice);
      target = parseFloat(targetPrice);
      if (!Number.isFinite(stop) || stop === e) return null;
      dir = stop < e ? "long" : "short";
    } else {
      const slPct = Math.abs(parseFloat(stopLossPct) || 0);
      const tgtPct = Math.abs(parseFloat(targetPct) || 0);
      if (slPct <= 0) return null;
      dir = direction;
      stop = dir === "long" ? e * (1 - slPct / 100) : e * (1 + slPct / 100);
      target = dir === "long" ? e * (1 + tgtPct / 100) : e * (1 - tgtPct / 100);
    }

    const riskPerUnit = Math.abs(e - stop);
    if (riskPerUnit <= 0) return null;

    const riskAmount = (Number.isFinite(acc) ? acc : 0) * (parseFloat(riskPct) || 0) / 100;
    if (riskAmount <= 0) return null;

    const quantity = Math.floor(riskAmount / riskPerUnit);
    const capital = quantity * e; // full notional position value
    const margin = capital / lev; // capital actually required to hold it, given leverage

    const hasTarget = Number.isFinite(target);
    const rewardPerUnit = hasTarget ? Math.abs(target - e) : null;
    const rr = rewardPerUnit != null ? rewardPerUnit / riskPerUnit : null;
    const maxProfit = rewardPerUnit != null ? quantity * rewardPerUnit : null;

    return {
      direction: dir,
      stop,
      target: hasTarget ? target : null,
      quantity,
      capital,
      margin,
      maxLoss: riskAmount,
      maxProfit,
      rr,
    };
  }, [accountSize, riskPct, entry, leverage, mode, direction, stopLossPrice, targetPrice, stopLossPct, targetPct]);

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title mono">QUICK POSITION SIZING</span>
      </div>

      <div className="panel-body">
        <div className="mode-toggle">
          <button className={mode === "price" ? "active" : ""} onClick={() => setMode("price")}>
            ₹ Price
          </button>
          <button className={mode === "percent" ? "active" : ""} onClick={() => setMode("percent")}>
            % Percent
          </button>
        </div>

        {mode === "percent" && (
          <div className="dir-toggle">
            <button
              className={direction === "long" ? "active long" : ""}
              onClick={() => setDirection("long")}
            >
              Long
            </button>
            <button
              className={direction === "short" ? "active short" : ""}
              onClick={() => setDirection("short")}
            >
              Short
            </button>
          </div>
        )}

        <div className="field-row two-up">
          <div>
            <label>Account Size</label>
            <input
              className="mono"
              value={accountSize}
              onChange={(e) => setAccountSize(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div>
            <label>Risk %</label>
            <input
              className="mono"
              value={riskPct}
              onChange={(e) => setRiskPct(e.target.value)}
              inputMode="decimal"
            />
          </div>
        </div>

        <div className="field-row two-up">
          <div>
            <label>Entry</label>
            <input
              className="mono"
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div>
            <label>Leverage</label>
            <input
              className="mono"
              value={leverage}
              onChange={(e) => setLeverage(e.target.value)}
              inputMode="decimal"
            />
          </div>
        </div>

        <div className="field-row two-up">
          <div>
            <label>Stop Loss {mode === "price" ? "(₹)" : "(%)"}</label>
            <input
              className="mono"
              value={mode === "price" ? stopLossPrice : stopLossPct}
              onChange={(e) =>
                mode === "price" ? setStopLossPrice(e.target.value) : setStopLossPct(e.target.value)
              }
              inputMode="decimal"
            />
          </div>
          <div>
            <label>Target {mode === "price" ? "(₹)" : "(%)"}</label>
            <input
              className="mono"
              value={mode === "price" ? targetPrice : targetPct}
              onChange={(e) =>
                mode === "price" ? setTargetPrice(e.target.value) : setTargetPct(e.target.value)
              }
              inputMode="decimal"
            />
          </div>
        </div>

        {!result && (
          <div className="hint mono">
            Enter entry, {mode === "price" ? "a stop loss different from entry" : "a stop loss %"}, and risk %.
          </div>
        )}

        {result && (
          <>
            <div className="direction-badge mono" data-dir={result.direction}>
              {result.direction === "long" ? "LONG" : "SHORT"}
            </div>

            <div className="result-grid">
              <div className="result-item">
                <span className="result-label">Quantity</span>
                <span className="mono result-value">{fmt(result.quantity, 0)}</span>
              </div>
              <div className="result-item">
                <span className="result-label">Capital</span>
                <span className="mono result-value">₹{fmt(result.capital)}</span>
              </div>
              <div className="result-item">
                <span className="result-label">Margin (lev.)</span>
                <span className="mono result-value">₹{fmt(result.margin)}</span>
              </div>
              <div className="result-item">
                <span className="result-label">Stop Price</span>
                <span className="mono result-value">₹{fmt(result.stop)}</span>
              </div>
              <div className="result-item loss">
                <span className="result-label">Max Loss</span>
                <span className="mono result-value down">₹{fmt(result.maxLoss)}</span>
              </div>
              <div className="result-item profit">
                <span className="result-label">Max Profit</span>
                <span className="mono result-value up">
                  {result.maxProfit != null ? `₹${fmt(result.maxProfit)}` : "—"}
                </span>
              </div>
            </div>

            {result.rr != null && (
              <div className="rr-card">
                <span className="rr-label mono">RISK REWARD</span>
                <span className="rr-value mono">1 : {fmt(result.rr)}</span>
                <span
                  className="rr-badge mono"
                  style={{ color: rrRating(result.rr).color, borderColor: rrRating(result.rr).color }}
                >
                  {rrRating(result.rr).label}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        .panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-panel);
          border: 1px solid var(--border);
          border-radius: 10px;
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
          overflow-y: auto;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .mode-toggle,
        .dir-toggle {
          display: flex;
          background: var(--bg-panel-raised);
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: 3px;
        }
        .mode-toggle button,
        .dir-toggle button {
          flex: 1;
          background: transparent;
          border: none;
          border-radius: 999px;
          color: var(--text-dim);
          font-size: 11.5px;
          padding: 6px 10px;
        }
        .mode-toggle button.active {
          background: var(--text);
          color: var(--bg);
          font-weight: 600;
        }
        .dir-toggle button.active.long {
          background: var(--up);
          color: var(--bg);
          font-weight: 600;
        }
        .dir-toggle button.active.short {
          background: var(--down);
          color: var(--bg);
          font-weight: 600;
        }
        .field-row.two-up {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        label {
          display: block;
          font-size: 10px;
          color: var(--text-faint);
          text-transform: uppercase;
          letter-spacing: 0.03em;
          margin-bottom: 5px;
        }
        input {
          width: 100%;
          background: var(--bg-panel-raised);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 8px 10px;
          color: var(--text);
          font-size: 13px;
          outline: none;
        }
        input:focus {
          border-color: var(--focus);
        }
        .hint {
          font-size: 11px;
          color: var(--text-faint);
        }
        .direction-badge {
          display: inline-block;
          width: fit-content;
          font-size: 10.5px;
          letter-spacing: 0.06em;
          border-radius: 999px;
          padding: 3px 10px;
          margin-top: 2px;
        }
        .direction-badge[data-dir="long"] {
          color: var(--up);
          border: 1px solid var(--up);
        }
        .direction-badge[data-dir="short"] {
          color: var(--down);
          border: 1px solid var(--down);
        }
        .result-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .result-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
          background: var(--bg-panel-raised);
          border-radius: 8px;
          padding: 8px 10px;
        }
        .result-label {
          font-size: 9.5px;
          color: var(--text-faint);
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .result-value {
          font-size: 13px;
          color: var(--text);
          font-weight: 500;
        }
        .result-value.up {
          color: var(--up);
        }
        .result-value.down {
          color: var(--down);
        }
        .rr-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 12px;
          margin-top: 2px;
        }
        .rr-label {
          font-size: 10px;
          color: var(--text-faint);
          letter-spacing: 0.08em;
        }
        .rr-value {
          font-size: 20px;
          font-weight: 600;
          color: var(--text);
        }
        .rr-badge {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.05em;
          border: 1px solid;
          border-radius: 999px;
          padding: 2px 10px;
          margin-top: 2px;
        }
      `}</style>
    </div>
  );
}
