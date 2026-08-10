import { Candle } from "./yahoo";

export interface VolumeProfileBucket {
  priceLow: number;
  priceHigh: number;
  volume: number;
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
   *  as opposed to the settled POC over the whole loaded range */
  developingPoc: number | null;
}

function bucketVolumes(candles: Candle[], priceMin: number, bucketSize: number, numBuckets: number): number[] {
  const volumes = new Array(numBuckets).fill(0);

  for (const candle of candles) {
    const vol = candle.volume || 0;
    if (vol <= 0) continue;

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
      volumes[b] += vol * (overlap / candleRange);
    }
  }

  return volumes;
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
 * Buckets traded volume by price into a fixed number of horizontal bins
 * across the candles' full high/low range. Each candle's volume is split
 * across every bucket its own [low, high] range overlaps, weighted by how
 * much of the candle's range falls in that bucket — not just dumped into
 * whichever bucket contains its close — which is what makes this a real
 * volume *profile* rather than a volume-weighted price histogram.
 */
export function calculateVolumeProfile(
  candles: Candle[],
  numBuckets = 24
): VolumeProfileResult | null {
  if (candles.length === 0) return null;

  const priceMin = Math.min(...candles.map((c) => c.low));
  const priceMax = Math.max(...candles.map((c) => c.high));
  const range = priceMax - priceMin;
  if (range <= 0) return null;

  const bucketSize = range / numBuckets;
  const volumes = bucketVolumes(candles, priceMin, bucketSize, numBuckets);

  const buckets: VolumeProfileBucket[] = volumes.map((volume, i) => ({
    priceLow: priceMin + i * bucketSize,
    priceHigh: priceMin + (i + 1) * bucketSize,
    volume,
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
  const { high: valueAreaHigh, low: valueAreaLow } = computeValueArea(
    buckets,
    pocIndex,
    totalVolume
  );

  // Developing POC: same bucketing, but over only the most recent slice of
  // candles — where volume is concentrating *right now* rather than over
  // the whole loaded history. Without clean intraday session boundaries for
  // every interval, "recent 10% of loaded bars (min 5, max 30)" is a
  // pragmatic stand-in for "the current developing period."
  const devWindow = Math.min(30, Math.max(5, Math.round(candles.length * 0.1)));
  let developingPoc: number | null = null;
  if (candles.length > devWindow) {
    const recent = candles.slice(-devWindow);
    const recentVolumes = bucketVolumes(recent, priceMin, bucketSize, numBuckets);
    let devMaxVol = 0;
    let devIdx = 0;
    recentVolumes.forEach((v, i) => {
      if (v > devMaxVol) {
        devMaxVol = v;
        devIdx = i;
      }
    });
    if (devMaxVol > 0) {
      developingPoc = priceMin + (devIdx + 0.5) * bucketSize;
    }
  }

  return { buckets, pocIndex, maxVolume, valueAreaHigh, valueAreaLow, developingPoc };
}
