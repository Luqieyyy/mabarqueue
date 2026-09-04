import { NextRequest, NextResponse } from 'next/server';
import { withStreamer } from '../../../../../lib/require-streamer';
import { createDashboardLink } from '../../../../../lib/stripe/connect';

/**
 * POST /api/stripe/connect/dashboard
 *
 * Returns a one-time link into the streamer's own Stripe dashboard, where
 * they manage bank details, view payouts and handle everything MabarQueue
 * deliberately doesn't store.
 */
export const POST = withStreamer(async (_req: NextRequest, { streamer }) => {
  if (!streamer.stripeAccountId) {
    return NextResponse.json(
      { success: false, error: 'Connect a Stripe account first.' },
      { status: 400 },
    );
  }

  const url = await createDashboardLink(streamer.stripeAccountId);
  if (!url) {
    return NextResponse.json(
      { success: false, error: 'Finish Stripe onboarding before opening the dashboard.' },
      { status: 409 },
    );
  }

  return NextResponse.json({ success: true, url });
});
