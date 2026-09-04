/**
 * Stripe SDK singleton — server-only.
 *
 * `STRIPE_SECRET_KEY` must never be exposed to the browser. Only the
 * publishable key (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) is client-safe, and
 * this integration doesn't even need it: Checkout is Stripe-hosted, so the
 * browser is simply redirected to a URL the server creates.
 */

import 'server-only';
import Stripe from 'stripe';

let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (cached) return cached;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('Missing STRIPE_SECRET_KEY (server-only) in the environment.');
  }

  cached = new Stripe(key, {
    // The SDK's own pinned API version is used deliberately: it matches the
    // types this package ships with, so upgrading the SDK and the API version
    // stay in lockstep instead of drifting apart.
    typescript: true,
    appInfo: { name: 'MabarQueue', url: 'https://mabarqueue.com' },
  });
  return cached;
}

/** True when running against Stripe test keys. */
export function isTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test_');
}
