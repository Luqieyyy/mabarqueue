import { NextRequest, NextResponse } from 'next/server';
import { withStreamer } from '../../../lib/require-streamer';
import { summariseEarnings } from '../../../lib/admin/payments-repo';
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
 * These figures come from MabarQueue's own donation mirror. Stripe remains
 * authoritative for settled amounts, processing fees and payout state, which
 * is why net figures here are explicitly labelled as *before* processing
 * fees rather than presented as the streamer's final take.
 */
export const GET = withStreamer(async (_req: NextRequest, { streamer }) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [today, month, allTime] = await Promise.all([
    summariseEarnings(streamer.streamerId, startOfDay),
    summariseEarnings(streamer.streamerId, startOfMonth),
    summariseEarnings(streamer.streamerId, null),
  ]);

  const decorate = (s: Awaited<ReturnType<typeof summariseEarnings>>) => ({
    ...s,
    grossFormatted: formatSen(toSen(s.grossSen)),
    platformFeeFormatted: formatSen(toSen(s.platformFeeSen)),
    netBeforeProcessingFormatted: formatSen(toSen(s.netBeforeProcessingSen)),
  });

  return NextResponse.json({
    success: true,
    feeRate: formatBps(resolveFeeBps(streamer.platformFeeBps)),
    today: decorate(today),
    month: decorate(month),
    allTime: decorate(allTime),
    payouts: {
      // Payout state deliberately isn't mirrored — pointing at Stripe avoids
      // presenting Firestore as a financial ledger.
      managedBy: 'stripe',
      dashboardAvailable: Boolean(streamer.stripeAccountId),
    },
  });
});
