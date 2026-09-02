/**
 * Integer-only money primitives for MabarQueue.
 *
 * All monetary values in the system are stored and computed as **sen**
 * (1 MYR = 100 sen) using JavaScript integers. Floating-point ringgit values
 * never reach Firestore, Stripe, or a fee calculation.
 *
 * Platform fees are expressed in **basis points** (bps) rather than percent so
 * that fractional tiers stay integral: 5% = 500 bps, 2.5% = 250 bps.
 */

// ─── Branded types ────────────────────────────────────────────────────────────

/** An integer amount in sen. 1 MYR = 100 sen. */
export type Sen = number & { readonly __brand: 'Sen' };

/** An integer fee rate in basis points. 10000 bps = 100%. */
export type Bps = number & { readonly __brand: 'Bps' };

export const CURRENCY = 'MYR' as const;
export const SEN_PER_RINGGIT = 100;
export const BPS_DIVISOR = 10_000;

// ─── Constructors ─────────────────────────────────────────────────────────────

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** Asserts that `value` is a non-negative safe integer number of sen. */
export function toSen(value: number): Sen {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`Sen must be an integer, received ${value}`);
  }
  if (value < 0) {
    throw new MoneyError(`Sen must not be negative, received ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`Sen exceeds safe integer range: ${value}`);
  }
  return value as Sen;
}

/** Asserts that `value` is a basis-point rate within 0–10000 inclusive. */
export function toBps(value: number): Bps {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`Bps must be an integer, received ${value}`);
  }
  if (value < 0 || value > BPS_DIVISOR) {
    throw new MoneyError(`Bps must be between 0 and ${BPS_DIVISOR}, received ${value}`);
  }
  return value as Bps;
}

// ─── Conversion ───────────────────────────────────────────────────────────────

/**
 * Converts a ringgit amount to sen, rounding to the nearest sen.
 *
 * Intended for **ingesting** external values (legacy Firestore records,
 * Sociabuzz payloads) — not for internal arithmetic. `20.1` in float is
 * `20.099999...`, so a plain `* 100` truncates to 2009; rounding fixes that.
 *
 *   ringgitToSen(20)    → 2000
 *   ringgitToSen(20.10) → 2010
 *   ringgitToSen(4.5)   → 450
 */
export function ringgitToSen(ringgit: number): Sen {
  if (!Number.isFinite(ringgit)) {
    throw new MoneyError(`Cannot convert non-finite ringgit value: ${ringgit}`);
  }
  if (ringgit < 0) {
    throw new MoneyError(`Cannot convert negative ringgit value: ${ringgit}`);
  }
  return toSen(Math.round(ringgit * SEN_PER_RINGGIT));
}

/** Converts sen to a ringgit number. Display only — never feed this back into arithmetic. */
export function senToRinggit(sen: Sen): number {
  return sen / SEN_PER_RINGGIT;
}

/**
 * Formats sen for display.
 *
 *   formatSen(2000)  → "RM20.00"
 *   formatSen(450)   → "RM4.50"
 *   formatSen(0)     → "RM0.00"
 */
export function formatSen(sen: Sen, withSymbol = true): string {
  const whole = Math.floor(sen / SEN_PER_RINGGIT);
  const frac = sen % SEN_PER_RINGGIT;
  const body = `${whole}.${String(frac).padStart(2, '0')}`;
  return withSymbol ? `RM${body}` : body;
}

// ─── Arithmetic ───────────────────────────────────────────────────────────────

export function addSen(a: Sen, b: Sen): Sen {
  return toSen(a + b);
}

/** Subtracts `b` from `a`, clamping at zero so a balance can never go negative. */
export function subSen(a: Sen, b: Sen): Sen {
  return toSen(Math.max(0, a - b));
}

export function sumSen(values: readonly Sen[]): Sen {
  return values.reduce<Sen>((acc, v) => addSen(acc, v), toSen(0));
}

// ─── Platform fee ─────────────────────────────────────────────────────────────

export interface FeeBreakdown {
  /** What the viewer paid. */
  grossSen: Sen;
  /** MabarQueue's cut. */
  platformFeeSen: Sen;
  /**
   * Gross minus the platform fee.
   *
   * NOT the streamer's final payout — the payment processor's own fee is
   * deducted separately by Stripe and is not known at this point.
   */
  netBeforeProcessingSen: Sen;
  /** The rate this breakdown was computed with, retained for auditability. */
  feeBps: Bps;
}

/**
 * Calculates the platform fee on a gross amount.
 *
 * Rounds **down** so the fee can never exceed the gross amount, and so
 * rounding always favours the streamer.
 *
 *   calcPlatformFee(2000, 500) → fee 100  (RM20 @ 5%  → RM1.00)
 *   calcPlatformFee(2000, 250) → fee  50  (RM20 @ 2.5% → RM0.50)
 *   calcPlatformFee(399,  500) → fee  19  (RM3.99 @ 5% → RM0.19, floored)
 *   calcPlatformFee(2000, 0)   → fee   0  (promotional streamer)
 */
export function calcPlatformFee(grossSen: Sen, feeBps: Bps): FeeBreakdown {
  const platformFeeSen = toSen(Math.floor((grossSen * feeBps) / BPS_DIVISOR));
  return {
    grossSen,
    platformFeeSen,
    netBeforeProcessingSen: subSen(grossSen, platformFeeSen),
    feeBps,
  };
}

/** Formats a bps rate for display: 500 → "5%", 250 → "2.5%". */
export function formatBps(bps: Bps): string {
  return `${bps / 100}%`;
}
