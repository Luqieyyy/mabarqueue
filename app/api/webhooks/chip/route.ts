import { NextRequest, NextResponse } from 'next/server';
import {
  CHIP_SIGNATURE_HEADER,
  verifyChipSignature,
} from '../../../../lib/chip/signature';
import { getCompanyPublicKey, getPurchase, type ChipPurchase } from '../../../../lib/chip/client';
import {
  claimPaymentEvent,
  fulfilPayment,
  getPaymentAttempt,
} from '../../../../lib/admin/payments-repo';
import { grantCreditsAndPlace } from '../../../../lib/admin/queue-repo';
import { formatOrderDate } from '../../../../lib/admin/webhook-repo';
import { logEvent, logFailure } from '../../../../lib/observability';
import type { StreamerId } from '../../../../lib/domain/ids';

/**
 * POST /api/webhooks/chip
 *
 * CHIP `success_callback` receiver — the only authoritative confirmation that
 * a viewer actually paid. The browser redirect back to the success page is
 * never treated as proof; a viewer can navigate straight to it.
 *
 * Three independent guards before anything is credited:
 *
 *   1. The `X-Signature` header must verify as an RSA-SHA256 signature of the
 *      raw body against CHIP's company public key.
 *   2. The purchase is re-read from CHIP by ID, so fulfilment depends on
 *      CHIP's own view of the status rather than the delivered body.
 *   3. Amounts come from our stored payment attempt, not from the callback.
 *
 * Fulfilment is idempotent: the CHIP purchase ID is the event key, so a
 * redelivery is a no-op.
 */

// The raw body is required for signature verification, so this must never be
// statically analysed or cached.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Must be the exact bytes CHIP signed — never a re-serialised object.
  const rawBody = await req.text();
  const signature = req.headers.get(CHIP_SIGNATURE_HEADER);

  // ─── 1. Verify the signature ──────────────────────────────────────────
  let publicKey: string | null = null;
  try {
    publicKey = await getCompanyPublicKey();
  } catch (err) {
    logFailure('chip_callback_failed', err, { step: 'fetch_public_key' });
    // Fail closed, but with a 500 so CHIP retries — an unreachable key is a
    // transient fault on our side, not an invalid payload.
    return NextResponse.json({ error: 'Cannot verify callback' }, { status: 500 });
  }

  const verdict = verifyChipSignature(rawBody, signature, publicKey);
  if (!verdict.valid) {
    logEvent('chip_callback_rejected', { reason: verdict.reason });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: { id?: string; status?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Malformed payload' }, { status: 400 });
  }

  const purchaseId = typeof payload.id === 'string' ? payload.id : '';
  if (!purchaseId) {
    return NextResponse.json({ error: 'Missing purchase id' }, { status: 400 });
  }

  try {
    // ─── 2. Re-read the purchase from CHIP ──────────────────────────────
    const purchase = await getPurchase(purchaseId);
    const streamerId = resolveStreamerId(purchase);

    if (!streamerId) {
      logEvent('chip_callback_rejected', { reason: 'no_streamer_metadata', purchaseId });
      // Acknowledged: retrying will not make the metadata appear.
      return NextResponse.json({ received: true });
    }

    if (purchase.status === 'paid') {
      await handlePaid(streamerId, purchase);
    } else if (
      purchase.status === 'error' ||
      purchase.status === 'cancelled' ||
      purchase.status === 'expired'
    ) {
      await handleUnsuccessful(streamerId, purchase);
    } else {
      // pending_* / created / hold — nothing is owed yet. CHIP will call
      // again when the purchase reaches a terminal state.
      logEvent('chip_callback_ignored', { purchaseId, status: purchase.status });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    // A 500 makes CHIP retry, which is safe because fulfilment is idempotent.
    logFailure('chip_callback_failed', err, { purchaseId });
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }
}

/**
 * Credits the creator and places the viewer, exactly once.
 *
 * The queue placement happens only after fulfilment wins the idempotency
 * race, so a redelivered callback cannot add the same viewer twice.
 */
async function handlePaid(streamerId: StreamerId, purchase: ChipPurchase): Promise<void> {
  const attempt = await getPaymentAttempt(streamerId, purchase.id);

  if (!attempt) {
    // Paid, but we have no record of what it was for — log it for manual
    // reconciliation rather than guessing an entitlement.
    logEvent('chip_callback_unfulfilled', { purchaseId: purchase.id, reason: 'no_attempt' });
    await fulfilPayment({
      streamerId,
      providerEventId: purchase.id,
      provider: 'chip',
      eventType: 'purchase.paid',
      donation: {
        provider: 'chip',
        providerPaymentId: purchase.id,
        packageId: null,
        packageTitle: null,
        baseSen: 0,
        platformFeeSen: 0,
        processingFeeSen: 0,
        totalSen: Number(purchase.purchase?.total ?? 0),
        // No entitlement is credited without a known base price.
        creatorEntitlementSen: 0,
        platformNetSen: 0,
        feeBps: 0,
        gamesAdded: 0,
        ign: null,
        playerId: null,
        donorName: 'Unknown',
        message: null,
        status: 'unfulfilled',
        failureReason: 'missing_payment_attempt',
        game: 'ml',
        queueEntryId: null,
      },
    });
    return;
  }

  // Only mabar purchases produce a queue entry; a plain donation does not.
  let queueEntryId: string | null = null;

  const result = await fulfilPayment({
    streamerId,
    providerEventId: purchase.id,
    provider: 'chip',
    eventType: 'purchase.paid',
    donation: {
      provider: 'chip',
      providerPaymentId: purchase.id,
      packageId: attempt.packageId,
      packageTitle: attempt.packageTitle,
      baseSen: attempt.baseSen,
      platformFeeSen: attempt.platformFeeSen,
      processingFeeSen: attempt.processingFeeSen,
      totalSen: attempt.totalSen,
      creatorEntitlementSen: attempt.creatorEntitlementSen,
      platformNetSen: attempt.platformNetSen,
      feeBps: attempt.feeBps,
      gamesAdded: attempt.kind === 'mabar' ? attempt.games : 0,
      ign: attempt.ign || null,
      playerId: attempt.playerId,
      donorName: attempt.donorName,
      message: attempt.message,
      status: 'succeeded',
      failureReason: null,
      game: attempt.game,
      queueEntryId: null,
    },
  });

  if (!result.fulfilled) {
    logEvent('chip_callback_duplicate', { purchaseId: purchase.id });
    return;
  }

  if (attempt.kind === 'mabar' && attempt.games > 0) {
    const placement = await grantCreditsAndPlace({
      streamerId,
      game: attempt.game,
      displayName: attempt.donorName,
      ign: attempt.ign,
      playerId: attempt.playerId,
      games: attempt.games,
      orderDate: formatOrderDate(),
      providerPaymentId: purchase.id,
    });
    queueEntryId = placement.entryId;
  }

  logEvent('chip_payment_fulfilled', {
    streamerId,
    purchaseId: purchase.id,
    kind: attempt.kind,
    creatorEntitlementSen: attempt.creatorEntitlementSen,
    platformFeeSen: attempt.platformFeeSen,
    queueEntryId,
  });
}

/** Records a terminal failure once, crediting nobody. */
async function handleUnsuccessful(
  streamerId: StreamerId,
  purchase: ChipPurchase,
): Promise<void> {
  const claimed = await claimPaymentEvent(
    streamerId,
    `${purchase.id}:${purchase.status}`,
    'chip',
    `purchase.${purchase.status}`,
  );
  if (!claimed) return;

  logEvent('chip_payment_unsuccessful', { purchaseId: purchase.id, status: purchase.status });
}

/**
 * Recovers our streamer ID from the purchase.
 *
 * Set in metadata at creation, with the `reference` (`<streamerId>:<kind>`)
 * as a fallback.
 */
function resolveStreamerId(purchase: ChipPurchase): StreamerId | null {
  const metadata = (purchase.purchase as { metadata?: Record<string, unknown> })?.metadata;
  const fromMetadata = metadata?.streamerId;
  if (typeof fromMetadata === 'string' && fromMetadata) return fromMetadata as StreamerId;

  const reference = purchase.reference ?? '';
  const [streamerId] = reference.split(':');
  return streamerId ? (streamerId as StreamerId) : null;
}
