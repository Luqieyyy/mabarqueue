/**
 * Stripe Connect onboarding for streamers — server-only.
 *
 * Architecture (verified against Stripe's current docs):
 *
 *   Viewer pays  →  Direct charge on the streamer's connected account
 *                   (`Stripe-Account` header), with
 *                   `payment_intent_data.application_fee_amount` as
 *                   MabarQueue's cut.
 *   Funds flow:  gross − Stripe processing fee − application fee → streamer
 *                application fee → MabarQueue platform account
 *
 * This deliberately keeps the streamer as merchant of record, so viewer money
 * never transits MabarQueue's own bank account. Stripe's processing fee is
 * borne by the streamer, which keeps the platform's 5% clean net revenue.
 *
 * MabarQueue stores only Stripe *references and capability flags*. Bank
 * details, identity documents and every other KYC artefact stay with Stripe.
 *
 * Malaysia notes:
 *   - Connected accounts are created with `country: 'MY'`, currency MYR.
 *   - FPX (the payment method Malaysian viewers expect) requires the business
 *     to supply a Business Registration Number to Stripe before it can
 *     process charges or receive payouts. Stripe collects this during hosted
 *     onboarding; a streamer without one will not get `charges_enabled`.
 */

import 'server-only';
import type Stripe from 'stripe';
import { stripe } from './client';

export const CONNECT_COUNTRY = 'MY';
export const CONNECT_CURRENCY = 'myr';

export interface StripeCapabilityFlags {
  stripeAccountId: string;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
}

/**
 * Creates a connected account for a streamer.
 *
 * `controller` is configured to match the platform profile chosen in the
 * Stripe Dashboard: Stripe collects fees and owns loss liability, the
 * streamer gets a Stripe-hosted dashboard, and onboarding is Stripe-hosted.
 */
export async function createConnectedAccount(params: {
  email: string | null;
  displayName: string;
  streamerId: string;
}): Promise<string> {
  const account = await stripe().accounts.create({
    country: CONNECT_COUNTRY,
    email: params.email ?? undefined,
    business_profile: {
      name: params.displayName,
      product_description: 'Paid play-together gaming sessions with viewers',
    },
    capabilities: {
      card_payments: { requested: true },
      fpx_payments: { requested: true },
      transfers: { requested: true },
    },
    controller: {
      // Stripe bears loss liability (matches the platform's Connect profile).
      losses: { payments: 'stripe' },
      // Streamer manages their account in Stripe's own dashboard.
      stripe_dashboard: { type: 'full' },
      fees: { payer: 'account' },
    },
    metadata: { streamerId: params.streamerId },
  });

  return account.id;
}

/**
 * Creates a fresh hosted-onboarding link.
 *
 * Account Links are single-use and short-lived, so one is generated on demand
 * every time the streamer clicks "Connect payments" rather than being stored.
 */
export async function createOnboardingLink(params: {
  stripeAccountId: string;
  returnUrl: string;
  refreshUrl: string;
}): Promise<string> {
  const link = await stripe().accountLinks.create({
    account: params.stripeAccountId,
    type: 'account_onboarding',
    return_url: params.returnUrl,
    refresh_url: params.refreshUrl,
    collection_options: { fields: 'currently_due' },
  });
  return link.url;
}

/** Creates a link to the Stripe-hosted dashboard for an onboarded streamer. */
export async function createDashboardLink(stripeAccountId: string): Promise<string | null> {
  try {
    const link = await stripe().accounts.createLoginLink(stripeAccountId);
    return link.url;
  } catch {
    // Login links only work once the account has completed onboarding.
    return null;
  }
}

/** Reads the live capability flags for a connected account. */
export async function fetchCapabilityFlags(stripeAccountId: string): Promise<StripeCapabilityFlags> {
  const account = await stripe().accounts.retrieve(stripeAccountId);
  return capabilityFlagsFrom(account);
}

/** Projects a Stripe Account object down to the flags MabarQueue persists. */
export function capabilityFlagsFrom(account: Stripe.Account): StripeCapabilityFlags {
  return {
    stripeAccountId: account.id,
    stripeChargesEnabled: Boolean(account.charges_enabled),
    stripePayoutsEnabled: Boolean(account.payouts_enabled),
    stripeDetailsSubmitted: Boolean(account.details_submitted),
  };
}
