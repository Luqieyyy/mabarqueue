import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '../../../../lib/stripe/client';
import { capabilityFlagsFrom } from '../../../../lib/stripe/connect';
import {
  attachDonationToEvent,
  claimPaymentEvent,
  getPaymentAttempt,
  recordDonation,
  saveStripeFlags,
} from '../../../../lib/admin/payments-repo';
import { grantCreditsAndPlace } from '../../../../lib/admin/queue-repo';
import { getStreamerByStripeAccount } from '../../../../lib/admin/streamers-repo';
import { formatOrderDate } from '../../../../lib/admin/webhook-repo';
import type { StreamerId } from '../../../../lib/domain/ids';

/**
 * POST /api/webhooks/stripe
 *
 * Stripe webhook receiver.
 *
 * This must be registered as a **Connect** webhook endpoint ("Events from:
 * Connected accounts"). Because MabarQueue uses direct charges, the
 * PaymentIntent and Checkout Session live on the *connected* account, so
 * those events are delivered with a top-level `account` property naming the
 * streamer's Stripe account — not on the platform's own event scope.
 *
 * Events handled:
 *
 *   checkout.session.completed              → fulfil if payment_status is 'paid'
 *   checkout.session.async_payment_succeeded → fulfil (delayed methods)
 *   checkout.session.async_payment_failed    → record the failure
 *   account.updated                          → refresh capability flags
 *
 * FPX gives immediate notification, so `completed` normally arrives already
 * paid; the async events are handled anyway so the integration stays correct
 * if a delayed-notification method is ever enabled.
 */

// The raw body is required for signature verification, so this route must not
// be statically analysed/cached.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  // Must be the exact bytes Stripe signed — never a re-serialised JSON object.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    // An unverifiable payload is rejected outright: this is the only thing
    // standing between a forged request and granted game credits.
    console.error('[stripe/webhook] Signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        // A completed session is not necessarily a *paid* session.
        if (session.payment_status !== 'paid') {
          console.log(`[stripe/webhook] Session ${session.id} completed but unpaid — waiting`);
          return NextResponse.json({ received: true });
        }
        await fulfil(event, session);
        break;
      }

      case 'checkout.session.async_payment_succeeded':
        await fulfil(event, event.data.object);
        break;

      case 'checkout.session.async_payment_failed':
        await recordFailure(event, event.data.object);
        break;

      case 'account.updated': {
        const account = event.data.object;
        const streamer = await getStreamerByStripeAccount(account.id);
        if (streamer) {
          await saveStripeFlags(streamer.streamerId, capabilityFlagsFrom(account));
          console.log(`[stripe/webhook] Updated capabilities for ${streamer.slug}`);
        }
        break;
      }

      default:
        // Unhandled types are acknowledged so Stripe stops retrying them.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    // A 500 makes Stripe retry, which is what we want for a transient
    // failure — the idempotency guard makes the retry safe.
    console.error(`[stripe/webhook] Error handling ${event.type}:`, err);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }
}

/**
 * Grants credits for a paid Checkout Session, exactly once.
 *
 * `claimPaymentEvent` is the idempotency gate: it transactionally records the
 * Stripe event ID and returns false if this event was already processed, so a
 * redelivery can never double-grant.
 */
async function fulfil(event: Stripe.Event, session: Stripe.Checkout.Session): Promise<void> {
  const streamerId = resolveStreamerId(session);
  if (!streamerId) {
    console.error(`[stripe/webhook] Session ${session.id} has no streamerId metadata`);
    return;
  }

  const claimed = await claimPaymentEvent(streamerId, event.id, 'stripe', event.type);
  if (!claimed) {
    console.log(`[stripe/webhook] Event ${event.id} already processed — ignoring`);
    return;
  }

  const attempt = await getPaymentAttempt(streamerId, session.id);
  if (!attempt) {
    // Without the attempt record there's no authoritative game count to
    // grant, so the payment is logged for reconciliation rather than guessed.
    console.error(`[stripe/webhook] No payment attempt for session ${session.id}`);
    await recordDonation(streamerId, {
      provider: 'stripe',
      providerPaymentId: paymentIntentId(session),
      packageId: null,
      packageTitle: null,
      grossSen: session.amount_total ?? 0,
      platformFeeSen: 0,
      feeBps: 0,
      gamesAdded: 0,
      ign: null,
      playerId: null,
      donorName: session.customer_details?.name ?? 'Unknown',
      message: null,
      status: 'unfulfilled',
      failureReason: 'missing_payment_attempt',
      game: 'ml',
      queueEntryId: null,
    });
    return;
  }

  const placement = await grantCreditsAndPlace({
    streamerId,
    game: attempt.game,
    displayName: attempt.donorName,
    ign: attempt.ign,
    playerId: attempt.playerId,
    games: attempt.games,
    orderDate: formatOrderDate(),
    providerPaymentId: paymentIntentId(session) ?? session.id,
  });

  const donationId = await recordDonation(streamerId, {
    provider: 'stripe',
    providerPaymentId: paymentIntentId(session),
    packageId: attempt.packageId,
    packageTitle: attempt.packageTitle,
    // Trust the attempt record over the session for the amounts we computed,
    // but prefer Stripe's own total as the gross actually charged.
    grossSen: session.amount_total ?? attempt.priceSen,
    platformFeeSen: attempt.platformFeeSen,
    feeBps: attempt.feeBps,
    gamesAdded: attempt.games,
    ign: attempt.ign,
    playerId: attempt.playerId,
    donorName: attempt.donorName,
    message: null,
    status: 'succeeded',
    failureReason: null,
    game: attempt.game,
    queueEntryId: placement.entryId,
  });

  await attachDonationToEvent(streamerId, event.id, donationId);

  console.log(
    `[stripe/webhook] ✓ ${attempt.donorName} → "${attempt.ign}" ` +
      `(${attempt.games} games, ${placement.kind}, session ${session.id})`,
  );
}

async function recordFailure(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const streamerId = resolveStreamerId(session);
  if (!streamerId) return;

  const claimed = await claimPaymentEvent(streamerId, event.id, 'stripe', event.type);
  if (!claimed) return;

  const attempt = await getPaymentAttempt(streamerId, session.id);

  await recordDonation(streamerId, {
    provider: 'stripe',
    providerPaymentId: paymentIntentId(session),
    packageId: attempt?.packageId ?? null,
    packageTitle: attempt?.packageTitle ?? null,
    grossSen: session.amount_total ?? attempt?.priceSen ?? 0,
    platformFeeSen: 0,
    feeBps: attempt?.feeBps ?? 0,
    gamesAdded: 0,
    ign: attempt?.ign ?? null,
    playerId: attempt?.playerId ?? null,
    donorName: attempt?.donorName ?? session.customer_details?.name ?? 'Unknown',
    message: null,
    status: 'failed',
    failureReason: 'async_payment_failed',
    game: attempt?.game ?? 'ml',
    queueEntryId: null,
  });

  console.warn(`[stripe/webhook] Payment failed for session ${session.id}`);
}

function resolveStreamerId(session: Stripe.Checkout.Session): StreamerId | null {
  const id = session.metadata?.streamerId;
  return id ? (id as StreamerId) : null;
}

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent;
  if (!pi) return null;
  return typeof pi === 'string' ? pi : pi.id;
}
