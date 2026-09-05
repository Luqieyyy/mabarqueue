import { describe, expect, it } from 'vitest';
import { deriveBalance, earningEntry, payoutEntry, refundEntry } from './ledger-rules';

describe('deriveBalance', () => {
  it('is zero for a creator with no entries', () => {
    expect(deriveBalance([])).toEqual({
      availableSen: 0,
      totalEarnedSen: 0,
      paidOutSen: 0,
      entryCount: 0,
    });
  });

  it('credits the creator their full listed price per payment', () => {
    // Two RM10.00 sales — the platform fee was charged to the viewer on top
    // and never enters the creator's balance.
    const balance = deriveBalance([earningEntry(1000), earningEntry(1000)]);
    expect(balance.availableSen).toBe(2000);
    expect(balance.totalEarnedSen).toBe(2000);
  });

  it('deducts refunds from available while preserving lifetime earnings', () => {
    const balance = deriveBalance([earningEntry(1000), earningEntry(1000), refundEntry(1000)]);
    expect(balance.availableSen).toBe(1000);
    // Total earned is a lifetime figure and is not rewritten by the refund.
    expect(balance.totalEarnedSen).toBe(2000);
  });

  it('deducts payouts from available and tracks them separately', () => {
    const balance = deriveBalance([earningEntry(5000), payoutEntry(3000)]);
    expect(balance.availableSen).toBe(2000);
    expect(balance.paidOutSen).toBe(3000);
    expect(balance.totalEarnedSen).toBe(5000);
  });

  it('never reports a negative withdrawable balance', () => {
    // A refund arriving after payout can overdraw; the creator is shown zero
    // rather than a negative number, but the entries still record it.
    const balance = deriveBalance([earningEntry(1000), payoutEntry(1000), refundEntry(1000)]);
    expect(balance.availableSen).toBe(0);
    expect(balance.entryCount).toBe(3);
  });

  it('handles a refund that arrives before any payout', () => {
    expect(deriveBalance([earningEntry(1000), refundEntry(1000)]).availableSen).toBe(0);
  });

  it('is order-independent — entries can arrive in any sequence', () => {
    const forward = deriveBalance([earningEntry(5000), refundEntry(1000), payoutEntry(2000)]);
    const shuffled = deriveBalance([payoutEntry(2000), earningEntry(5000), refundEntry(1000)]);
    expect(forward.availableSen).toBe(shuffled.availableSen);
    expect(forward.availableSen).toBe(2000);
  });

  it('keeps everything in integer sen', () => {
    const balance = deriveBalance([earningEntry(399), earningEntry(1050)]);
    expect(Number.isInteger(balance.availableSen)).toBe(true);
    expect(balance.availableSen).toBe(1449);
  });

  it('ignores manual adjustments in the lifetime-earned figure', () => {
    // An adjustment moves the balance but isn't sales revenue.
    const balance = deriveBalance([
      earningEntry(1000),
      { type: 'adjustment', amountSen: -200 },
    ]);
    expect(balance.availableSen).toBe(800);
    expect(balance.totalEarnedSen).toBe(1000);
  });
});

describe('entry builders', () => {
  it('signs entries so the balance is a plain sum', () => {
    expect(earningEntry(1000).amountSen).toBe(1000);
    expect(refundEntry(1000).amountSen).toBe(-1000);
    expect(payoutEntry(1000).amountSen).toBe(-1000);
  });

  it('normalises sign regardless of how the caller passes the amount', () => {
    // Guards against a double negative silently crediting the creator.
    expect(refundEntry(-1000).amountSen).toBe(-1000);
    expect(payoutEntry(-1000).amountSen).toBe(-1000);
  });
});
