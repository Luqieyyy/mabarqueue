/**
 * Integer-only money primitives for MabarQueue.
 *
 * All monetary values in the system are stored and computed as **sen**
 * (1 MYR = 100 sen) using JavaScript integers. Floating-point ringgit values
 * never reach Firestore, the payment provider, or a fee calculation.
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

// ─── Checkout amounts ─────────────────────────────────────────────────────────

/**
 * The five monetary components of a viewer payment.
 *
 * MabarQueue charges its fee **on top of** the creator's listed price rather
 * than deducting it: a creator who lists RM10.00 is entitled to RM10.00, and
 * the viewer pays RM10.00 + fees. Deducting the fee instead — leaving the
 * creator RM9.50 on a RM10.00 listing — is explicitly not the business model.
 */
export interface CheckoutAmounts {
  /** The creator's listed price. The basis for everything else. */
  baseSen: Sen;
  /** MabarQueue's service fee, added on top and paid by the viewer. */
  platformFeeSen: Sen;
  /**
   * The payment provider's own cost.
   *
   * Zero while CHIP's actual fee schedule is unconfirmed — MabarQueue absorbs
   * processing costs out of its own platform fee for now, so the viewer is
   * never charged a number we invented. See `platformNetSen`.
   */
  processingFeeSen: Sen;
  /** What the viewer is actually charged: base + platform fee. */
  totalSen: Sen;
  /** What the creator is owed. Always the full listed price. */
  creatorEntitlementSen: Sen;
  /**
   * MabarQueue's revenue after absorbing the processing cost.
   *
   * Can reach zero but never goes negative; if processing ever exceeds the
   * platform fee, the platform simply earns nothing on that payment rather
   * than clawing anything back from the creator.
   */
  platformNetSen: Sen;
  /** The rate this breakdown was computed with, retained for auditability. */
  feeBps: Bps;
}

/**
 * Computes every amount for a checkout from the creator's listed price.
 *
 * The platform fee rounds **down**, so rounding never inflates what the
 * viewer is charged.
 *
 *   calcCheckoutAmounts(1000, 500) → base 1000, fee  50, total 1050, creator 1000
 *   calcCheckoutAmounts(1000, 300) → base 1000, fee  30, total 1030, creator 1000
 *   calcCheckoutAmounts(1000,   0) → base 1000, fee   0, total 1000, creator 1000
 *   calcCheckoutAmounts(2000, 250) → base 2000, fee  50, total 2050, creator 2000
 */
export function calcCheckoutAmounts(
  baseSen: Sen,
  feeBps: Bps,
  processingFeeSen: Sen = toSen(0),
): CheckoutAmounts {
  const platformFeeSen = toSen(Math.floor((baseSen * feeBps) / BPS_DIVISOR));

  return {
    baseSen,
    platformFeeSen,
    processingFeeSen,
    totalSen: addSen(baseSen, platformFeeSen),
    // The whole point of the model: entitlement tracks the listing, untouched
    // by any fee.
    creatorEntitlementSen: baseSen,
    platformNetSen: subSen(platformFeeSen, processingFeeSen),
    feeBps,
  };
}

/** Formats a bps rate for display: 500 → "5%", 250 → "2.5%". */
export function formatBps(bps: Bps): string {
  return `${bps / 100}%`;
}
