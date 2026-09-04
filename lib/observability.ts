/**
 * Structured server-side event logging.
 *
 * Emits one JSON line per event so logs stay queryable in Vercel. Event names
 * are a closed union, which keeps them greppable and stops near-duplicates
 * ("stripe_onboard_started" vs "stripe_onboarding_started") accumulating.
 *
 * Never pass bank details, identity documents, KYC data, secrets, or raw
 * provider responses. Stripe account IDs are included deliberately — they're
 * operational identifiers needed to trace an issue, and are never exposed to
 * a public page.
 */

export type AppEvent =
  | 'stripe_connected_account_created'
  | 'stripe_connected_account_reused'
  | 'stripe_onboarding_link_created'
  | 'stripe_onboarding_link_refreshed'
  | 'stripe_account_status_synced'
  | 'stripe_fpx_capability_checked'
  | 'stripe_onboarding_failed'
  | 'stripe_dashboard_access_requested'
  | 'stripe_checkout_blocked';

type Scalar = string | number | boolean | null | undefined;

export function logEvent(event: AppEvent, fields: Record<string, Scalar> = {}): void {
  const entry = {
    event,
    at: new Date().toISOString(),
    ...fields,
  };
  console.log(JSON.stringify(entry));
}

/**
 * Logs a failure with a safe message only.
 *
 * Provider errors can embed request payloads, so only the error's message is
 * recorded — never the whole object.
 */
export function logFailure(
  event: AppEvent,
  err: unknown,
  fields: Record<string, Scalar> = {},
): void {
  logEvent(event, {
    ...fields,
    reason: err instanceof Error ? err.message : 'unknown_error',
  });
}
