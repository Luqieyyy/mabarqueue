/**
 * Donation records, creator entitlement and idempotent fulfilment — server-only.
 *
 * CHIP is the source of truth for money actually moving. What this module
 * owns is the consequence of that movement: what the viewer was charged, what
 * the creator is owed, and what MabarQueue kept — recorded exactly once per
 * provider event, no matter how many times CHIP redelivers it.
 *
 * The fee model matters here. MabarQueue's service fee is charged to the
 * viewer *on top of* the creator's listed price, so the creator's entitlement
 * is always their full listing. Nothing in this module ever deducts the
 * platform fee from a creator.
 */

import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../firebase-admin';
import { donationsCol, paymentAttemptDoc, paymentEventDoc, streamerDoc } from './paths';
import { appendLedgerEntryTx } from './ledger-repo';
import { calcCheckoutAmounts, toSen, type CheckoutAmounts } from '../domain/money';
import { resolveFeeBps } from '../domain/config';
import type { DonationStatus, PaymentProvider } from '../domain/types';
import type { GameId } from '../games';
import type { PackageId, StreamerId } from '../domain/ids';

// ─── Pending checkout attempts ────────────────────────────────────────────────

/**
 * What a checkout was for, recorded before the viewer pays.
 *
 * The authoritative amounts live here rather than in provider metadata, so
 * fulfilment never has to trust anything echoed back over the wire. Keyed by
 * the CHIP purchase ID.
 */
export interface PaymentAttempt {
  kind: 'mabar' | 'donation';
  streamerId: StreamerId;
  packageId: PackageId | null;
  packageTitle: string | null;

  // Money, all integer sen.
  baseSen: number;
  platformFeeSen: number;
  processingFeeSen: number;
  totalSen: number;
  creatorEntitlementSen: number;
  platformNetSen: number;
  feeBps: number;

  games: number;
  ign: string;
  playerId: string | null;
  donorName: string;
  message: string | null;
  game: GameId;
}

export async function savePaymentAttempt(
  purchaseId: string,
  attempt: PaymentAttempt,
): Promise<void> {
  await paymentAttemptDoc(attempt.streamerId, purchaseId).set({
    ...attempt,
    purchaseId,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function getPaymentAttempt(
  streamerId: StreamerId,
  purchaseId: string,
): Promise<PaymentAttempt | null> {
  const snap = await paymentAttemptDoc(streamerId, purchaseId).get();
  if (!snap.exists) return null;
  const d = snap.data()!;

  const baseSen = Number(d.baseSen ?? d.priceSen ?? 0);
  const platformFeeSen = Number(d.platformFeeSen ?? 0);

  return {
    streamerId,
    kind: d.kind === 'donation' ? 'donation' : 'mabar',
    packageId: (d.packageId as PackageId | null) ?? null,
    packageTitle: typeof d.packageTitle === 'string' ? d.packageTitle : null,
    baseSen,
    platformFeeSen,
    processingFeeSen: Number(d.processingFeeSen ?? 0),
    totalSen: Number(d.totalSen ?? baseSen + platformFeeSen),
    creatorEntitlementSen: Number(d.creatorEntitlementSen ?? baseSen),
    platformNetSen: Number(d.platformNetSen ?? platformFeeSen),
    feeBps: Number(d.feeBps ?? 0),
    games: Number(d.games ?? 0),
    ign: String(d.ign ?? ''),
    playerId: (d.playerId as string | null) ?? null,
    donorName: String(d.donorName ?? ''),
    message: typeof d.message === 'string' ? d.message : null,
    game: d.game as GameId,
  };
}

// ─── Fee calculation ──────────────────────────────────────────────────────────

/**
 * Resolves every checkout amount from the creator's listed price.
 *
 * The rate comes from the streamer document (falling back to the platform
 * default), never from the request — so a client cannot negotiate its own fee.
 * The creator's entitlement is always the full listed price; the fee is added
 * on top and paid by the viewer.
 */
export function resolveCheckoutAmounts(
  basePriceSen: number,
  storedFeeBps: number | null,
): CheckoutAmounts {
  const bps = resolveFeeBps(storedFeeBps);
  // Processing fee stays zero: MabarQueue absorbs it out of its own platform
  // fee until CHIP's actual schedule is confirmed, so the viewer is never
  // charged a rate we invented.
  return calcCheckoutAmounts(toSen(basePriceSen), bps);
}

// ─── Donation records ─────────────────────────────────────────────────────────

export interface DonationInput {
  provider: PaymentProvider;
  providerPaymentId: string | null;
  packageId: PackageId | null;
  packageTitle: string | null;

  baseSen: number;
  platformFeeSen: number;
  processingFeeSen: number;
  totalSen: number;
  creatorEntitlementSen: number;
  platformNetSen: number;
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

function donationDocData(input: DonationInput) {
  return {
    ...input,
    currency: 'MYR' as const,
    // Retained so records written under the previous model and this one can
    // be summed together; both hold the viewer total.
    grossSen: input.totalSen,
    createdAt: FieldValue.serverTimestamp(),
    succeededAt: input.status === 'succeeded' ? FieldValue.serverTimestamp() : null,
  };
}

/** Records a payment that produced no creator entitlement (failed, unfulfilled). */
export async function recordDonation(
  streamerId: StreamerId,
  input: DonationInput,
): Promise<string> {
  const ref = donationsCol(streamerId).doc();
  await ref.set(donationDocData(input));
  return ref.id;
}

// ─── Idempotent fulfilment ────────────────────────────────────────────────────

export type FulfilResult =
  | { fulfilled: false; reason: 'already_processed' }
  | { fulfilled: true; donationId: string; ledgerEntryId: string };

/**
 * Records a confirmed payment and credits the creator, exactly once.
 *
 * Claiming the provider event, writing the donation and appending the ledger
 * entry all commit in a single transaction. That is what makes redelivery
 * safe: a second callback for the same purchase finds the event document
 * already present and does nothing, so a creator can never be credited twice
 * for one payment.
 */
export async function fulfilPayment(params: {
  streamerId: StreamerId;
  providerEventId: string;
  provider: PaymentProvider;
  eventType: string;
  donation: DonationInput;
}): Promise<FulfilResult> {
  const { streamerId, providerEventId, provider, eventType, donation } = params;
  const eventRef = paymentEventDoc(streamerId, providerEventId);
  const donationRef = donationsCol(streamerId).doc();

  return adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(eventRef);
    if (existing.exists) return { fulfilled: false, reason: 'already_processed' as const };

    tx.set(donationRef, donationDocData(donation));

    // The creator is credited their full listed price. The platform fee was
    // charged to the viewer on top and never belonged to them.
    const ledgerEntryId = appendLedgerEntryTx(tx, streamerId, {
      type: 'earning',
      amountSen: donation.creatorEntitlementSen,
      donationId: donationRef.id,
      providerPaymentId: donation.providerPaymentId,
      description: donation.packageTitle
        ? `Payment for ${donation.packageTitle}`
        : 'Viewer donation',
    });

    tx.set(eventRef, {
      provider,
      type: eventType,
      donationId: donationRef.id,
      processedAt: FieldValue.serverTimestamp(),
    });

    return { fulfilled: true, donationId: donationRef.id, ledgerEntryId };
  });
}

/**
 * Claims a provider event without fulfilling it.
 *
 * Used for terminal non-payment events (failure, cancellation) that should
 * still only be recorded once.
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

// ─── Public alert projection ──────────────────────────────────────────────────

export interface PublicDonationAlert {
  id: string;
  donorName: string;
  amountSen: number;
  message: string | null;
  createdAtMs: number;
}

/** Returns only the small, stream-safe projection needed by an OBS alert. */
export async function getLatestPublicDonationAlert(
  streamerId: StreamerId,
): Promise<PublicDonationAlert | null> {
  const snap = await donationsCol(streamerId).orderBy('createdAt', 'desc').limit(10).get();
  const donation = snap.docs.find((doc) => {
    const data = doc.data();
    return data.status === 'succeeded' && Number(data.gamesAdded) === 0 && data.queueEntryId == null;
  });
  if (!donation) return null;

  const data = donation.data();
  return {
    id: donation.id,
    donorName: String(data.donorName || 'Anonymous supporter'),
    // The creator's listed price, not the fee-inclusive total — an alert
    // should show what the creator received.
    amountSen: Number(data.creatorEntitlementSen ?? data.baseSen ?? data.grossSen ?? 0),
    message:
      typeof data.message === 'string' && data.message.trim()
        ? data.message.trim().slice(0, 240)
        : null,
    createdAtMs: typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0,
  };
}

// ─── Earnings ─────────────────────────────────────────────────────────────────

export interface EarningsSummary {
  /** Total charged to viewers. */
  totalSen: number;
  /** MabarQueue's service fee, charged on top of the creator's price. */
  platformFeeSen: number;
  /** What creators are owed — the sum of their full listed prices. */
  creatorEntitlementSen: number;
  paymentCount: number;
}

/**
 * Aggregates successful payments since `since`.
 *
 * Reported from MabarQueue's own records; the creator's withdrawable balance
 * comes from the ledger, which is the authority for what is actually owed.
 */
export async function summariseEarnings(
  streamerId: StreamerId,
  since: Date | null,
): Promise<EarningsSummary> {
  let query = donationsCol(streamerId).where('status', '==', 'succeeded');
  if (since) query = query.where('createdAt', '>=', since);

  const snap = await query.get();
  let totalSen = 0;
  let platformFeeSen = 0;
  let creatorEntitlementSen = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const fee = Number(d.platformFeeSen ?? 0);
    // `totalSen`/`creatorEntitlementSen` are absent on records written under
    // the old deduct model, where `grossSen` was the viewer total and the
    // creator's share was gross minus the fee.
    const total = Number(d.totalSen ?? d.grossSen ?? 0);
    const entitlement = Number(d.creatorEntitlementSen ?? Math.max(0, total - fee));

    totalSen += total;
    platformFeeSen += fee;
    creatorEntitlementSen += entitlement;
  }

  return { totalSen, platformFeeSen, creatorEntitlementSen, paymentCount: snap.size };
}

/** Records that a streamer's public page may take payments. */
export async function setStreamerPayable(
  streamerId: StreamerId,
  payable: boolean,
): Promise<void> {
  await streamerDoc(streamerId).set(
    {
      status: payable ? 'active' : 'draft',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
