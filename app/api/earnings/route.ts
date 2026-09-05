import { NextRequest, NextResponse } from 'next/server';
import { withStreamer } from '../../../lib/require-streamer';
import { summariseEarnings } from '../../../lib/admin/payments-repo';
import { getCreatorBalance } from '../../../lib/admin/ledger-repo';
import { formatSen, toSen } from '../../../lib/domain/money';
import { resolveFeeBps } from '../../../lib/domain/config';
import { formatBps } from '../../../lib/domain/money';

// Reads per-request auth headers, so it must never be statically prerendered.
export const dynamic = 'force-dynamic';

/**
 * GET /api/earnings
 *
 * Reporting summary for the dashboard: today, this month, and all time.
 *
 * Sales figures come from the creator's donation records; the withdrawable
 * balance comes from their ledger, which is the authority for what is
 * actually owed.
 *
 * Creators earn their full listed price — MabarQueue's fee is charged to the
 * viewer on top — so `earned` here is the entitlement, not a net-of-fee
 * figure.
 */
const emptyBucket = { totalSen: 0, platformFeeSen: 0, creatorEntitlementSen: 0, paymentCount: 0 };

export const GET = withStreamer(async (_req: NextRequest, { streamer }) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // A Firestore composite index can take a few minutes to finish building
  // right after deploy. Falling back to a zeroed bucket here means a
  // brand-new creator still sees their payments page instead of a blank
  // "Internal error" while the index catches up.
  const [today, month, allTime, balance] = await Promise.all([
    summariseEarnings(streamer.streamerId, startOfDay).catch(() => emptyBucket),
    summariseEarnings(streamer.streamerId, startOfMonth).catch(() => emptyBucket),
    summariseEarnings(streamer.streamerId, null).catch(() => emptyBucket),
    getCreatorBalance(streamer.streamerId).catch(() => ({
      availableSen: 0, totalEarnedSen: 0, paidOutSen: 0, entryCount: 0,
    })),
  ]);

  const decorate = (s: Awaited<ReturnType<typeof summariseEarnings>>) => ({
    ...s,
    // What the creator earned is their entitlement — the platform fee was
    // charged to the viewer on top and was never theirs to lose.
    earnedFormatted: formatSen(toSen(s.creatorEntitlementSen)),
    totalChargedFormatted: formatSen(toSen(s.totalSen)),
    platformFeeFormatted: formatSen(toSen(s.platformFeeSen)),
  });

  return NextResponse.json({
    success: true,
    feeRate: formatBps(resolveFeeBps(streamer.platformFeeBps)),
    today: decorate(today),
    month: decorate(month),
    allTime: decorate(allTime),
    balance: {
      ...balance,
      availableFormatted: formatSen(toSen(balance.availableSen)),
      totalEarnedFormatted: formatSen(toSen(balance.totalEarnedSen)),
      paidOutFormatted: formatSen(toSen(balance.paidOutSen)),
    },
    payouts: {
      // Withdrawals stay closed until CHIP confirms the marketplace/payout
      // model. The balance above is still accurate and accrues meanwhile.
      withdrawalsEnabled: false,
      pendingReason: 'chip_send_not_confirmed',
    },
  });
});
