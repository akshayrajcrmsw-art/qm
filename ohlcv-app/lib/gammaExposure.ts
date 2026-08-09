export interface OptionContract {
  strike: number;
  openInterest: number;
  impliedVolatility: number;
  type: "call" | "put";
}

export interface GammaStrike {
  strike: number;
  callGEX: number;
  putGEX: number;
  netGEX: number;
}

export interface GammaExposureResult {
  spotPrice: number;
  expiry: number; // unix seconds
  strikes: GammaStrike[];
  gammaFlipStrike: number | null;
  totalGEX: number;
}

function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Black-Scholes gamma: the rate of change of an option's delta per $1 move
 * in the underlying. Same for calls and puts at a given strike/expiry/vol —
 * what differs between them here is open interest, not the gamma formula
 * itself.
 */
function blackScholesGamma(S: number, K: number, T: number, sigma: number, r = 0.05): number {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  return normalPDF(d1) / (S * sigma * Math.sqrt(T));
}

const CONTRACT_MULTIPLIER = 100; // standard US equity/index option contract size

/**
 * Aggregates open-interest-weighted Black-Scholes gamma into "gamma
 * exposure" (GEX) per strike — a common simplified retail approximation of
 * dealer positioning, not a claim about any specific market maker's actual
 * book (real dealer positioning isn't public data).
 *
 * Convention used here (the standard public one): calls contribute positive
 * GEX (dealers who sold calls are assumed net long gamma, so their hedging
 * dampens price moves), puts contribute negative GEX (dealers who sold puts
 * are assumed net short gamma, so their hedging amplifies moves). The
 * "gamma flip" is the strike where cumulative GEX crosses zero — often
 * watched as a rough proxy for where dealer hedging flips from
 * stabilizing to destabilizing.
 */
export function calculateGammaExposure(
  contracts: OptionContract[],
  spotPrice: number,
  expiry: number,
  now: number = Date.now() / 1000
): GammaExposureResult | null {
  if (contracts.length === 0 || spotPrice <= 0) return null;

  const T = Math.max((expiry - now) / (365 * 86400), 1 / 365); // floor at 1 day to avoid T→0 blowup

  const byStrike = new Map<
    number,
    { callOI: number; putOI: number; callIV: number; putIV: number }
  >();

  for (const c of contracts) {
    if (!Number.isFinite(c.strike) || c.openInterest <= 0) continue;
    const entry = byStrike.get(c.strike) || { callOI: 0, putOI: 0, callIV: 0, putIV: 0 };
    if (c.type === "call") {
      entry.callOI += c.openInterest;
      if (c.impliedVolatility > 0) entry.callIV = c.impliedVolatility;
    } else {
      entry.putOI += c.openInterest;
      if (c.impliedVolatility > 0) entry.putIV = c.impliedVolatility;
    }
    byStrike.set(c.strike, entry);
  }

  if (byStrike.size === 0) return null;

  const strikes: GammaStrike[] = [];
  for (const [strike, e] of byStrike.entries()) {
    const callGamma = blackScholesGamma(spotPrice, strike, T, e.callIV || 0.3);
    const putGamma = blackScholesGamma(spotPrice, strike, T, e.putIV || 0.3);

    // Standard GEX scaling: gamma * OI * contract size * spot^2 * 1% —
    // converts "delta change per $1 move" into "notional dollars of
    // delta exposure per 1% move in the underlying," the conventional unit
    // for these charts.
    const callGEX = callGamma * e.callOI * CONTRACT_MULTIPLIER * spotPrice * spotPrice * 0.01;
    const putGEX = putGamma * e.putOI * CONTRACT_MULTIPLIER * spotPrice * spotPrice * 0.01;

    strikes.push({ strike, callGEX, putGEX, netGEX: callGEX - putGEX });
  }

  strikes.sort((a, b) => a.strike - b.strike);

  let cumulative = 0;
  let gammaFlipStrike: number | null = null;
  let prevCumulative = 0;
  for (const s of strikes) {
    prevCumulative = cumulative;
    cumulative += s.netGEX;
    if (prevCumulative !== 0 && Math.sign(prevCumulative) !== Math.sign(cumulative)) {
      gammaFlipStrike = s.strike;
    }
  }

  const totalGEX = strikes.reduce((sum, s) => sum + s.netGEX, 0);

  return { spotPrice, expiry, strikes, gammaFlipStrike, totalGEX };
}
