import { NextRequest, NextResponse } from 'next/server';
import { withStreamer } from '../../../../../lib/require-streamer';
import { fetchCapabilityFlags } from '../../../../../lib/stripe/connect';
import { saveStripeFlags } from '../../../../../lib/admin/payments-repo';

// Reads per-request auth headers, so it must never be statically prerendered.
export const dynamic = 'force-dynamic';

/**
 * GET /api/stripe/connect/status
 *
 * Re-reads the connected account's capabilities from Stripe and persists the
 * flags. Stripe is authoritative here; the stored flags are a cache so public
 * pages don't have to call Stripe on every render.
 */
export const GET = withStreamer(async (_req: NextRequest, { streamer }) => {
  if (!streamer.stripeAccountId) {
    return NextResponse.json({
      success: true,
      connected: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
    });
  }

  const flags = await fetchCapabilityFlags(streamer.stripeAccountId);
  await saveStripeFlags(streamer.streamerId, flags);

  return NextResponse.json({
    success: true,
    connected: true,
    chargesEnabled: flags.stripeChargesEnabled,
    payoutsEnabled: flags.stripePayoutsEnabled,
    detailsSubmitted: flags.stripeDetailsSubmitted,
  });
});
