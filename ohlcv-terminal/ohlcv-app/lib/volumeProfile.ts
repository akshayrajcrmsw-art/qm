import { Candle } from "./yahoo";

export interface VolumeProfileBucket {
  priceLow: number;
  priceHigh: number;
  /** total volume in this bucket (buyVolume + sellVolume) */
  volume: number;
  /** volume from candles that closed up (close >= open) — a standard OHLC-based
   *  proxy for buy-side pressure, since plain OHLCV data has no real trade-side tag */
  buyVolume: number;
  /** volume from candles that closed down (close < open) */
  sellVolume: number;
}

export interface VolumeProfileResult {
  buckets: VolumeProfileBucket[];
  /** the bucket with the single highest traded volume — the "point of control" */
  pocIndex: number;
  maxVolume: number;
  /** price boundaries of the value area (70% of total volume, built out from POC) */
  valueAreaHigh: number;
  valueAreaLow: number;
  /** POC computed from just the most recent bars — where value is forming *now*,
   *  as opposed to the settled POC over the whole session */
  developingPoc: number | null;
  totalBuyVolume: number;
  totalSellVolume: number;
}

interface BucketVolumes {
  volume: number[];
  buyVolume: number[];
  sellVolume: number[];
}

function bucketVolumes(
  candles: Candle[],
  priceMin: number,
  bucketSize: number,
  numBuckets: number
): BucketVolumes {
  const volume = new Array(numBuckets).fill(0);
  const buyVolume = new Array(numBuckets).fill(0);
  const sellVolume = new Array(numBuckets).fill(0);

  for (const candle of candles) {
    const vol = candle.volume || 0;
    if (vol <= 0) continue;

    const isBuy = candle.close >= candle.open;
    const candleLow = candle.low;
    const candleHigh = candle.high;
    const candleRange = candleHigh - candleLow || bucketSize;

    const startBucket = Math.max(0, Math.floor((candleLow - priceMin) / bucketSize));
    const endBucket = Math.min(numBuckets - 1, Math.floor((candleHigh - priceMin) / bucketSize));

    for (let b = startBucket; b <= endBucket; b++) {
      const bucketLow = priceMin + b * bucketSize;
      const bucketHigh = bucketLow + bucketSize;
      const overlapLow = Math.max(bucketLow, candleLow);
      const overlapHigh = Math.min(bucketHigh, candleHigh);
      const overlap = Math.max(0, overlapHigh - overlapLow);
      const share = vol * (overlap / candleRange);

      volume[b] += share;
      if (isBuy) buyVolume[b] += share;
      else sellVolume[b] += share;
    }
  }

  return { volume, buyVolume, sellVolume };
}

/** Builds the value area outward from the POC bucket until it holds ~70% of
 *  total volume, always extending toward whichever neighboring bucket has
 *  more volume — the standard value-area construction method. */
function computeValueArea(
  buckets: VolumeProfileBucket[],
  pocIndex: number,
  totalVolume: number,
  targetPct = 0.7
): { high: number; low: number } {
  let lo = pocIndex;
  let hi = pocIndex;
  let included = buckets[pocIndex].volume;
  const target = totalVolume * targetPct;

  while (included < target && (lo > 0 || hi < buckets.length - 1)) {
    const volAbove = hi < buckets.length - 1 ? buckets[hi + 1].volume : -1;
    const volBelow = lo > 0 ? buckets[lo - 1].volume : -1;

    if (volAbove >= volBelow) {
      hi++;
      included += buckets[hi].volume;
    } else {
      lo--;
      included += buckets[lo].volume;
    }
  }

  return { high: buckets[hi].priceHigh, low: buckets[lo].priceLow };
}

/**
 * Session Volume Profile: buckets traded volume by price into a fixed
 * number of horizontal bins across the candles' full high/low range, split
 * into buy vs sell volume per bucket using each candle's own direction
 * (close >= open → buy, close < open → sell) as a standard proxy for
 * trade-side pressure — plain OHLCV has no real per-trade buy/sell tag, so
 * this is the same convention most retail buy/sell volume tools use.
 *
 * Each candle's volume is split across every bucket its own [low, high]
 * range overlaps, weighted by how much of the candle's range falls in that
 * bucket — not just dumped into whichever bucket contains its close —
 * which is what makes this a real volume *profile* rather than a
 * volume-weighted price histogram.
 *
 * Intended to be run on a single session's worth of intraday candles (the
 * caller controls that by what it passes in), not months of daily bars —
 * that's what makes it a *session* profile rather than a whole-history one.
 */
export function calculateVolumeProfile(
  candles: Candle[],
  numBuckets = 60
): VolumeProfileResult | null {
  if (candles.length === 0) return null;

  const priceMin = Math.min(...candles.map((c) => c.low));
  const priceMax = Math.max(...candles.map((c) => c.high));
  const range = priceMax - priceMin;
  if (range <= 0) return null;

  const bucketSize = range / numBuckets;
  const vols = bucketVolumes(candles, priceMin, bucketSize, numBuckets);

  const buckets: VolumeProfileBucket[] = vols.volume.map((volume, i) => ({
    priceLow: priceMin + i * bucketSize,
    priceHigh: priceMin + (i + 1) * bucketSize,
    volume,
    buyVolume: vols.buyVolume[i],
    sellVolume: vols.sellVolume[i],
  }));

  let pocIndex = 0;
  let maxVolume = 0;
  buckets.forEach((b, i) => {
    if (b.volume > maxVolume) {
      maxVolume = b.volume;
      pocIndex = i;
    }
  });

  const totalVolume = buckets.reduce((s, b) => s + b.volume, 0);
  const totalBuyVolume = buckets.reduce((s, b) => s + b.buyVolume, 0);
  const totalSellVolume = buckets.reduce((s, b) => s + b.sellVolume, 0);

  const { high: valueAreaHigh, low: valueAreaLow } = computeValueArea(
    buckets,
    pocIndex,
    totalVolume
  );

  // Developing POC: same bucketing, but over only the most recent slice of
  // the session — where volume is concentrating *right now* rather than
  // over the whole session so far. "Recent 20% of loaded bars (min 5, max
  // 20)" scales sensibly whether the session is a handful of 15-minute bars
  // or a couple hundred 1-minute bars.
  const devWindow = Math.min(20, Math.max(5, Math.round(candles.length * 0.2)));
  let developingPoc: number | null = null;
  if (candles.length > devWindow) {
    const recent = candles.slice(-devWindow);
    const recentVols = bucketVolumes(recent, priceMin, bucketSize, numBuckets);
    let devMaxVol = 0;
    let devIdx = 0;
    recentVols.volume.forEach((v, i) => {
      if (v > devMaxVol) {
        devMaxVol = v;
        devIdx = i;
      }
    });
    if (devMaxVol > 0) {
      developingPoc = priceMin + (devIdx + 0.5) * bucketSize;
    }
  }

  return {
    buckets,
    pocIndex,
    maxVolume,
    valueAreaHigh,
    valueAreaLow,
    developingPoc,
    totalBuyVolume,
    totalSellVolume,
  };
}
