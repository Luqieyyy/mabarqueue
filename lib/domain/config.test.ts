import { describe, expect, it } from 'vitest';
import { DEFAULT_PLATFORM_FEE_BPS, FEE_TIERS, resolveFeeBps } from './config';
import { calcCheckoutAmounts, toBps, toSen } from './money';

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
    expect(calcCheckoutAmounts(gross, FEE_TIERS.standard).platformFeeSen).toBe(100); // 5%
    expect(calcCheckoutAmounts(gross, FEE_TIERS.partner).platformFeeSen).toBe(60);   // 3%
    expect(calcCheckoutAmounts(gross, FEE_TIERS.special).platformFeeSen).toBe(50);   // 2.5%
    expect(calcCheckoutAmounts(gross, FEE_TIERS.promotional).platformFeeSen).toBe(0);
  });

  it('keeps the standard tier at 5%', () => {
    expect(FEE_TIERS.standard).toBe(DEFAULT_PLATFORM_FEE_BPS);
    expect(DEFAULT_PLATFORM_FEE_BPS).toBe(500);
  });
});

describe('fee tiers as CHIP line items', () => {
  it('adds the fee on top so the creator always keeps their listing', () => {
    // Under CHIP the fee is a separate line item on the purchase, not a
    // deduction — there is no cap relative to the base price to respect.
    for (const base of [100, 399, 1000, 2000]) {
      const a = calcCheckoutAmounts(toSen(base), FEE_TIERS.standard);
      expect(a.creatorEntitlementSen).toBe(base);
      expect(a.totalSen).toBe(base + a.platformFeeSen);
    }
  });

  it('handles a 100% rate without ever reducing the entitlement', () => {
    const a = calcCheckoutAmounts(toSen(2000), toBps(10_000));
    expect(a.platformFeeSen).toBe(2000);
    expect(a.creatorEntitlementSen).toBe(2000); // still the full listing
    expect(a.totalSen).toBe(4000);              // viewer pays double
  });
});
