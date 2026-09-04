/**
 * Donation records and idempotent payment fulfilment — server-only.
 *
 * Firestore here is a *reporting mirror*, not a ledger of record: Stripe
 * remains the source of truth for money movement, balances and payouts. What
 * this module guarantees is that a given provider event grants credits
 * exactly once, no matter how many times Stripe redelivers it.
 */

import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../firebase-admin';
import { donationsCol, paymentAttemptDoc, paymentEventDoc, streamerDoc } from './paths';
import { calcPlatformFee, toSen, type Sen } from '../domain/money';
import { resolveFeeBps } from '../domain/config';
import type { DonationStatus, PaymentProvider } from '../domain/types';
import type { GameId } from '../games';
import type { PackageId, StreamerId } from '../domain/ids';

// ─── Pending checkout attempts ────────────────────────────────────────────────

export interface PaymentAttempt {
  streamerId: StreamerId;
  packageId: PackageId;
  packageTitle: string;
  priceSen: number;
  games: number;
  feeBps: number;
  platformFeeSen: number;
  ign: string;
  playerId: string | null;
  donorName: string;
  game: GameId;
}

/**
 * Records what a Checkout Session was *for*, before the viewer pays.
 *
 * The viewer's IGN and player ID live here rather than in Stripe metadata:
 * Stripe metadata is limited and shouldn't carry personal data unnecessarily,
 * and the webhook can look this up by session ID anyway.
 */
export async function savePaymentAttempt(
  sessionId: string,
  attempt: PaymentAttempt,
): Promise<void> {
  await paymentAttemptDoc(attempt.streamerId, sessionId).set({
    ...attempt,
    sessionId,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function getPaymentAttempt(
  streamerId: StreamerId,
  sessionId: string,
): Promise<PaymentAttempt | null> {
  const snap = await paymentAttemptDoc(streamerId, sessionId).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return {
    streamerId,
    packageId: d.packageId as PackageId,
    packageTitle: String(d.packageTitle ?? ''),
    priceSen: Number(d.priceSen ?? 0),
    games: Number(d.games ?? 0),
    feeBps: Number(d.feeBps ?? 0),
    platformFeeSen: Number(d.platformFeeSen ?? 0),
    ign: String(d.ign ?? ''),
    playerId: (d.playerId as string | null) ?? null,
    donorName: String(d.donorName ?? ''),
    game: d.game as GameId,
  };
}

// ─── Fee calculation ──────────────────────────────────────────────────────────

export interface ResolvedFee {
  grossSen: Sen;
  platformFeeSen: Sen;
  feeBps: number;
}

/**
 * Computes the platform fee for a purchase, server-side.
 *
 * The rate comes from the streamer document (falling back to the platform
 * default), never from the request — so a client can't negotiate its own fee.
 */
export function resolvePlatformFee(priceSen: number, storedFeeBps: number | null): ResolvedFee {
  const bps = resolveFeeBps(storedFeeBps);
  const breakdown = calcPlatformFee(toSen(priceSen), bps);
  return {
    grossSen: breakdown.grossSen,
    platformFeeSen: breakdown.platformFeeSen,
    feeBps: bps,
  };
}

// ─── Donation records ─────────────────────────────────────────────────────────

export interface DonationInput {
  provider: PaymentProvider;
  providerPaymentId: string | null;
  packageId: PackageId | null;
  packageTitle: string | null;
  grossSen: number;
  platformFeeSen: number;
  feeBps: number;
  gamesAdded: number;
  ign: string | null;
  playerId: string | null;
  donorName: string;
  message: string | null;
  status: DonationStatus;
  failureReason: string | null;
  game: GameId;
  queueEntryId: string | null;
}

export async function recordDonation(
  streamerId: StreamerId,
  input: DonationInput,
): Promise<string> {
  const ref = donationsCol(streamerId).doc();
  await ref.set({
    ...input,
    currency: 'MYR',
    processingFeeSen: null, // Known only after settlement; Stripe owns this.
    netSen: null,
    createdAt: FieldValue.serverTimestamp(),
    succeededAt: input.status === 'succeeded' ? FieldValue.serverTimestamp() : null,
  });
  return ref.id;
}

// ─── Idempotency ──────────────────────────────────────────────────────────────

/**
 * Claims a provider event for processing, exactly once.
 *
 * Returns `false` if the event was already handled. The check and the claim
 * happen in one transaction, so two concurrent redeliveries can't both win.
 * The caller does its own work only when this returns `true`.
 */
export async function claimPaymentEvent(
  streamerId: StreamerId,
  providerEventId: string,
  provider: PaymentProvider,
  type: string,
): Promise<boolean> {
  const ref = paymentEventDoc(streamerId, providerEventId);

  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;

    tx.set(ref, {
      provider,
      type,
      donationId: null,
      processedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

/** Links a processed event to the donation it produced, for traceability. */
export async function attachDonationToEvent(
  streamerId: StreamerId,
  providerEventId: string,
  donationId: string,
): Promise<void> {
  await paymentEventDoc(streamerId, providerEventId).set({ donationId }, { merge: true });
}

// ─── Earnings ─────────────────────────────────────────────────────────────────

export interface EarningsSummary {
  grossSen: number;
  platformFeeSen: number;
  netBeforeProcessingSen: number;
  paymentCount: number;
}

/**
 * Aggregates successful donations since `since`.
 *
 * Reported from MabarQueue's mirror, so it reflects what the platform
 * recorded — Stripe's dashboard remains authoritative for settled amounts,
 * processing fees and payout state.
 */
export async function summariseEarnings(
  streamerId: StreamerId,
  since: Date | null,
): Promise<EarningsSummary> {
  let query = donationsCol(streamerId).where('status', '==', 'succeeded');
  if (since) query = query.where('createdAt', '>=', since);

  const snap = await query.get();
  let grossSen = 0;
  let platformFeeSen = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    grossSen += Number(d.grossSen ?? 0);
    platformFeeSen += Number(d.platformFeeSen ?? 0);
  }

  return {
    grossSen,
    platformFeeSen,
    netBeforeProcessingSen: Math.max(0, grossSen - platformFeeSen),
    paymentCount: snap.size,
  };
}

/** Persists refreshed Stripe capability flags on the streamer document. */
export async function saveStripeFlags(
  streamerId: StreamerId,
  flags: {
    stripeAccountId: string;
    stripeChargesEnabled: boolean;
    stripePayoutsEnabled: boolean;
    stripeDetailsSubmitted: boolean;
  },
): Promise<void> {
  await streamerDoc(streamerId).set(
    {
      ...flags,
      // A streamer becomes publicly payable only once Stripe says charges
      // are enabled; until then the public page shows them as not accepting.
      ...(flags.stripeChargesEnabled ? { status: 'active' } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
