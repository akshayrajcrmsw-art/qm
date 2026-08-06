export interface RangeOption {
  label: string;
  range: string; // Yahoo `range` query value
  days: number; // approximate span, used to validate against interval limits
}

// How far back Yahoo will let you go for a given candle size. These are
// Yahoo's real, undocumented-but-consistent limits — request further back
// than this at a given interval and the API just errors out.
export interface IntervalOption {
  label: string;
  value: string; // Yahoo `interval` query value
  maxDays: number;
  pollMs: number; // how often to poll for the live price at this granularity
}

export const RANGE_OPTIONS: RangeOption[] = [
  { label: "1D", range: "1d", days: 1 },
  { label: "5D", range: "5d", days: 5 },
  { label: "1M", range: "1mo", days: 30 },
  { label: "3M", range: "3mo", days: 90 },
  { label: "6M", range: "6mo", days: 180 },
  { label: "1Y", range: "1y", days: 365 },
  { label: "2Y", range: "2y", days: 730 },
  { label: "5Y", range: "5y", days: 1825 },
  { label: "MAX", range: "max", days: 100000 },
];

export const INTERVAL_OPTIONS: IntervalOption[] = [
  { label: "1m", value: "1m", maxDays: 7, pollMs: 5000 },
  { label: "2m", value: "2m", maxDays: 60, pollMs: 10000 },
  { label: "5m", value: "5m", maxDays: 60, pollMs: 15000 },
  { label: "15m", value: "15m", maxDays: 60, pollMs: 20000 },
  { label: "30m", value: "30m", maxDays: 60, pollMs: 30000 },
  { label: "1h", value: "60m", maxDays: 730, pollMs: 60000 },
  { label: "1D", value: "1d", maxDays: 100000, pollMs: 60000 },
  { label: "1W", value: "1wk", maxDays: 100000, pollMs: 300000 },
  { label: "1M", value: "1mo", maxDays: 100000, pollMs: 900000 },
];

export const DEFAULT_SYMBOL = "^NSEI";
export const DEFAULT_RANGE_LABEL = "1Y";
export const DEFAULT_INTERVAL_LABEL = "1D";

export function isValidCombo(rangeLabel: string, intervalLabel: string): boolean {
  const range = RANGE_OPTIONS.find((r) => r.label === rangeLabel);
  const interval = INTERVAL_OPTIONS.find((i) => i.label === intervalLabel);
  if (!range || !interval) return false;
  return range.days <= interval.maxDays;
}

/** Given a chosen range, return the finest interval still valid for it (defaults to 1D if none). */
export function bestIntervalForRange(rangeLabel: string): string {
  const range = RANGE_OPTIONS.find((r) => r.label === rangeLabel);
  if (!range) return DEFAULT_INTERVAL_LABEL;
  const valid = INTERVAL_OPTIONS.filter((i) => range.days <= i.maxDays);
  return valid[0]?.label ?? DEFAULT_INTERVAL_LABEL;
}

/** Given a chosen interval, return the largest range still valid for it. */
export function bestRangeForInterval(intervalLabel: string): string {
  const interval = INTERVAL_OPTIONS.find((i) => i.label === intervalLabel);
  if (!interval) return DEFAULT_RANGE_LABEL;
  const valid = RANGE_OPTIONS.filter((r) => r.days <= interval.maxDays);
  return valid[valid.length - 1]?.label ?? DEFAULT_RANGE_LABEL;
}
