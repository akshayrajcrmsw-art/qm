import { Candle } from "./yahoo";

export interface EMAPoint {
  time: number;
  value: number;
}

/**
 * Standard exponential moving average: seeded with a simple moving average
 * over the first `period` closes, then smoothed forward with k = 2/(period+1).
 * This is the same formula TA-Lib and pandas-ta's default EMA use, so values
 * line up with what you'd get from either — no need to shell out to Python
 * for it.
 *
 * Returns one point per candle from the point the SMA seed becomes available
 * onward (i.e. the first `period - 1` candles have no EMA yet, same as any
 * charting platform).
 */
export function calculateEMA(candles: Candle[], period: number): EMAPoint[] {
  if (candles.length < period) return [];

  const k = 2 / (period + 1);
  const points: EMAPoint[] = [];

  const seed = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;
  let ema = seed;
  points.push({ time: candles[period - 1].time, value: ema });

  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
    points.push({ time: candles[i].time, value: ema });
  }

  return points;
}
