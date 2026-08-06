"use client";

import { useMemo, useState } from "react";

type RiskMode = "percent" | "fixed";
type TargetMode = "price" | "ratio";

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export default function PositionSizingCalculator() {
  const [accountSize, setAccountSize] = useState("100000");
  const [riskMode, setRiskMode] = useState<RiskMode>("percent");
  const [riskPct, setRiskPct] = useState("1");
  const [riskFixed, setRiskFixed] = useState("1000");

  const [entry, setEntry] = useState("");
  const [stopLoss, setStopLoss] = useState("");

  const [targetMode, setTargetMode] = useState<TargetMode>("ratio");
  const [targetPrice, setTargetPrice] = useState("");
  const [desiredRR, setDesiredRR] = useState("2");

  const result = useMemo(() => {
    const acc = parseFloat(accountSize);
    const e = parseFloat(entry);
    const sl = parseFloat(stopLoss);

    if (!Number.isFinite(e) || !Number.isFinite(sl) || e === sl) return null;

    const direction: "long" | "short" = sl < e ? "long" : "short";
    const riskPerUnit = Math.abs(e - sl);

    const riskAmount =
      riskMode === "percent"
        ? (Number.isFinite(acc) ? acc : 0) * (parseFloat(riskPct) || 0) / 100
        : parseFloat(riskFixed) || 0;

    if (riskAmount <= 0) return null;

    const positionSizeRaw = riskAmount / riskPerUnit;
    const positionSize = Math.floor(positionSizeRaw);
    const positionValue = positionSize * e;

    let rewardPerUnit: number | null = null;
    let rrRatio: number | null = null;
    let impliedTarget: number | null = null;
    let potentialProfit: number | null = null;

    if (targetMode === "price") {
      const t = parseFloat(targetPrice);
      if (Number.isFinite(t)) {
        rewardPerUnit = Math.abs(t - e);
        rrRatio = rewardPerUnit / riskPerUnit;
        potentialProfit = positionSize * rewardPerUnit;
        impliedTarget = t;
      }
    } else {
      const rr = parseFloat(desiredRR);
      if (Number.isFinite(rr) && rr > 0) {
        rewardPerUnit = riskPerUnit * rr;
        rrRatio = rr;
        impliedTarget = direction === "long" ? e + rewardPerUnit : e - rewardPerUnit;
        potentialProfit = riskAmount * rr;
      }
    }

    return {
      direction,
      riskPerUnit,
      riskAmount,
      positionSizeRaw,
      positionSize,
      positionValue,
      rewardPerUnit,
      rrRatio,
      impliedTarget,
      potentialProfit,
      accountUsedPct: Number.isFinite(acc) && acc > 0 ? (positionValue / acc) * 100 : null,
    };
  }, [accountSize, riskMode, riskPct, riskFixed, entry, stopLoss, targetMode, targetPrice, desiredRR]);

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Position Sizing</span>
      </div>

      <div className="panel-body">
        <div className="field-row">
          <label>Account size</label>
          <input
            className="mono"
            value={accountSize}
            onChange={(e) => setAccountSize(e.target.value)}
            inputMode="decimal"
            placeholder="100000"
          />
        </div>

        <div className="field-row">
          <label>Risk per trade</label>
          <div className="split">
            <div className="toggle">
              <button
                className={riskMode === "percent" ? "active" : ""}
                onClick={() => setRiskMode("percent")}
              >
                %
              </button>
              <button
                className={riskMode === "fixed" ? "active" : ""}
                onClick={() => setRiskMode("fixed")}
              >
                Fixed
              </button>
            </div>
            {riskMode === "percent" ? (
              <input
                className="mono"
                value={riskPct}
                onChange={(e) => setRiskPct(e.target.value)}
                inputMode="decimal"
                placeholder="1"
              />
            ) : (
              <input
                className="mono"
                value={riskFixed}
                onChange={(e) => setRiskFixed(e.target.value)}
                inputMode="decimal"
                placeholder="1000"
              />
            )}
          </div>
        </div>

        <div className="field-row two-up">
          <div>
            <label>Entry price</label>
            <input
              className="mono"
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 2450"
            />
          </div>
          <div>
            <label>Stop loss</label>
            <input
              className="mono"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 2400"
            />
          </div>
        </div>

        <div className="field-row">
          <label>Target</label>
          <div className="split">
            <div className="toggle">
              <button
                className={targetMode === "ratio" ? "active" : ""}
                onClick={() => setTargetMode("ratio")}
              >
                R:R
              </button>
              <button
                className={targetMode === "price" ? "active" : ""}
                onClick={() => setTargetMode("price")}
              >
                Price
              </button>
            </div>
            {targetMode === "ratio" ? (
              <input
                className="mono"
                value={desiredRR}
                onChange={(e) => setDesiredRR(e.target.value)}
                inputMode="decimal"
                placeholder="2"
              />
            ) : (
              <input
                className="mono"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 2550"
              />
            )}
          </div>
        </div>

        {!result && (entry || stopLoss) && (
          <div className="hint mono">Enter a valid entry and stop loss (they can&rsquo;t be equal).</div>
        )}

        {result && (
          <div className="results">
            <div className="direction-badge mono" data-dir={result.direction}>
              {result.direction === "long" ? "LONG" : "SHORT"}
            </div>

            <div className="result-grid">
              <div className="result-item">
                <span className="result-label">Risk / unit</span>
                <span className="mono">{fmt(result.riskPerUnit)}</span>
              </div>
              <div className="result-item">
                <span className="result-label">Risk amount</span>
                <span className="mono">{fmt(result.riskAmount)}</span>
              </div>
              <div className="result-item highlight">
                <span className="result-label">Position size</span>
                <span className="mono">{fmt(result.positionSize, 0)} units</span>
              </div>
              <div className="result-item">
                <span className="result-label">Position value</span>
                <span className="mono">{fmt(result.positionValue)}</span>
              </div>
              {result.accountUsedPct != null && (
                <div className="result-item">
                  <span className="result-label">% of account</span>
                  <span className="mono">{fmt(result.accountUsedPct)}%</span>
                </div>
              )}
              {result.impliedTarget != null && (
                <div className="result-item">
                  <span className="result-label">
                    {targetMode === "ratio" ? "Implied target" : "Reward / unit"}
                  </span>
                  <span className="mono">
                    {targetMode === "ratio" ? fmt(result.impliedTarget) : fmt(result.rewardPerUnit!)}
                  </span>
                </div>
              )}
              {result.rrRatio != null && (
                <div className="result-item">
                  <span className="result-label">R:R</span>
                  <span className="mono">1 : {fmt(result.rrRatio)}</span>
                </div>
              )}
              {result.potentialProfit != null && (
                <div className="result-item highlight">
                  <span className="result-label">Potential profit</span>
                  <span className="mono up">{fmt(result.potentialProfit)}</span>
                </div>
              )}
            </div>
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
          border-radius: 10px;
          overflow: hidden;
        }
        .panel-head {
          padding: 12px 14px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .panel-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
        }
        .panel-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        label {
          display: block;
          font-size: 10.5px;
          color: var(--text-faint);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 5px;
        }
        input {
          width: 100%;
          background: var(--bg-panel-raised);
          border: 1px solid var(--border);
          border-radius: 7px;
          padding: 7px 9px;
          color: var(--text);
          font-size: 12.5px;
          outline: none;
        }
        input:focus {
          border-color: var(--focus);
        }
        .field-row.two-up {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .split {
          display: flex;
          gap: 8px;
        }
        .split input {
          flex: 1;
        }
        .toggle {
          display: flex;
          background: var(--bg-panel-raised);
          border: 1px solid var(--border);
          border-radius: 7px;
          padding: 2px;
          flex-shrink: 0;
        }
        .toggle button {
          background: transparent;
          border: none;
          color: var(--text-dim);
          font-size: 11px;
          padding: 5px 9px;
          border-radius: 5px;
        }
        .toggle button.active {
          background: var(--bg-panel);
          color: var(--accent);
        }
        .hint {
          font-size: 11px;
          color: var(--text-faint);
        }
        .results {
          border-top: 1px solid var(--border);
          padding-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .direction-badge {
          display: inline-block;
          width: fit-content;
          font-size: 10.5px;
          letter-spacing: 0.06em;
          border-radius: 999px;
          padding: 3px 10px;
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
          border-radius: 7px;
          padding: 7px 9px;
        }
        .result-item.highlight {
          background: rgba(240, 168, 104, 0.08);
          border: 1px solid var(--accent-dim);
        }
        .result-label {
          font-size: 9.5px;
          color: var(--text-faint);
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .result-item span.mono {
          font-size: 12.5px;
          color: var(--text);
        }
        .result-item span.mono.up {
          color: var(--up);
        }
      `}</style>
    </div>
  );
}
