/**
 * Derives a streamer's payment-readiness from Stripe's account flags.
 *
 * Pure and provider-shaped rather than Stripe-shaped: it takes three plain
 * booleans, so the domain never imports the Stripe SDK and a future provider
 * can map its own flags onto the same states.
 *
 * The central rule: onboarding is only "active" when **Stripe** says charges
 * are enabled. Returning from the hosted onboarding redirect proves nothing —
 * the streamer may have abandoned it halfway, or Stripe may still be
 * verifying — so the redirect never drives this value.
 */

export type StripeAccountStatus =
  /** No connected account exists yet. */
  | 'not_connected'
  /** Account created, required information not yet fully submitted. */
  | 'onboarding'
  /** Everything submitted, but Stripe hasn't enabled charges (verification pending). */
  | 'restricted'
  /** Stripe has enabled charges — the streamer can be paid. */
  | 'active';

export interface StripeAccountFlags {
  stripeAccountId: string | null;
  stripeDetailsSubmitted: boolean;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
}

/**
 * Maps Stripe's flags to an application status.
 *
 * `charges_enabled` is the gate for `active` because it's what actually
 * determines whether a payment can be taken. Payouts can lag behind charges
 * (Stripe may enable charging before a bank account is verified), so a
 * streamer can be `active` with payouts still disabled — money accrues in
 * their Stripe balance and pays out once Stripe is satisfied.
 */
export function deriveStripeAccountStatus(flags: StripeAccountFlags): StripeAccountStatus {
  if (!flags.stripeAccountId) return 'not_connected';
  if (flags.stripeChargesEnabled) return 'active';
  if (flags.stripeDetailsSubmitted) return 'restricted';
  return 'onboarding';
}

/** True only when the streamer can actually accept viewer payments. */
export function canAcceptPayments(flags: StripeAccountFlags): boolean {
  return deriveStripeAccountStatus(flags) === 'active';
}

/** True when the streamer still has onboarding steps to finish. */
export function needsOnboarding(status: StripeAccountStatus): boolean {
  return status === 'not_connected' || status === 'onboarding';
}

export interface StatusCopy {
  label: string;
  detail: string;
  /** Primary call to action, or null when nothing is required. */
  action: 'connect' | 'continue' | 'none';
}

/** UI copy for each state, kept beside the logic so they can't drift apart. */
export function statusCopy(status: StripeAccountStatus, payoutsEnabled: boolean): StatusCopy {
  switch (status) {
    case 'not_connected':
      return {
        label: 'Not connected',
        detail: 'Connect your Stripe account to accept payments from viewers.',
        action: 'connect',
      };
    case 'onboarding':
      return {
        label: 'Onboarding incomplete',
        detail: 'Complete Stripe verification before accepting viewer payments.',
        action: 'continue',
      };
    case 'restricted':
      return {
        label: 'Verification pending',
        detail:
          'Stripe is reviewing your details. This can take a little time — you may be asked for more information.',
        action: 'continue',
      };
    case 'active':
      return {
        label: 'Connected',
        detail: payoutsEnabled
          ? 'You can accept payments, and Stripe will pay out to your bank.'
          : 'You can accept payments. Stripe still needs payout details before it can pay you out.',
        action: 'none',
      };
  }
}
