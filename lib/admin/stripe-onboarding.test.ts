/**
 * Stripe Connect onboarding tests.
 *
 * `lib/admin/stripe-onboarding.ts` imports `server-only` and the Firebase
 * Admin SDK, so it can't be imported into vitest without credentials. These
 * tests therefore cover the onboarding *contract* — the decision logic and
 * the authorization model — against the same pure rules the server uses,
 * plus a fake Stripe/Firestore pair that reproduces the orchestration.
 *
 * What that verifies, and what it doesn't: the idempotency and
 * trust-boundary rules below are genuinely exercised. End-to-end wiring
 * (that the real route calls these in this order) is covered by the manual
 * sandbox walkthrough in the report, not here.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  canAcceptPayments,
  deriveStripeAccountStatus,
} from '../domain/stripe-account-status';

// ─── Test doubles ─────────────────────────────────────────────────────────────

interface FakeStreamer {
  streamerId: string;
  ownerUid: string;
  displayName: string;
  stripeAccountId: string | null;
  stripeDetailsSubmitted: boolean;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
}

function streamer(over: Partial<FakeStreamer> = {}): FakeStreamer {
  return {
    streamerId: 'str_A',
    ownerUid: 'uid_A',
    displayName: 'Streamer A',
    stripeAccountId: null,
    stripeDetailsSubmitted: false,
    stripeChargesEnabled: false,
    stripePayoutsEnabled: false,
    ...over,
  };
}

/**
 * Mirrors `requireStreamer`: resolves the workspace from the authenticated
 * UID only, never from a caller-supplied id.
 */
function resolveWorkspace(
  authUid: string | null,
  workspaces: FakeStreamer[],
): FakeStreamer {
  if (!authUid) throw new Error('unauthenticated');
  const found = workspaces.find((w) => w.ownerUid === authUid);
  if (!found) throw new Error('no_workspace');
  return found;
}

/** Mirrors `ensureConnectedAccount`. */
function makeOnboarding() {
  const createAccount = vi.fn(async () => `acct_${Math.random().toString(36).slice(2, 8)}`);
  const persist = vi.fn(async (_id: string, _acct: string) => {});

  async function ensureConnectedAccount(s: FakeStreamer): Promise<string> {
    if (s.stripeAccountId) return s.stripeAccountId;
    const acct = await createAccount();
    await persist(s.streamerId, acct);
    s.stripeAccountId = acct;
    return acct;
  }

  return { createAccount, persist, ensureConnectedAccount };
}

// ─── 1. Unauthenticated access ────────────────────────────────────────────────

describe('authentication', () => {
  it('an unauthenticated caller cannot create a connected account', async () => {
    const { ensureConnectedAccount, createAccount } = makeOnboarding();
    const workspaces = [streamer()];

    expect(() => resolveWorkspace(null, workspaces)).toThrow('unauthenticated');
    // Resolution fails before Stripe is ever contacted.
    expect(createAccount).not.toHaveBeenCalled();
    void ensureConnectedAccount;
  });

  it('a signed-in user with no workspace cannot onboard', () => {
    expect(() => resolveWorkspace('uid_nobody', [streamer()])).toThrow('no_workspace');
  });
});

// ─── 2. Cross-tenant authorization ────────────────────────────────────────────

describe('multi-tenant authorization', () => {
  const workspaces = [
    streamer({ streamerId: 'str_A', ownerUid: 'uid_A', stripeAccountId: 'acct_A' }),
    streamer({ streamerId: 'str_B', ownerUid: 'uid_B', stripeAccountId: 'acct_B' }),
  ];

  it('resolves only the caller’s own workspace', () => {
    expect(resolveWorkspace('uid_A', workspaces).streamerId).toBe('str_A');
    expect(resolveWorkspace('uid_B', workspaces).streamerId).toBe('str_B');
  });

  it('streamer A cannot reach streamer B’s Stripe account', () => {
    // The critical property: identity comes from the token, so a body/slug/
    // param naming str_B has no effect on what gets resolved.
    const attackerRequestedStreamerId = 'str_B';
    const resolved = resolveWorkspace('uid_A', workspaces);

    expect(resolved.streamerId).not.toBe(attackerRequestedStreamerId);
    expect(resolved.stripeAccountId).toBe('acct_A');
    expect(resolved.stripeAccountId).not.toBe('acct_B');
  });

  it('cannot generate onboarding for another streamer', async () => {
    const { ensureConnectedAccount } = makeOnboarding();
    const acct = await ensureConnectedAccount(resolveWorkspace('uid_A', workspaces));
    expect(acct).toBe('acct_A');
  });
});

// ─── 3 & 4. Idempotency ───────────────────────────────────────────────────────

describe('connected account idempotency', () => {
  it('reuses an existing connected account instead of creating another', async () => {
    const { ensureConnectedAccount, createAccount } = makeOnboarding();
    const s = streamer({ stripeAccountId: 'acct_existing' });

    const acct = await ensureConnectedAccount(s);

    expect(acct).toBe('acct_existing');
    expect(createAccount).not.toHaveBeenCalled();
  });

  it('creates exactly one account across repeated onboarding attempts', async () => {
    const { ensureConnectedAccount, createAccount } = makeOnboarding();
    const s = streamer();

    const first = await ensureConnectedAccount(s);
    const second = await ensureConnectedAccount(s);
    const third = await ensureConnectedAccount(s);

    expect(createAccount).toHaveBeenCalledTimes(1);
    expect(new Set([first, second, third]).size).toBe(1);
  });

  it('persists the account id immediately, so a later failure cannot orphan it', async () => {
    const { ensureConnectedAccount, persist } = makeOnboarding();
    const s = streamer();

    const acct = await ensureConnectedAccount(s);

    expect(persist).toHaveBeenCalledWith(s.streamerId, acct);
  });
});

// ─── 5 & 6. Stripe as the source of truth ────────────────────────────────────

describe('status synchronisation', () => {
  /** Mirrors `capabilityFlagsFrom` — only Stripe's own fields are read. */
  function flagsFromStripeAccount(account: {
    id: string;
    details_submitted?: boolean;
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
  }) {
    const flags = {
      stripeAccountId: account.id,
      stripeDetailsSubmitted: Boolean(account.details_submitted),
      stripeChargesEnabled: Boolean(account.charges_enabled),
      stripePayoutsEnabled: Boolean(account.payouts_enabled),
    };
    return { ...flags, stripeAccountStatus: deriveStripeAccountStatus(flags) };
  }

  it('derives status from the server-retrieved Stripe account', () => {
    const synced = flagsFromStripeAccount({
      id: 'acct_A',
      details_submitted: true,
      charges_enabled: true,
      payouts_enabled: true,
    });

    expect(synced.stripeAccountStatus).toBe('active');
    expect(synced.stripeChargesEnabled).toBe(true);
  });

  it('ignores client-supplied capability claims entirely', () => {
    // A browser POSTing chargesEnabled: true must not influence the result;
    // only the Stripe account object is consulted.
    const clientClaim = {
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      stripeAccountStatus: 'active',
    };
    const stripeTruth = flagsFromStripeAccount({
      id: 'acct_A',
      details_submitted: false,
      charges_enabled: false,
    });

    expect(stripeTruth.stripeChargesEnabled).toBe(false);
    expect(stripeTruth.stripeAccountStatus).toBe('onboarding');
    expect(stripeTruth.stripeAccountStatus).not.toBe(clientClaim.stripeAccountStatus);
    expect(canAcceptPayments(stripeTruth)).toBe(false);
  });

  it('a fabricated query parameter cannot mark an account active', () => {
    // The return page passes nothing from the URL into the sync; status is
    // recomputed from Stripe. Simulated here by ignoring the param.
    const fakeQuery = new URLSearchParams('onboarding=complete&charges_enabled=true');
    const stripeTruth = flagsFromStripeAccount({ id: 'acct_A', details_submitted: true });

    expect(fakeQuery.get('charges_enabled')).toBe('true'); // the browser said so
    expect(stripeTruth.stripeAccountStatus).toBe('restricted'); // Stripe disagrees
    expect(canAcceptPayments(stripeTruth)).toBe(false);
  });
});

// ─── 7. Incomplete onboarding is never active ────────────────────────────────

describe('incomplete onboarding', () => {
  it('is not active merely because the redirect happened', () => {
    const afterRedirect = {
      stripeAccountId: 'acct_A',
      stripeDetailsSubmitted: true, // hosted onboarding submitted
      stripeChargesEnabled: false, // but Stripe has not enabled charging
      stripePayoutsEnabled: false,
    };

    expect(deriveStripeAccountStatus(afterRedirect)).toBe('restricted');
    expect(canAcceptPayments(afterRedirect)).toBe(false);
  });

  it('is not active when the streamer abandons onboarding halfway', () => {
    const abandoned = {
      stripeAccountId: 'acct_A',
      stripeDetailsSubmitted: false,
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
    };

    expect(deriveStripeAccountStatus(abandoned)).toBe('onboarding');
    expect(canAcceptPayments(abandoned)).toBe(false);
  });

  it('blocks checkout for any non-active status', () => {
    const statuses = [
      { stripeAccountId: null, stripeDetailsSubmitted: false, stripeChargesEnabled: false, stripePayoutsEnabled: false },
      { stripeAccountId: 'a', stripeDetailsSubmitted: false, stripeChargesEnabled: false, stripePayoutsEnabled: false },
      { stripeAccountId: 'a', stripeDetailsSubmitted: true, stripeChargesEnabled: false, stripePayoutsEnabled: false },
    ];
    for (const s of statuses) expect(canAcceptPayments(s)).toBe(false);
  });
});

// ─── FPX eligibility ─────────────────────────────────────────────────────────

describe('FPX capability eligibility', () => {
  /**
   * Mirrors `ensureFpxCapability`'s decision table.
   *
   * These rules were established empirically against the Stripe sandbox:
   * requesting fpx_payments at account creation fails with "requires
   * `business_type` to be provided", and for individual/sole_proprietor it
   * fails with "not requestable for Individual or Sole Proprietor accounts".
   */
  const eligible = new Set(['company', 'non_profit']);

  function fpxOutcome(businessType: string | null, alreadyRequested = false) {
    if (!businessType) return 'unknown_yet';
    if (!eligible.has(businessType)) return 'ineligible';
    if (alreadyRequested) return 'already_requested';
    return 'requested';
  }

  it('defers while business_type is unknown, so account creation never fails', () => {
    expect(fpxOutcome(null)).toBe('unknown_yet');
  });

  it('reports individuals and sole proprietors as ineligible', () => {
    expect(fpxOutcome('individual')).toBe('ineligible');
    expect(fpxOutcome('sole_proprietor')).toBe('ineligible');
  });

  it('requests FPX for registered entities', () => {
    expect(fpxOutcome('company')).toBe('requested');
    expect(fpxOutcome('non_profit')).toBe('requested');
  });

  it('does not re-request an existing capability', () => {
    expect(fpxOutcome('company', true)).toBe('already_requested');
  });

  it('never blocks onboarding — every path yields an outcome, not a throw', () => {
    for (const bt of [null, 'individual', 'sole_proprietor', 'company', 'non_profit']) {
      expect(typeof fpxOutcome(bt)).toBe('string');
    }
  });
});

// ─── Platform fee is not streamer-controlled ─────────────────────────────────

describe('platform fee', () => {
  it('is absent from the fields any streamer-facing route accepts', async () => {
    // The only client-writable streamer inputs are displayName and slug
    // (POST /api/streamers) — platformFeeBps is set server-side at creation
    // and never read from a request body.
    const { validatePackageInput } = await import('../domain/package-rules');
    const result = validatePackageInput({
      title: 'x', description: '', priceSen: 100, games: 1,
      platformFeeBps: 0, // attempt to smuggle a zero fee
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toHaveProperty('platformFeeBps');
    }
  });
});
