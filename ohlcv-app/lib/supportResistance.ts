import { Candle } from "./yahoo";

export interface SRLevel {
  price: number;
  type: "support" | "resistance";
  strength: number; // number of pivot touches clustered into this level
  firstTime: number;
  lastTime: number;
}

export interface TrendLine {
  type: "support" | "resistance";
  /** anchor points the line was actually fit to */
  start: { time: number; price: number };
  end: { time: number; price: number };
  /** projected forward to the last candle on the chart, dashed in the UI */
  projectedEnd: { time: number; price: number };
  touches: number;
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

export interface TrendLineOptions {
  swingWindow?: number;
  /** how many recent pivots of each type to consider as line anchors (bounds the O(n^2) search) */
  maxPivots?: number;
  /** minimum bars between two anchors for a line to be meaningful */
  minSpanBars?: number;
  /** max lines to return per side */
  maxPerSide?: number;
}

type Pivot = { index: number; price: number; type: "support" | "resistance"; time: number };

function detectPivots(candles: Candle[], swingWindow: number): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = swingWindow; i < candles.length - swingWindow; i++) {
    const slice = candles.slice(i - swingWindow, i + swingWindow + 1);
    const c = candles[i];
    if (slice.every((s) => c.high >= s.high)) {
      pivots.push({ index: i, price: c.high, type: "resistance", time: c.time });
    }
    if (slice.every((s) => c.low <= s.low)) {
      pivots.push({ index: i, price: c.low, type: "support", time: c.time });
    }
  }
  return pivots;
}

function defaultSwingWindow(candleCount: number): number {
  return candleCount > 800 ? 8 : candleCount > 200 ? 5 : 3;
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

  const swingWindow = opts.swingWindow ?? defaultSwingWindow(candles.length);
  const clusterPct = opts.clusterPct ?? 0.006; // 0.6%
  const minTouches = opts.minTouches ?? 2;
  const maxLevels = opts.maxLevels ?? 10;

  const pivots = detectPivots(candles, swingWindow);
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

/**
 * Fits diagonal trendlines through swing highs (resistance, usually
 * downward-sloping) and swing lows (support, usually upward-sloping).
 *
 * For every pair of same-type pivots, draws the line through them and checks
 * whether price stayed on the correct side of it (within a small tolerance)
 * for every bar between the two anchors — the classical definition of a
 * valid trendline segment. Surviving candidates are scored by how many other
 * pivots also touch the line and how far apart the anchors are, then the
 * best non-overlapping line per side is kept and projected forward to the
 * most recent candle so it's useful to look at, not just historically true.
 */
export function calculateTrendlines(
  candles: Candle[],
  opts: TrendLineOptions = {}
): TrendLine[] {
  if (candles.length < 20) return [];

  const swingWindow = opts.swingWindow ?? defaultSwingWindow(candles.length);
  const maxPivots = opts.maxPivots ?? 60;
  const minSpanBars = opts.minSpanBars ?? Math.max(5, Math.floor(candles.length * 0.03));
  const maxPerSide = opts.maxPerSide ?? 2;

  const pivots = detectPivots(candles, swingWindow);
  const priceSpan =
    Math.max(...candles.map((c) => c.high)) - Math.min(...candles.map((c) => c.low));
  const tolerance = priceSpan * 0.004 || candles[candles.length - 1].close * 0.001;

  const lastCandle = candles[candles.length - 1];
  const results: TrendLine[] = [];

  for (const type of ["support", "resistance"] as const) {
    // Most recent pivots are most relevant to "where is price now relative
    // to this line" — cap the search space to those for performance.
    const pts = pivots.filter((p) => p.type === type).slice(-maxPivots);

    type Candidate = {
      p1: Pivot;
      p2: Pivot;
      slope: number;
      intercept: number;
      touches: number;
      span: number;
    };
    const candidates: Candidate[] = [];

    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const p1 = pts[i];
        const p2 = pts[j];
        if (p2.index - p1.index < minSpanBars) continue;

        const slope = (p2.price - p1.price) / (p2.time - p1.time);
        const intercept = p1.price - slope * p1.time;
        const lineAt = (t: number) => slope * t + intercept;

        // A valid trendline shouldn't be meaningfully pierced between its
        // own anchors — allow a tiny amount of noise, not outright breaks.
        let violations = 0;
        const segment = candles.slice(p1.index, p2.index + 1);
        for (const c of segment) {
          const v = lineAt(c.time);
          if (type === "resistance" && c.high > v + tolerance) violations++;
          if (type === "support" && c.low < v - tolerance) violations++;
        }
        const maxViolations = Math.max(1, Math.round(segment.length * 0.03));
        if (violations > maxViolations) continue;

        const touches = pts.filter((p) => Math.abs(lineAt(p.time) - p.price) <= tolerance).length;
        if (touches < 3) continue; // the two anchors plus at least one more confirmation

        candidates.push({ p1, p2, slope, intercept, touches, span: p2.index - p1.index });
      }
    }

    // Longer, more-touched lines first; then greedily keep non-overlapping ones
    // (measured by anchor overlap) so we don't return five near-duplicate lines.
    candidates.sort((a, b) => b.touches - a.touches || b.span - a.span);

    const chosen: Candidate[] = [];
    for (const cand of candidates) {
      const overlapsExisting = chosen.some(
        (c) => !(cand.p2.index < c.p1.index || cand.p1.index > c.p2.index)
      );
      if (overlapsExisting) continue;
      chosen.push(cand);
      if (chosen.length >= maxPerSide) break;
    }

    for (const c of chosen) {
      const lineAt = (t: number) => c.slope * t + c.intercept;
      results.push({
        type,
        start: { time: c.p1.time, price: c.p1.price },
        end: { time: c.p2.time, price: c.p2.price },
        projectedEnd: { time: lastCandle.time, price: lineAt(lastCandle.time) },
        touches: c.touches,
      });
    }
  }

  return results;
}
