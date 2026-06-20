// Money helpers. All money in the LiteAPI booking pipeline is held in MINOR
// UNITS (bigint grosze for PLN, cents for EUR/USD). Floats are forbidden in
// any monetary calculation — see master spec Section 16 #2.
//
// Reasoning: LiteAPI returns floats (e.g. 1234.56 EUR). Floats accumulate
// rounding errors across totals/taxes. Use bigint minor units internally and
// only format to display strings at the UI boundary.

const SCALE = BigInt(100); // 2 decimal places — fine for PLN/EUR/USD/GBP and most ISO 4217 currencies.
// Currencies with 0 or 3 decimals (JPY, KRW; BHD, KWD, JOD) are out of scope
// for our PL OTA. If we ever sell to a market with non-2-decimal currency,
// extend with a per-currency exponent map.

export function toMinor(amount: number): bigint {
  if (!Number.isFinite(amount)) {
    throw new TypeError(`toMinor: non-finite amount ${amount}`);
  }
  // Round half-away-from-zero to avoid the IEEE-754 round-half-to-even surprise.
  const sign = amount < 0 ? BigInt(-1) : BigInt(1);
  const abs = Math.abs(amount);
  const rounded = Math.round(abs * 100); // safe up to ~9 quadrillion grosze (>> any travel transaction)
  return sign * BigInt(rounded);
}

export function fromMinor(minor: bigint): number {
  // Used ONLY at the display boundary. Result is suitable for Intl.NumberFormat;
  // do NOT do further math on it.
  const negative = minor < BigInt(0);
  const abs = negative ? -minor : minor;
  const whole = abs / SCALE;
  const frac = abs % SCALE;
  const value = Number(whole) + Number(frac) / 100;
  return negative ? -value : value;
}

export function addMinor(a: bigint, b: bigint): bigint {
  return a + b;
}

export function subMinor(a: bigint, b: bigint): bigint {
  return a - b;
}

export function mulMinor(amount: bigint, factorPercent: number): bigint {
  // factorPercent is e.g. 18.5 (for an 18.5% surcharge). Convert via integer math
  // and round half-away-from-zero — matches toMinor()'s rounding contract.
  const numerator = BigInt(Math.round(factorPercent * 1000));
  const denominator = BigInt(100_000);
  const product = amount * numerator;
  const sign = product < BigInt(0) ? BigInt(-1) : BigInt(1);
  const abs = sign * product;
  const half = denominator / BigInt(2);
  const rounded = (abs + half) / denominator;
  return sign * rounded;
}

export function formatMinorAsCurrency(
  minor: bigint,
  currency: string,
  locale = "pl-PL",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(fromMinor(minor));
}

// FAZA 8 — JEDNA funkcja formatowania ceny dla całego flow hoteli (wcześniej
// każdy komponent miał swoją kopię). `amount` to już liczba (po fromMinor),
// pełne złote bez groszy, „zł" zawsze po liczbie (Intl pl-PL).
export function formatPLN(amount: number, currency = "PLN", locale = "pl-PL"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
