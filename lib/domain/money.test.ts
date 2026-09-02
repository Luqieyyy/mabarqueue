import { describe, expect, it } from 'vitest';
import {
  BPS_DIVISOR,
  MoneyError,
  addSen,
  calcPlatformFee,
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

describe('calcPlatformFee', () => {
  it('computes the standard 5% cut', () => {
    const r = calcPlatformFee(toSen(2000), toBps(500));
    expect(r.platformFeeSen).toBe(100);
    expect(r.netBeforeProcessingSen).toBe(1900);
    expect(r.grossSen).toBe(2000);
  });

  it('handles fractional-percent tiers with integer arithmetic', () => {
    // 2.5% — the case a `platformFeePercent: number` field could not express cleanly.
    expect(calcPlatformFee(toSen(2000), toBps(250)).platformFeeSen).toBe(50);
    expect(calcPlatformFee(toSen(1000), toBps(300)).platformFeeSen).toBe(30);
  });

  it('rounds down so the fee never exceeds gross and rounding favours the streamer', () => {
    // RM3.99 @ 5% = 19.95 sen → 19
    const r = calcPlatformFee(toSen(399), toBps(500));
    expect(r.platformFeeSen).toBe(19);
    expect(r.platformFeeSen + r.netBeforeProcessingSen).toBe(399);
  });

  it('supports a 0% promotional streamer', () => {
    const r = calcPlatformFee(toSen(2000), toBps(0));
    expect(r.platformFeeSen).toBe(0);
    expect(r.netBeforeProcessingSen).toBe(2000);
  });

  it('never loses or invents sen', () => {
    for (const gross of [1, 99, 100, 399, 1000, 2000, 3000, 12_345]) {
      for (const bps of [0, 250, 300, 500, 1000]) {
        const r = calcPlatformFee(toSen(gross), toBps(bps));
        expect(r.platformFeeSen + r.netBeforeProcessingSen).toBe(gross);
        expect(r.platformFeeSen).toBeLessThanOrEqual(gross);
        expect(Number.isInteger(r.platformFeeSen)).toBe(true);
      }
    }
  });

  it('retains the rate used, so historical records stay auditable', () => {
    expect(calcPlatformFee(toSen(2000), toBps(300)).feeBps).toBe(300);
  });
});

describe('formatBps', () => {
  it('renders whole and fractional percentages', () => {
    expect(formatBps(toBps(500))).toBe('5%');
    expect(formatBps(toBps(250))).toBe('2.5%');
    expect(formatBps(toBps(0))).toBe('0%');
  });
});
