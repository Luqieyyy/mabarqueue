import { NextRequest, NextResponse } from 'next/server';
import { withStreamer } from '../../../../../lib/require-streamer';
import { OnboardingError, syncAccountStatus } from '../../../../../lib/admin/stripe-onboarding';

// Reads per-request auth headers, so it must never be statically prerendered.
export const dynamic = 'force-dynamic';

/**
 * GET /api/stripe/connect/status
 *
 * Re-reads the caller's connected account from Stripe and persists the
 * result, returning the current state.
 *
 * Stripe is the source of truth: nothing here derives from query parameters
 * or any other browser-supplied value. The stored flags are a cache so other
 * reads don't have to call Stripe.
 */
export const GET = withStreamer(async (_req: NextRequest, { streamer }) => {
  try {
    const result = await syncAccountStatus(streamer);
    return NextResponse.json({
      success: true,
      connected: Boolean(streamer.stripeAccountId),
      ...result,
    });
  } catch (err) {
    if (err instanceof OnboardingError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    throw err;
  }
});
