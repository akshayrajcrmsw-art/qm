export interface RangeOption {
  label: string;
  range: string;
  interval: string;
  /** poll frequency in ms for "live" updates while this range is active */
  pollMs: number;
}

export const RANGE_OPTIONS: RangeOption[] = [
  { label: "1D", range: "1d", interval: "1m", pollMs: 5000 },
  { label: "5D", range: "5d", interval: "15m", pollMs: 15000 },
  { label: "1M", range: "1mo", interval: "30m", pollMs: 30000 },
  { label: "3M", range: "3mo", interval: "1d", pollMs: 60000 },
  { label: "6M", range: "6mo", interval: "1d", pollMs: 60000 },
  { label: "1Y", range: "1y", interval: "1d", pollMs: 60000 },
  { label: "2Y", range: "2y", interval: "1d", pollMs: 120000 },
  { label: "5Y", range: "5y", interval: "1wk", pollMs: 300000 },
  { label: "MAX", range: "max", interval: "1mo", pollMs: 600000 },
];

export const DEFAULT_SYMBOL = "^NSEI";
export const DEFAULT_RANGE_LABEL = "1Y";
