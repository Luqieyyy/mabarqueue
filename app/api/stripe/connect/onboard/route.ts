import { NextRequest, NextResponse } from 'next/server';
import { withStreamer } from '../../../../../lib/require-streamer';
import { OnboardingError, startOnboarding } from '../../../../../lib/admin/stripe-onboarding';

// Reads per-request auth headers, so it must never be statically prerendered.
export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/connect/onboard
 *
 * Starts (or resumes) Stripe-hosted Connect onboarding for the caller's own
 * workspace and returns the URL to redirect them to.
 *
 * Authorization comes from `withStreamer`, which resolves the workspace from
 * the verified ID token — the request body is never consulted for identity,
 * so one streamer cannot start onboarding for another.
 *
 * Idempotent: an existing connected account is reused rather than duplicated,
 * so repeated clicks are safe.
 */
export const POST = withStreamer(async (req: NextRequest, { user, streamer }) => {
  try {
    const { url } = await startOnboarding(streamer, user.email, req.nextUrl.origin);
    return NextResponse.json({ success: true, url });
  } catch (err) {
    if (err instanceof OnboardingError) {
      // Safe message only — Stripe's raw error is logged server-side.
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    throw err;
  }
});
