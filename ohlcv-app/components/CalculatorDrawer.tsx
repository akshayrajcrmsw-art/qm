"use client";

import { useState } from "react";
import PositionSizingCalculator from "@/components/PositionSizingCalculator";

export default function CalculatorDrawer() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="hamburger"
        onClick={() => setOpen(true)}
        aria-label="Open position sizing calculator"
        title="Position sizing calculator"
      >
        <span />
        <span />
        <span />
      </button>

      {open && (
        <div className="backdrop" onClick={() => setOpen(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <span className="drawer-title mono">CALCULATOR</span>
              <button className="close-btn" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="drawer-body">
              <PositionSizingCalculator />
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .hamburger {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 4px;
          width: 34px;
          height: 34px;
          background: var(--bg-panel-raised);
          border: 1px solid var(--border);
          border-radius: 3px;
          flex-shrink: 0;
        }
        .hamburger:hover {
          border-color: var(--accent-dim);
        }
        .hamburger span {
          display: block;
          width: 16px;
          height: 1.5px;
          background: var(--text-dim);
          border-radius: 1px;
        }
        .backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 40;
          display: flex;
          justify-content: flex-end;
        }
        .drawer {
          width: 100%;
          max-width: 380px;
          height: 100%;
          background: var(--bg);
          border-left: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          animation: slideIn 0.18s ease-out;
        }
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .drawer-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .drawer-title {
          font-size: 12px;
          color: var(--text-dim);
          letter-spacing: 0.06em;
        }
        .close-btn {
          background: transparent;
          border: none;
          color: var(--text-dim);
          font-size: 20px;
          line-height: 1;
          padding: 2px 6px;
        }
        .close-btn:hover {
          color: var(--text);
        }
        .drawer-body {
          flex: 1;
          min-height: 0;
          padding: 14px;
        }
      `}</style>
    </>
  );
}
