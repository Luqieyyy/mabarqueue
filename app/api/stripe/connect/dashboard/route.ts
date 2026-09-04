import { NextRequest, NextResponse } from 'next/server';
import { withStreamer } from '../../../../../lib/require-streamer';
import { dashboardUrlFor } from '../../../../../lib/stripe/connect';
import { logEvent } from '../../../../../lib/observability';

// Reads per-request auth headers, so it must never be statically prerendered.
export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/connect/dashboard
 *
 * Returns where the streamer manages their own Stripe account.
 *
 * Our connected accounts are created with
 * `controller.stripe_dashboard.type = 'full'`, so the streamer holds a real
 * Stripe account and signs in at dashboard.stripe.com with their own
 * credentials. There is no per-account link to generate — an earlier version
 * of this route called `accounts.createLoginLink`, which per Stripe's API
 * reference only applies to **Express** accounts and therefore always failed
 * here.
 *
 * The route is kept (rather than hardcoding the URL in the UI) so access
 * stays behind workspace authorization and remains auditable.
 */
export const POST = withStreamer(async (_req: NextRequest, { streamer }) => {
  if (!streamer.stripeAccountId) {
    return NextResponse.json(
      { success: false, error: 'Connect a Stripe account first.' },
      { status: 400 },
    );
  }

  logEvent('stripe_dashboard_access_requested', {
    streamerId: streamer.streamerId,
    stripeAccountId: streamer.stripeAccountId,
    status: streamer.stripeAccountStatus,
  });

  return NextResponse.json({ success: true, url: dashboardUrlFor() });
});
