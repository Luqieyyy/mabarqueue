import { describe, expect, it } from 'vitest';
import { DEFAULT_PLATFORM_FEE_BPS, FEE_TIERS, resolveFeeBps } from './config';
import { calcPlatformFee, toBps, toSen } from './money';

describe('resolveFeeBps', () => {
  it('falls back to the platform default when unset', () => {
    expect(resolveFeeBps(null)).toBe(DEFAULT_PLATFORM_FEE_BPS);
    expect(resolveFeeBps(undefined)).toBe(DEFAULT_PLATFORM_FEE_BPS);
  });

  it('honours a stored per-streamer rate', () => {
    expect(resolveFeeBps(300)).toBe(300);
    expect(resolveFeeBps(0)).toBe(0);
    expect(resolveFeeBps(10_000)).toBe(10_000);
  });

  it('falls back rather than throwing on malformed stored values', () => {
    // A bad value must not take down a live payment, so this degrades to the
    // default instead of propagating an error mid-checkout.
    expect(resolveFeeBps(-5)).toBe(DEFAULT_PLATFORM_FEE_BPS);
    expect(resolveFeeBps(10_001)).toBe(DEFAULT_PLATFORM_FEE_BPS);
    expect(resolveFeeBps(2.5)).toBe(DEFAULT_PLATFORM_FEE_BPS);
    expect(resolveFeeBps(NaN)).toBe(DEFAULT_PLATFORM_FEE_BPS);
  });
});

describe('fee tiers', () => {
  it('expresses every tier as whole basis points', () => {
    for (const bps of Object.values(FEE_TIERS)) {
      expect(Number.isInteger(bps)).toBe(true);
    }
  });

  it('computes the documented amounts on an RM20 purchase', () => {
    const gross = toSen(2000);
    expect(calcPlatformFee(gross, FEE_TIERS.standard).platformFeeSen).toBe(100); // 5%
    expect(calcPlatformFee(gross, FEE_TIERS.partner).platformFeeSen).toBe(60);   // 3%
    expect(calcPlatformFee(gross, FEE_TIERS.special).platformFeeSen).toBe(50);   // 2.5%
    expect(calcPlatformFee(gross, FEE_TIERS.promotional).platformFeeSen).toBe(0);
  });

  it('keeps the standard tier at 5%', () => {
    expect(FEE_TIERS.standard).toBe(DEFAULT_PLATFORM_FEE_BPS);
    expect(DEFAULT_PLATFORM_FEE_BPS).toBe(500);
  });
});

describe('application fee constraint', () => {
  it('leaves at least one sen on the charge for Stripe', () => {
    // Stripe requires application_fee_amount to be strictly less than the
    // charge; /api/payments/create clamps to gross-1, mirrored here.
    for (const gross of [100, 399, 1000, 2000]) {
      const fee = calcPlatformFee(toSen(gross), FEE_TIERS.standard).platformFeeSen;
      const clamped = Math.min(fee, Math.max(0, gross - 1));
      expect(clamped).toBeLessThan(gross);
    }
  });

  it('clamps a pathological 100% fee below the charge amount', () => {
    const gross = 2000;
    const fee = calcPlatformFee(toSen(gross), toBps(10_000)).platformFeeSen;
    expect(fee).toBe(2000); // the raw fee would consume the whole charge
    expect(Math.min(fee, gross - 1)).toBe(1999); // clamped, so Stripe accepts it
  });
});
