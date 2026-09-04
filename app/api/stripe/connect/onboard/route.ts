import { NextRequest, NextResponse } from 'next/server';
import { withStreamer } from '../../../../../lib/require-streamer';
import { createConnectedAccount, createOnboardingLink } from '../../../../../lib/stripe/connect';
import { saveStripeFlags } from '../../../../../lib/admin/payments-repo';
import { streamerDoc } from '../../../../../lib/admin/paths';

/**
 * POST /api/stripe/connect/onboard
 *
 * Starts (or resumes) Stripe-hosted Connect onboarding for the caller's
 * workspace and returns the URL to redirect them to.
 *
 * The connected account is created once and its ID persisted; subsequent
 * calls reuse it and just mint a fresh Account Link, since links are
 * single-use and short-lived.
 */
export const POST = withStreamer(async (req: NextRequest, { user, streamer }) => {
  const origin = req.nextUrl.origin;

  let stripeAccountId = streamer.stripeAccountId;

  if (!stripeAccountId) {
    stripeAccountId = await createConnectedAccount({
      email: user.email,
      displayName: streamer.displayName,
      streamerId: streamer.streamerId,
    });

    await streamerDoc(streamer.streamerId).set({ stripeAccountId }, { merge: true });
  }

  const url = await createOnboardingLink({
    stripeAccountId,
    // Sent back through the status endpoint so capability flags refresh as
    // soon as they return, rather than waiting for the account.updated webhook.
    returnUrl: `${origin}/dashboard/payments?onboarding=complete`,
    refreshUrl: `${origin}/dashboard/payments?onboarding=refresh`,
  });

  await saveStripeFlags(streamer.streamerId, {
    stripeAccountId,
    stripeChargesEnabled: streamer.stripeChargesEnabled,
    stripePayoutsEnabled: streamer.stripePayoutsEnabled,
    stripeDetailsSubmitted: streamer.stripeDetailsSubmitted,
  });

  return NextResponse.json({ success: true, url, stripeAccountId });
});
