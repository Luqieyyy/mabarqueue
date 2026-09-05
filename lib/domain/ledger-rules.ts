/**
 * Pure creator-balance arithmetic.
 *
 * Kept free of Firebase so the money maths can be tested directly. The
 * repository reads entries and hands them here; nothing computes a balance by
 * mutating a stored total.
 */

import type { CreatorBalance, LedgerEntryType } from './types';

export interface BalanceInput {
  type: LedgerEntryType;
  /** Signed, in sen: positive credits the creator, negative debits them. */
  amountSen: number;
}

/**
 * Derives a creator's balance by summing ledger entries.
 *
 *   available   = every entry summed (earnings − refunds − payouts)
 *   totalEarned = positive earnings only, before refunds or payouts
 *   paidOut     = magnitude of payout entries
 *
 * `available` is clamped at zero: a creator is never shown a negative
 * withdrawable balance, though the underlying entries still record the
 * shortfall so it stays reconcilable.
 */
export function deriveBalance(entries: readonly BalanceInput[]): CreatorBalance {
  let available = 0;
  let totalEarned = 0;
  let paidOut = 0;

  for (const entry of entries) {
    available += entry.amountSen;

    if (entry.type === 'earning' && entry.amountSen > 0) {
      totalEarned += entry.amountSen;
    }
    if (entry.type === 'payout') {
      paidOut += Math.abs(entry.amountSen);
    }
  }

  return {
    availableSen: Math.max(0, available),
    totalEarnedSen: totalEarned,
    paidOutSen: paidOut,
    entryCount: entries.length,
  };
}

/**
 * Builds the signed entry for a confirmed payment.
 *
 * The creator is credited their listed price in full — the platform fee was
 * charged to the viewer on top and never belonged to the creator, so it
 * doesn't appear here at all.
 */
export function earningEntry(creatorEntitlementSen: number): BalanceInput {
  return { type: 'earning', amountSen: creatorEntitlementSen };
}

/** Builds the reversing entry for a refunded payment. */
export function refundEntry(creatorEntitlementSen: number): BalanceInput {
  return { type: 'refund', amountSen: -Math.abs(creatorEntitlementSen) };
}

/** Builds the debit entry for money sent to the creator. */
export function payoutEntry(amountSen: number): BalanceInput {
  return { type: 'payout', amountSen: -Math.abs(amountSen) };
}
