/**
 * Structured server-side event logging.
 *
 * Emits one JSON line per event so logs stay queryable in Vercel. Event names
 * are a closed union, which keeps them greppable and stops near-duplicates
 * ("chip_purchase_made" vs "chip_purchase_created") accumulating.
 *
 * Never pass bank details, identity documents, KYC data, secrets, or raw
 * provider responses. CHIP purchase IDs are included deliberately — they're
 * operational identifiers needed to trace an issue, and are never exposed to
 * a public page.
 */

export type AppEvent =
  // CHIP Collect
  | 'chip_purchase_created'
  | 'chip_purchase_failed'
  | 'chip_checkout_blocked'
  | 'chip_callback_rejected'
  | 'chip_callback_failed'
  | 'chip_callback_ignored'
  | 'chip_callback_duplicate'
  | 'chip_callback_unfulfilled'
  | 'chip_payment_fulfilled'
  | 'chip_payment_unsuccessful'
  | 'creator_payout_onboarding_updated';

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
