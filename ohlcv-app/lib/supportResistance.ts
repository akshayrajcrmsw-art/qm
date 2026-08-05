import { Candle } from "./yahoo";

export interface SRLevel {
  price: number;
  type: "support" | "resistance";
  strength: number; // number of pivot touches clustered into this level
  firstTime: number;
  lastTime: number;
}

export interface SROptions {
  /** bars to each side that must not exceed the pivot for it to count as a swing point */
  swingWindow?: number;
  /** cluster pivots within this fractional distance of each other into one level, e.g. 0.004 = 0.4% */
  clusterPct?: number;
  /** minimum touches required to keep a level */
  minTouches?: number;
  /** max number of levels to return */
  maxLevels?: number;
}

/**
 * Detects swing highs/lows (fractals) then clusters nearby price extremes into
 * horizontal support/resistance zones, ranked by how many times price touched them.
 * This is a lightweight, dependency-free analogue to the pivot-clustering step
 * used by libraries like trendln, tuned to run fast in a serverless function.
 */
export function calculateSupportResistance(
  candles: Candle[],
  opts: SROptions = {}
): SRLevel[] {
  if (candles.length < 10) return [];

  // Scale the swing window to how much history we have so short ranges
  // (e.g. 5d of 1m bars) don't drown in noise and long ranges (5y daily)
  // still pick up meaningful turning points.
  const defaultWindow = candles.length > 800 ? 8 : candles.length > 200 ? 5 : 3;
  const swingWindow = opts.swingWindow ?? defaultWindow;
  const clusterPct = opts.clusterPct ?? 0.006; // 0.6%
  const minTouches = opts.minTouches ?? 2;
  const maxLevels = opts.maxLevels ?? 10;

  type Pivot = { price: number; type: "support" | "resistance"; time: number };
  const pivots: Pivot[] = [];

  for (let i = swingWindow; i < candles.length - swingWindow; i++) {
    const slice = candles.slice(i - swingWindow, i + swingWindow + 1);
    const c = candles[i];

    if (slice.every((s) => c.high >= s.high)) {
      pivots.push({ price: c.high, type: "resistance", time: c.time });
    }
    if (slice.every((s) => c.low <= s.low)) {
      pivots.push({ price: c.low, type: "support", time: c.time });
    }
  }

  const levels: SRLevel[] = [];

  for (const type of ["support", "resistance"] as const) {
    const pts = pivots.filter((p) => p.type === type).sort((a, b) => a.price - b.price);

    let cluster: Pivot[] = [];
    const flush = () => {
      if (cluster.length === 0) return;
      const avg = cluster.reduce((s, p) => s + p.price, 0) / cluster.length;
      levels.push({
        price: avg,
        type,
        strength: cluster.length,
        firstTime: Math.min(...cluster.map((p) => p.time)),
        lastTime: Math.max(...cluster.map((p) => p.time)),
      });
      cluster = [];
    };

    for (const p of pts) {
      if (cluster.length === 0) {
        cluster.push(p);
        continue;
      }
      const clusterAvg = cluster.reduce((s, c) => s + c.price, 0) / cluster.length;
      if (Math.abs(p.price - clusterAvg) / clusterAvg <= clusterPct) {
        cluster.push(p);
      } else {
        flush();
        cluster.push(p);
      }
    }
    flush();
  }

  const lastClose = candles[candles.length - 1].close;

  return levels
    .filter((l) => l.strength >= minTouches)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, maxLevels * 2) // keep a wider pool before splitting by side
    .map(
      (l): SRLevel => ({
        ...l,
        type: l.price >= lastClose ? "resistance" : "support",
      })
    )
    .sort((a, b) => Math.abs(a.price - lastClose) - Math.abs(b.price - lastClose))
    .slice(0, maxLevels)
    .sort((a, b) => b.price - a.price);
}
