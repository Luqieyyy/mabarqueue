import { describe, expect, it } from 'vitest';
import {
  BPS_DIVISOR,
  MoneyError,
  addSen,
  calcCheckoutAmounts,
  formatBps,
  formatSen,
  ringgitToSen,
  senToRinggit,
  subSen,
  sumSen,
  toBps,
  toSen,
} from './money';

describe('toSen', () => {
  it('accepts non-negative integers', () => {
    expect(toSen(0)).toBe(0);
    expect(toSen(2000)).toBe(2000);
  });

  it('rejects floats, negatives and unsafe integers', () => {
    expect(() => toSen(19.99)).toThrow(MoneyError);
    expect(() => toSen(-1)).toThrow(MoneyError);
    expect(() => toSen(Number.MAX_SAFE_INTEGER + 2)).toThrow(MoneyError);
  });
});

describe('toBps', () => {
  it('accepts 0 through 10000', () => {
    expect(toBps(0)).toBe(0);
    expect(toBps(500)).toBe(500);
    expect(toBps(BPS_DIVISOR)).toBe(BPS_DIVISOR);
  });

  it('rejects out-of-range and fractional rates', () => {
    expect(() => toBps(-1)).toThrow(MoneyError);
    expect(() => toBps(10_001)).toThrow(MoneyError);
    expect(() => toBps(2.5)).toThrow(MoneyError);
  });
});

describe('ringgitToSen', () => {
  it('converts whole and fractional ringgit', () => {
    expect(ringgitToSen(20)).toBe(2000);
    expect(ringgitToSen(4)).toBe(400);
    expect(ringgitToSen(4.5)).toBe(450);
  });

  it('rounds away float representation error rather than truncating', () => {
    // 20.10 * 100 is 2009.9999... in IEEE 754 — a bare `* 100` would give 2009.
    expect(ringgitToSen(20.1)).toBe(2010);
    expect(ringgitToSen(0.29)).toBe(29);
    expect(ringgitToSen(1.15)).toBe(115);
  });

  it('cannot recover precision already lost before the call', () => {
    // 1.005 is stored as 1.00499999999999989..., so it rounds to 100, not 101.
    // Documented rather than worked around: this is the irreducible reason
    // ringgit floats are for *ingesting* legacy/external values only. Prices
    // that originate in MabarQueue are authored directly in sen and never
    // pass through here.
    expect(ringgitToSen(1.005)).toBe(100);
  });

  it('rejects negative and non-finite input', () => {
    expect(() => ringgitToSen(-5)).toThrow(MoneyError);
    expect(() => ringgitToSen(NaN)).toThrow(MoneyError);
    expect(() => ringgitToSen(Infinity)).toThrow(MoneyError);
  });
});

describe('formatSen', () => {
  it('always renders two decimal places', () => {
    expect(formatSen(toSen(2000))).toBe('RM20.00');
    expect(formatSen(toSen(450))).toBe('RM4.50');
    expect(formatSen(toSen(5))).toBe('RM0.05');
    expect(formatSen(toSen(0))).toBe('RM0.00');
  });

  it('can omit the currency symbol', () => {
    expect(formatSen(toSen(2000), false)).toBe('20.00');
  });
});

describe('senToRinggit', () => {
  it('converts back for display', () => {
    expect(senToRinggit(toSen(2000))).toBe(20);
    expect(senToRinggit(toSen(450))).toBe(4.5);
  });
});

describe('sen arithmetic', () => {
  it('adds and sums', () => {
    expect(addSen(toSen(1000), toSen(500))).toBe(1500);
    expect(sumSen([toSen(100), toSen(250), toSen(50)])).toBe(400);
    expect(sumSen([])).toBe(0);
  });

  it('clamps subtraction at zero so a balance never goes negative', () => {
    expect(subSen(toSen(1000), toSen(400))).toBe(600);
    expect(subSen(toSen(400), toSen(1000))).toBe(0);
  });
});

describe('calcCheckoutAmounts', () => {
  it('leaves the creator the FULL listed price — the core business rule', () => {
    // A creator listing RM10.00 is entitled to RM10.00, not RM9.50.
    const a = calcCheckoutAmounts(toSen(1000), toBps(500));
    expect(a.creatorEntitlementSen).toBe(1000);
    expect(a.baseSen).toBe(1000);
  });

  it('charges the platform fee ON TOP, to the viewer', () => {
    const a = calcCheckoutAmounts(toSen(1000), toBps(500));
    expect(a.platformFeeSen).toBe(50);
    expect(a.totalSen).toBe(1050); // viewer pays more, creator still gets 1000
  });

  it('never deducts the fee from the creator (regression guard)', () => {
    // The old model produced creator=950 here. If this ever passes with 950
    // again, the business model has silently inverted back.
    for (const bps of [0, 250, 300, 500, 1000]) {
      const a = calcCheckoutAmounts(toSen(1000), toBps(bps));
      expect(a.creatorEntitlementSen).toBe(1000);
      expect(a.totalSen).toBeGreaterThanOrEqual(a.creatorEntitlementSen);
    }
  });

  it('supports configurable per-creator rates', () => {
    expect(calcCheckoutAmounts(toSen(1000), toBps(500)).platformFeeSen).toBe(50); // standard 5%
    expect(calcCheckoutAmounts(toSen(1000), toBps(300)).platformFeeSen).toBe(30); // partner 3%
    expect(calcCheckoutAmounts(toSen(1000), toBps(0)).platformFeeSen).toBe(0);    // promotional
  });

  it('charges the viewer exactly the base on a 0% creator', () => {
    const a = calcCheckoutAmounts(toSen(1000), toBps(0));
    expect(a.totalSen).toBe(1000);
    expect(a.creatorEntitlementSen).toBe(1000);
    expect(a.platformNetSen).toBe(0);
  });

  it('rounds the fee down so rounding never inflates the viewer total', () => {
    // RM3.99 @ 5% = 19.95 sen → 19
    const a = calcCheckoutAmounts(toSen(399), toBps(500));
    expect(a.platformFeeSen).toBe(19);
    expect(a.totalSen).toBe(418);
  });

  it('always balances: total = base + platform fee', () => {
    for (const base of [1, 100, 399, 1000, 2000, 12_345]) {
      for (const bps of [0, 250, 500, 1000]) {
        const a = calcCheckoutAmounts(toSen(base), toBps(bps));
        expect(a.baseSen + a.platformFeeSen).toBe(a.totalSen);
        expect(a.creatorEntitlementSen).toBe(a.baseSen);
        expect(Number.isInteger(a.totalSen)).toBe(true);
      }
    }
  });

  it('absorbs the processing fee out of the platform fee, not the creator', () => {
    // MabarQueue eats the provider cost while CHIP's schedule is unconfirmed.
    const a = calcCheckoutAmounts(toSen(1000), toBps(500), toSen(30));
    expect(a.creatorEntitlementSen).toBe(1000); // untouched
    expect(a.totalSen).toBe(1050);              // viewer unaffected
    expect(a.platformNetSen).toBe(20);          // 50 fee − 30 processing
  });

  it('floors platform revenue at zero rather than charging the creator', () => {
    const a = calcCheckoutAmounts(toSen(1000), toBps(500), toSen(999));
    expect(a.platformNetSen).toBe(0);
    expect(a.creatorEntitlementSen).toBe(1000);
  });

  it('defaults the processing fee to zero — no invented CHIP rate', () => {
    expect(calcCheckoutAmounts(toSen(1000), toBps(500)).processingFeeSen).toBe(0);
  });

  it('retains the rate used, so historical records stay auditable', () => {
    expect(calcCheckoutAmounts(toSen(1000), toBps(300)).feeBps).toBe(300);
  });
});

describe('formatBps', () => {
  it('renders whole and fractional percentages', () => {
    expect(formatBps(toBps(500))).toBe('5%');
    expect(formatBps(toBps(250))).toBe('2.5%');
    expect(formatBps(toBps(0))).toBe('0%');
  });
});
