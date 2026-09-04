/**
 * Stripe Connect onboarding orchestration — server-only.
 *
 * Sits between the API routes and the Stripe integration layer so the routes
 * stay thin and the same logic backs both the "Connect" button and the
 * refresh redirect. Stripe SDK calls live in `lib/stripe/*`; this module
 * coordinates them with Firestore.
 */

import 'server-only';
import { streamerDoc } from './paths';
import { saveStripeFlags } from './payments-repo';
import {
  createConnectedAccount,
  createOnboardingLink,
  ensureFpxCapability,
  fetchCapabilityFlags,
} from '../stripe/connect';
import { logEvent, logFailure } from '../observability';
import type { Streamer } from '../domain/types';

export class OnboardingError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'OnboardingError';
    this.status = status;
  }
}

/**
 * Returns the streamer's connected account ID, creating one only if absent.
 *
 * Idempotent from the application's perspective: a second call — including
 * from a double-clicked button — reuses the stored ID rather than creating
 * another Stripe account. The write happens immediately after creation so a
 * crash later in the request can't orphan the account.
 */
export async function ensureConnectedAccount(
  streamer: Streamer,
  ownerEmail: string | null,
): Promise<string> {
  if (streamer.stripeAccountId) {
    logEvent('stripe_connected_account_reused', {
      streamerId: streamer.streamerId,
      stripeAccountId: streamer.stripeAccountId,
    });
    return streamer.stripeAccountId;
  }

  let accountId: string;
  try {
    accountId = await createConnectedAccount({
      email: ownerEmail,
      displayName: streamer.displayName,
      streamerId: streamer.streamerId,
    });
  } catch (err) {
    logFailure('stripe_onboarding_failed', err, {
      streamerId: streamer.streamerId,
      step: 'create_account',
    });
    throw new OnboardingError('Could not create your Stripe account. Please try again.');
  }

  try {
    await streamerDoc(streamer.streamerId).set(
      { stripeAccountId: accountId, stripeAccountStatus: 'onboarding' },
      { merge: true },
    );
  } catch (err) {
    // The Stripe account exists but we failed to record it. Log the ID
    // explicitly so it can be reconciled by hand rather than silently
    // orphaned and duplicated on the next attempt.
    logFailure('stripe_onboarding_failed', err, {
      streamerId: streamer.streamerId,
      stripeAccountId: accountId,
      step: 'persist_account_id',
    });
    throw new OnboardingError('Your Stripe account was created but could not be saved.');
  }

  logEvent('stripe_connected_account_created', {
    streamerId: streamer.streamerId,
    stripeAccountId: accountId,
  });
  return accountId;
}

/** Builds the return/refresh URLs for hosted onboarding. */
export function onboardingUrls(origin: string): { returnUrl: string; refreshUrl: string } {
  return {
    returnUrl: `${origin}/dashboard/payments/return`,
    // Stripe hits this when a link expires or is revisited; the route mints a
    // fresh link and redirects, so an expired link is never a dead end.
    refreshUrl: `${origin}/dashboard/payments/refresh`,
  };
}

/**
 * Creates a hosted-onboarding link for a streamer.
 *
 * Account Links are single-use and short-lived, so one is minted per request
 * rather than stored.
 */
export async function startOnboarding(
  streamer: Streamer,
  ownerEmail: string | null,
  origin: string,
  refreshed = false,
): Promise<{ url: string; stripeAccountId: string }> {
  const stripeAccountId = await ensureConnectedAccount(streamer, ownerEmail);
  const { returnUrl, refreshUrl } = onboardingUrls(origin);

  try {
    const url = await createOnboardingLink({ stripeAccountId, returnUrl, refreshUrl });
    logEvent(refreshed ? 'stripe_onboarding_link_refreshed' : 'stripe_onboarding_link_created', {
      streamerId: streamer.streamerId,
      stripeAccountId,
    });
    return { url, stripeAccountId };
  } catch (err) {
    logFailure('stripe_onboarding_failed', err, {
      streamerId: streamer.streamerId,
      stripeAccountId,
      step: 'create_account_link',
    });
    throw new OnboardingError('Could not open Stripe onboarding. Please try again.');
  }
}

/**
 * Re-reads the account from Stripe and persists the result.
 *
 * This is the only path by which capability flags change. Nothing about the
 * onboarding redirect is trusted — arriving at the return URL triggers this
 * sync, and Stripe's answer decides whether the streamer is active.
 */
export async function syncAccountStatus(streamer: Streamer): Promise<{
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  status: string;
}> {
  if (!streamer.stripeAccountId) {
    return {
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      status: 'not_connected',
    };
  }

  // Now that onboarding may have supplied a business type, try to add FPX.
  // Best-effort: an individual/sole-proprietor streamer can't have it, and
  // that must not block the rest of the sync.
  try {
    const fpx = await ensureFpxCapability(streamer.stripeAccountId);
    logEvent('stripe_fpx_capability_checked', {
      streamerId: streamer.streamerId,
      stripeAccountId: streamer.stripeAccountId,
      outcome: fpx.outcome,
      businessType: fpx.businessType,
    });
  } catch (err) {
    logFailure('stripe_onboarding_failed', err, {
      streamerId: streamer.streamerId,
      step: 'request_fpx_capability',
    });
  }

  let flags;
  try {
    flags = await fetchCapabilityFlags(streamer.stripeAccountId);
  } catch (err) {
    logFailure('stripe_onboarding_failed', err, {
      streamerId: streamer.streamerId,
      stripeAccountId: streamer.stripeAccountId,
      step: 'retrieve_account',
    });
    throw new OnboardingError('Could not reach Stripe to check your account status.');
  }

  await saveStripeFlags(streamer.streamerId, flags);

  logEvent('stripe_account_status_synced', {
    streamerId: streamer.streamerId,
    stripeAccountId: flags.stripeAccountId,
    status: flags.stripeAccountStatus,
    chargesEnabled: flags.stripeChargesEnabled,
    payoutsEnabled: flags.stripePayoutsEnabled,
    detailsSubmitted: flags.stripeDetailsSubmitted,
  });

  return {
    chargesEnabled: flags.stripeChargesEnabled,
    payoutsEnabled: flags.stripePayoutsEnabled,
    detailsSubmitted: flags.stripeDetailsSubmitted,
    status: flags.stripeAccountStatus,
  };
}
