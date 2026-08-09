import { Candle } from "./yahoo";

export interface ConePoint {
  time: number;
  value: number;
}

export interface MonteCarloResult {
  median: ConePoint[];
  p25: ConePoint[];
  p75: ConePoint[];
  p5: ConePoint[];
  p95: ConePoint[];
  /** mean/stdev of log returns, in units of one bar (not annualized) */
  meanLogReturn: number;
  stdDevLogReturn: number;
  barsAhead: number;
  simulations: number;
  startPrice: number;
}

// Box–Muller transform: turns two uniform randoms into one standard-normal random.
function randNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Geometric Brownian Motion Monte Carlo simulation of future price paths.
 *
 * Estimates drift (mean) and volatility (stdev) from the historical log
 * returns of the loaded candles, then simulates `simulations` random future
 * paths `barsAhead` bars forward using the standard GBM step:
 *   price[t+1] = price[t] * exp((mean - 0.5*variance) + stdev * Z), Z ~ N(0,1)
 *
 * Returns percentile bands (5/25/50/75/95) across all simulated paths at
 * each future bar — the "cone" — rather than the raw paths themselves,
 * since that's what's actually useful to plot.
 *
 * Future bar spacing is inferred from the average gap between the last two
 * loaded candles, so this works the same regardless of interval (daily,
 * weekly, intraday) — it always projects forward in units of "one more bar
 * like the ones already on screen."
 */
export function runMonteCarloSimulation(
  candles: Candle[],
  opts: { barsAhead?: number; simulations?: number } = {}
): MonteCarloResult | null {
  const barsAhead = opts.barsAhead ?? 60;
  const simulations = opts.simulations ?? 500;

  if (candles.length < 30) return null; // too little history for a stable volatility estimate

  const closes = candles.map((c) => c.close);
  const logReturns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    logReturns.push(Math.log(closes[i] / closes[i - 1]));
  }

  const n = logReturns.length;
  const mean = logReturns.reduce((s, r) => s + r, 0) / n;
  const variance = logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);

  const startPrice = closes[closes.length - 1];
  const lastTime = candles[candles.length - 1].time;
  const step =
    candles.length >= 2
      ? candles[candles.length - 1].time - candles[candles.length - 2].time
      : 86400;

  // pathsByBar[d] = array of `simulations` prices at future bar d
  const pathsByBar: number[][] = Array.from({ length: barsAhead }, () => []);

  for (let s = 0; s < simulations; s++) {
    let price = startPrice;
    for (let d = 0; d < barsAhead; d++) {
      const shock = mean - 0.5 * variance + stdDev * randNormal();
      price = price * Math.exp(shock);
      pathsByBar[d].push(price);
    }
  }

  function pick(sorted: number[], p: number): number {
    const idx = Math.min(
      sorted.length - 1,
      Math.max(0, Math.round((p / 100) * (sorted.length - 1)))
    );
    return sorted[idx];
  }

  const median: ConePoint[] = [{ time: lastTime, value: startPrice }];
  const p25: ConePoint[] = [{ time: lastTime, value: startPrice }];
  const p75: ConePoint[] = [{ time: lastTime, value: startPrice }];
  const p5: ConePoint[] = [{ time: lastTime, value: startPrice }];
  const p95: ConePoint[] = [{ time: lastTime, value: startPrice }];

  for (let d = 0; d < barsAhead; d++) {
    const sorted = [...pathsByBar[d]].sort((a, b) => a - b);
    const time = lastTime + step * (d + 1);
    median.push({ time, value: pick(sorted, 50) });
    p25.push({ time, value: pick(sorted, 25) });
    p75.push({ time, value: pick(sorted, 75) });
    p5.push({ time, value: pick(sorted, 5) });
    p95.push({ time, value: pick(sorted, 95) });
  }

  return {
    median,
    p25,
    p75,
    p5,
    p95,
    meanLogReturn: mean,
    stdDevLogReturn: stdDev,
    barsAhead,
    simulations,
    startPrice,
  };
}
