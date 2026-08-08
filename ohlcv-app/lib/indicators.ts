import { Candle } from "./yahoo";

export interface IndicatorPoint {
  time: number;
  value: number;
}

// Kept as an alias so any external code importing the old name doesn't
// silently break — EWMAPoint is the name to use going forward.
export type EMAPoint = IndicatorPoint;
export type EWMAPoint = IndicatorPoint;

/**
 * Exponentially Weighted Moving Average: seeded with a simple average over
 * the first `period` closes, then smoothed forward with decay factor
 * k = 2/(period+1). This is the standard EWMA formula — what's commonly
 * called "EMA" on charting platforms is this same calculation; EWMA is the
 * more precise statistical name for it. It's also exactly what
 * pandas' `.ewm(span=period, adjust=False).mean()` and TA-Lib's EMA compute,
 * so values line up with either without needing to shell out to Python.
 *
 * Returns one point per candle from the point the seed becomes available
 * onward (i.e. the first `period - 1` candles have no value yet, same as
 * any charting platform).
 */
export function calculateEWMA(candles: Candle[], period: number): IndicatorPoint[] {
  if (candles.length < period) return [];

  const k = 2 / (period + 1);
  const points: IndicatorPoint[] = [];

  const seed = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;
  let value = seed;
  points.push({ time: candles[period - 1].time, value });

  for (let i = period; i < candles.length; i++) {
    value = candles[i].close * k + value * (1 - k);
    points.push({ time: candles[i].time, value });
  }

  return points;
}

// Backward-compatible alias.
export const calculateEMA = calculateEWMA;

export interface StdDevBands {
  basis: IndicatorPoint[]; // rolling simple moving average (the band's center line)
  upper: IndicatorPoint[]; // basis + multiplier * rolling stdev
  lower: IndicatorPoint[]; // basis - multiplier * rolling stdev
}

/**
 * Rolling Standard Deviation bands (a.k.a. Bollinger-style bands): a simple
 * moving average of closes over `period` bars, with upper/lower bands at
 * `multiplier` standard deviations away, recomputed at every bar using a
 * trailing window. Standard technical-analysis volatility bands — distinct
 * from the EWMA lines, which track trend rather than dispersion.
 */
export function calculateStdDevBands(
  candles: Candle[],
  period = 20,
  multiplier = 2
): StdDevBands {
  const basis: IndicatorPoint[] = [];
  const upper: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];

  if (candles.length < period) return { basis, upper, lower };

  for (let i = period - 1; i < candles.length; i++) {
    const window = candles.slice(i - period + 1, i + 1);
    const mean = window.reduce((s, c) => s + c.close, 0) / period;
    const variance = window.reduce((s, c) => s + (c.close - mean) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);

    const time = candles[i].time;
    basis.push({ time, value: mean });
    upper.push({ time, value: mean + multiplier * stdDev });
    lower.push({ time, value: mean - multiplier * stdDev });
  }

  return { basis, upper, lower };
}
