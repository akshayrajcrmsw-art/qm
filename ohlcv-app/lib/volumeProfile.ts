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
  const volumes = new Array(numBuckets).fill(0);

  for (const candle of candles) {
    const vol = candle.volume || 0;
    if (vol <= 0) continue;

    const candleLow = candle.low;
    const candleHigh = candle.high;
    const candleRange = candleHigh - candleLow || bucketSize; // guard against zero-range bars

    const startBucket = Math.max(0, Math.floor((candleLow - priceMin) / bucketSize));
    const endBucket = Math.min(numBuckets - 1, Math.floor((candleHigh - priceMin) / bucketSize));

    for (let b = startBucket; b <= endBucket; b++) {
      const bucketLow = priceMin + b * bucketSize;
      const bucketHigh = bucketLow + bucketSize;
      const overlapLow = Math.max(bucketLow, candleLow);
      const overlapHigh = Math.min(bucketHigh, candleHigh);
      const overlap = Math.max(0, overlapHigh - overlapLow);
      const weight = overlap / candleRange;
      volumes[b] += vol * weight;
    }
  }

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

  return { buckets, pocIndex, maxVolume };
}
