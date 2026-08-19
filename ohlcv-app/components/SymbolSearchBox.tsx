"use client";

import { useEffect, useRef, useState } from "react";

interface SymbolResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

interface SymbolSearchBoxProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  placeholder?: string;
}

export default function SymbolSearchBox({
  symbol,
  onSymbolChange,
  placeholder,
}: SymbolSearchBoxProps) {
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

  // The ticker box accepts any symbol the person types — Yahoo tickers
  // aren't limited to NSE (e.g. AAPL, ^GSPC, BTC-USD all work the same way).
  function commitSymbol(next: string) {
    const clean = next.trim();
    if (!clean) return;
    onSymbolChange(clean.toUpperCase());
    setQuery(clean.toUpperCase());
    setOpen(false);
    setResults([]);
  }

  return (
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
        placeholder={placeholder || "Symbol, e.g. ^NSEI, AAPL, BTC-USD, RELIANCE.NS"}
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

      <style jsx>{`
        .symbol-box {
          position: relative;
          display: flex;
          align-items: center;
          background: var(--bg-panel-raised);
          border: 1px solid var(--border);
          border-radius: 3px;
          padding: 8px 12px;
          width: 100%;
        }
        .symbol-box:focus-within {
          border-color: var(--focus);
        }
        .symbol-icon {
          color: var(--text-faint);
          margin-right: 8px;
          font-size: 14px;
          flex-shrink: 0;
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
          border-radius: 3px;
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
      `}</style>
    </div>
  );
}
