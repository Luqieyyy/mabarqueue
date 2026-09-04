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
import {
  deriveStripeAccountStatus,
  type StripeAccountStatus,
} from '../domain/stripe-account-status';

export const CONNECT_COUNTRY = 'MY';
export const CONNECT_CURRENCY = 'myr';

export interface StripeCapabilityFlags {
  stripeAccountId: string;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  /** Derived from the flags above — see `deriveStripeAccountStatus`. */
  stripeAccountStatus: StripeAccountStatus;
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
    // FPX is deliberately NOT requested here. Stripe rejects it at creation
    // with "requires `business_type` to be provided", and business_type is
    // precisely what hosted onboarding collects. It's requested afterwards by
    // `ensureFpxCapability`, and only for the business types that allow it.
    capabilities: {
      card_payments: { requested: true },
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

/**
 * Where a connected account manages their own Stripe account.
 *
 * Our accounts are created with `controller.stripe_dashboard.type = 'full'`,
 * so the streamer has a real Stripe account with their own credentials and
 * signs in at dashboard.stripe.com directly.
 *
 * Deliberately NOT `accounts.createLoginLink`: per Stripe's API reference,
 * login links take an **Express** account to its Express dashboard. Calling
 * it on a full-dashboard account fails, so a generated-link flow here would
 * be permanently broken rather than merely unnecessary.
 */
export const STRIPE_DASHBOARD_URL = 'https://dashboard.stripe.com/';

/**
 * The URL a full-dashboard connected account should be sent to.
 *
 * A constant rather than an API call — there is no per-account link to mint
 * for this account type.
 */
export function dashboardUrlFor(): string {
  return STRIPE_DASHBOARD_URL;
}

/**
 * Business types that may request the FPX capability.
 *
 * Verified against the sandbox API: requesting `fpx_payments` for an
 * `individual` or `sole_proprietor` account is rejected outright with
 * "The fpx_payments capability is not requestable for Individual or Sole
 * Proprietor accounts." Only registered entities qualify, which is the same
 * reason Stripe requires a Business Registration Number for FPX.
 */
const FPX_ELIGIBLE_BUSINESS_TYPES = new Set(['company', 'non_profit']);

export type FpxEligibility = 'requested' | 'already_requested' | 'ineligible' | 'unknown_yet';

/**
 * Requests the FPX capability once the account's business type is known.
 *
 * Called after onboarding rather than at creation, because FPX can only be
 * requested when `business_type` is already set — and then only for eligible
 * entity types. An individual streamer simply keeps card payments; this is a
 * Stripe/regulatory limit, not something the integration can work around.
 */
export async function ensureFpxCapability(
  stripeAccountId: string,
): Promise<{ outcome: FpxEligibility; businessType: string | null }> {
  const account = await stripe().accounts.retrieve(stripeAccountId);
  const businessType = account.business_type ?? null;

  if (!businessType) return { outcome: 'unknown_yet', businessType: null };
  if (!FPX_ELIGIBLE_BUSINESS_TYPES.has(businessType)) {
    return { outcome: 'ineligible', businessType };
  }
  if (account.capabilities?.fpx_payments) {
    return { outcome: 'already_requested', businessType };
  }

  await stripe().accounts.update(stripeAccountId, {
    capabilities: { fpx_payments: { requested: true } },
  });
  return { outcome: 'requested', businessType };
}

/** Reads the live capability flags for a connected account. */
export async function fetchCapabilityFlags(stripeAccountId: string): Promise<StripeCapabilityFlags> {
  const account = await stripe().accounts.retrieve(stripeAccountId);
  return capabilityFlagsFrom(account);
}

/**
 * Projects a Stripe Account object down to the flags MabarQueue persists.
 *
 * Stripe is the sole source of truth here: this is only ever called with an
 * account fetched server-side (`accounts.retrieve`) or delivered on a
 * signature-verified `account.updated` webhook — never with anything a
 * browser supplied.
 */
export function capabilityFlagsFrom(account: Stripe.Account): StripeCapabilityFlags {
  const flags = {
    stripeAccountId: account.id,
    stripeChargesEnabled: Boolean(account.charges_enabled),
    stripePayoutsEnabled: Boolean(account.payouts_enabled),
    stripeDetailsSubmitted: Boolean(account.details_submitted),
  };

  return { ...flags, stripeAccountStatus: deriveStripeAccountStatus(flags) };
}
