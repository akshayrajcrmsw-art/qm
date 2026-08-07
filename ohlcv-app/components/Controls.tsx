"use client";

import { useEffect, useRef, useState } from "react";
import { INTERVAL_OPTIONS, RANGE_OPTIONS } from "@/lib/ranges";

interface SymbolResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

interface ControlsProps {
  symbol: string;
  rangeLabel: string;
  intervalLabel: string;
  onSymbolChange: (symbol: string) => void;
  onRangeChange: (label: string) => void;
  onIntervalChange: (label: string) => void;
}

export default function Controls({
  symbol,
  rangeLabel,
  intervalLabel,
  onSymbolChange,
  onRangeChange,
  onIntervalChange,
}: ControlsProps) {
  const [query, setQuery] = useState(symbol);
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setQuery(symbol), [symbol]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 1) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
        const data = await res.json();
        setResults(data.results || []);
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 250);
  }

  function commitSymbol(next: string) {
    const clean = next.trim();
    if (!clean) return;
    onSymbolChange(clean.toUpperCase());
    setQuery(clean.toUpperCase());
    setOpen(false);
    setResults([]);
  }

  return (
    <div className="controls">
      <div className="symbol-box" ref={boxRef}>
        <span className="symbol-icon">⌕</span>
        <input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitSymbol(query);
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Symbol, e.g. ^NSEI, AAPL, BTC-USD"
          spellCheck={false}
          autoComplete="off"
        />
        {open && results.length > 0 && (
          <div className="symbol-dropdown">
            {results.map((r) => (
              <button
                key={r.symbol}
                className="symbol-option"
                onClick={() => commitSymbol(r.symbol)}
              >
                <span className="mono symbol-option-ticker">{r.symbol}</span>
                <span className="symbol-option-name">{r.name}</span>
                <span className="symbol-option-exchange">{r.exchange}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="range-tabs">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            className={`range-tab ${opt.label === rangeLabel ? "active" : ""}`}
            onClick={() => onRangeChange(opt.label)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="interval-select">
        <span className="interval-label">Candle</span>
        <select
          className="mono"
          value={intervalLabel}
          onChange={(e) => onIntervalChange(e.target.value)}
        >
          {INTERVAL_OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.label}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <style jsx>{`
        .controls {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .symbol-box {
          position: relative;
          display: flex;
          align-items: center;
          background: var(--bg-panel-raised);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 8px 12px;
          min-width: 260px;
        }
        .symbol-box:focus-within {
          border-color: var(--focus);
        }
        .symbol-icon {
          color: var(--text-faint);
          margin-right: 8px;
          font-size: 14px;
        }
        .symbol-box input {
          background: transparent;
          border: none;
          outline: none;
          color: var(--text);
          font-size: 14px;
          font-family: var(--font-mono), monospace;
          letter-spacing: 0.02em;
          width: 100%;
        }
        .symbol-box input::placeholder {
          color: var(--text-faint);
          font-family: var(--font-display), sans-serif;
        }
        .symbol-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          right: 0;
          background: var(--bg-panel-raised);
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
          z-index: 20;
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.4);
        }
        .symbol-option {
          display: flex;
          align-items: baseline;
          gap: 10px;
          width: 100%;
          text-align: left;
          background: none;
          border: none;
          padding: 9px 12px;
          color: var(--text);
          border-bottom: 1px solid var(--border);
        }
        .symbol-option:last-child {
          border-bottom: none;
        }
        .symbol-option:hover {
          background: var(--bg-panel);
        }
        .symbol-option-ticker {
          font-size: 13px;
          color: var(--accent);
          flex-shrink: 0;
        }
        .symbol-option-name {
          font-size: 12px;
          color: var(--text-dim);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
        }
        .symbol-option-exchange {
          font-size: 11px;
          color: var(--text-faint);
          flex-shrink: 0;
        }
        .range-tabs {
          display: flex;
          gap: 2px;
          background: var(--bg-panel-raised);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 3px;
        }
        .range-tab {
          background: transparent;
          border: none;
          color: var(--text-dim);
          font-size: 12px;
          font-family: var(--font-mono), monospace;
          padding: 6px 10px;
          border-radius: 6px;
        }
        .range-tab:hover {
          color: var(--text);
        }
        .range-tab.active {
          background: var(--bg-panel);
          color: var(--accent);
        }
        .interval-select {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--bg-panel-raised);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 6px 10px;
        }
        .interval-label {
          font-size: 11px;
          color: var(--text-faint);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .interval-select select {
          background: transparent;
          border: none;
          outline: none;
          color: var(--accent);
          font-size: 12px;
          font-family: var(--font-mono), monospace;
          cursor: pointer;
        }
        .interval-select select option {
          background: var(--bg-panel-raised);
          color: var(--text);
        }
      `}</style>
    </div>
  );
}
