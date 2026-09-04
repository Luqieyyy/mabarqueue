import { describe, expect, it } from 'vitest';
import {
  canAcceptPayments,
  deriveStripeAccountStatus,
  needsOnboarding,
  statusCopy,
  type StripeAccountFlags,
} from './stripe-account-status';

const flags = (over: Partial<StripeAccountFlags> = {}): StripeAccountFlags => ({
  stripeAccountId: 'acct_123',
  stripeDetailsSubmitted: false,
  stripeChargesEnabled: false,
  stripePayoutsEnabled: false,
  ...over,
});

describe('deriveStripeAccountStatus', () => {
  it('is not_connected without an account, whatever the other flags claim', () => {
    expect(deriveStripeAccountStatus(flags({ stripeAccountId: null }))).toBe('not_connected');
    // Defends against stale flags left behind by a disconnected account.
    expect(
      deriveStripeAccountStatus(
        flags({ stripeAccountId: null, stripeChargesEnabled: true, stripeDetailsSubmitted: true }),
      ),
    ).toBe('not_connected');
  });

  it('is onboarding once an account exists but details are outstanding', () => {
    expect(deriveStripeAccountStatus(flags())).toBe('onboarding');
  });

  it('is restricted when details are in but Stripe has not enabled charges', () => {
    expect(deriveStripeAccountStatus(flags({ stripeDetailsSubmitted: true }))).toBe('restricted');
  });

  it('is active only when Stripe has enabled charges', () => {
    expect(
      deriveStripeAccountStatus(flags({ stripeDetailsSubmitted: true, stripeChargesEnabled: true })),
    ).toBe('active');
  });

  it('does NOT treat submitted details as active — the core onboarding rule', () => {
    // A completed onboarding redirect sets details_submitted, but Stripe may
    // still be verifying. Treating that as active would let a streamer be
    // advertised as payable before Stripe would accept a charge.
    const submittedButUnverified = flags({
      stripeDetailsSubmitted: true,
      stripeChargesEnabled: false,
    });
    expect(deriveStripeAccountStatus(submittedButUnverified)).not.toBe('active');
    expect(canAcceptPayments(submittedButUnverified)).toBe(false);
  });

  it('can be active before payouts are enabled', () => {
    // Stripe often enables charging before payout details are verified.
    const chargesOnly = flags({
      stripeDetailsSubmitted: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: false,
    });
    expect(deriveStripeAccountStatus(chargesOnly)).toBe('active');
    expect(canAcceptPayments(chargesOnly)).toBe(true);
  });

  it('never reports active on payouts alone', () => {
    expect(
      deriveStripeAccountStatus(flags({ stripePayoutsEnabled: true, stripeDetailsSubmitted: true })),
    ).toBe('restricted');
  });
});

describe('canAcceptPayments', () => {
  it('gates strictly on charges being enabled', () => {
    expect(canAcceptPayments(flags({ stripeAccountId: null }))).toBe(false);
    expect(canAcceptPayments(flags())).toBe(false);
    expect(canAcceptPayments(flags({ stripeDetailsSubmitted: true }))).toBe(false);
    expect(canAcceptPayments(flags({ stripeChargesEnabled: true }))).toBe(true);
  });
});

describe('needsOnboarding', () => {
  it('is true only before details are submitted', () => {
    expect(needsOnboarding('not_connected')).toBe(true);
    expect(needsOnboarding('onboarding')).toBe(true);
    expect(needsOnboarding('restricted')).toBe(false);
    expect(needsOnboarding('active')).toBe(false);
  });
});

describe('statusCopy', () => {
  it('offers connect before an account exists and continue while incomplete', () => {
    expect(statusCopy('not_connected', false).action).toBe('connect');
    expect(statusCopy('onboarding', false).action).toBe('continue');
    expect(statusCopy('restricted', false).action).toBe('continue');
    expect(statusCopy('active', true).action).toBe('none');
  });

  it('distinguishes active-with-payouts from active-without', () => {
    expect(statusCopy('active', true).detail).toContain('pay out');
    expect(statusCopy('active', false).detail).toContain('still needs payout details');
  });

  it('covers every status', () => {
    for (const s of ['not_connected', 'onboarding', 'restricted', 'active'] as const) {
      const copy = statusCopy(s, false);
      expect(copy.label).toBeTruthy();
      expect(copy.detail).toBeTruthy();
    }
  });
});
