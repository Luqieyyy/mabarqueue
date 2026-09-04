import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '../../../../lib/stripe/client';
import { CONNECT_CURRENCY } from '../../../../lib/stripe/connect';
import { getStreamerBySlug } from '../../../../lib/admin/streamers-repo';
import { getPackage } from '../../../../lib/admin/packages-repo';
import { resolvePlatformFee, savePaymentAttempt } from '../../../../lib/admin/payments-repo';
import { MIN_PAYMENT_SEN } from '../../../../lib/domain/config';
import { getGameDefinition } from '../../../../lib/games';
import { logEvent } from '../../../../lib/observability';

/**
 * POST /api/payments/create
 *
 * Creates a Stripe Checkout Session for a viewer buying a package.
 *
 * This is the most security-sensitive route in the application, so every
 * monetary value is derived server-side:
 *
 *   - the client sends only `{ slug, packageId, ign, donorName? }`
 *   - the price and game count come from the package document in Firestore
 *   - the platform fee comes from the streamer document (or the platform
 *     default), computed with integer arithmetic
 *
 * An `amount` or `games` value in the request body is ignored entirely.
 *
 * The charge is a **direct charge** on the streamer's connected account
 * (`stripeAccount` option) with `application_fee_amount` as MabarQueue's cut,
 * so the streamer is merchant of record and viewer funds never pass through
 * the platform's own balance.
 */
export async function POST(req: NextRequest) {
  try {
    // ─── Safety gate ─────────────────────────────────────────────────────
    // Game credits are granted by the Stripe webhook, which cannot verify
    // signatures without STRIPE_WEBHOOK_SECRET. Taking a payment while it's
    // unset would charge the viewer and grant nothing, so checkout is
    // refused outright rather than risking money-in/nothing-out.
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      logEvent('stripe_checkout_blocked', { reason: 'webhook_secret_not_configured' });
      return NextResponse.json(
        { success: false, error: 'Payments are not enabled yet. Please try again later.' },
        { status: 503 },
      );
    }

    const body = await req.json().catch(() => null);

    const slug = typeof body?.slug === 'string' ? body.slug : '';
    const packageId = typeof body?.packageId === 'string' ? body.packageId : '';
    const ign = typeof body?.ign === 'string' ? body.ign.trim() : '';
    const donorNameRaw = typeof body?.donorName === 'string' ? body.donorName.trim() : '';

    if (!slug || !packageId) {
      return NextResponse.json(
        { success: false, error: 'slug and packageId are required' },
        { status: 400 },
      );
    }
    if (!ign) {
      return NextResponse.json({ success: false, error: 'IGN is required' }, { status: 400 });
    }
    if (ign.length > 60) {
      return NextResponse.json({ success: false, error: 'IGN is too long' }, { status: 400 });
    }

    // ─── Resolve streamer and confirm they can actually be paid ──────────
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) {
      return NextResponse.json({ success: false, error: 'Streamer not found' }, { status: 404 });
    }
    if (!streamer.stripeAccountId || !streamer.stripeChargesEnabled) {
      return NextResponse.json(
        { success: false, error: 'This streamer is not accepting payments yet.' },
        { status: 409 },
      );
    }
    if (streamer.status === 'suspended') {
      return NextResponse.json({ success: false, error: 'Streamer unavailable' }, { status: 403 });
    }

    // ─── Authoritative package lookup, scoped to this streamer ───────────
    // Scoping by streamerId is what prevents a packageId from another
    // workspace being used to buy at a different price.
    const pkg = await getPackage(streamer.streamerId, packageId);
    if (!pkg) {
      return NextResponse.json({ success: false, error: 'Package not found' }, { status: 404 });
    }
    if (!pkg.enabled) {
      return NextResponse.json(
        { success: false, error: 'This package is no longer available.' },
        { status: 409 },
      );
    }
    if (pkg.priceSen < MIN_PAYMENT_SEN) {
      return NextResponse.json(
        { success: false, error: 'This package is not purchasable.' },
        { status: 409 },
      );
    }

    // ─── Server-side fee calculation ─────────────────────────────────────
    const fee = resolvePlatformFee(pkg.priceSen, streamer.platformFeeBps);

    // Stripe requires the application fee to be strictly less than the charge.
    const applicationFeeSen = Math.min(fee.platformFeeSen, Math.max(0, fee.grossSen - 1));

    const origin = req.nextUrl.origin;
    const gameDef = getGameDefinition(streamer.activeGame);

    const session = await stripe().checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: CONNECT_CURRENCY,
              unit_amount: pkg.priceSen,
              product_data: {
                name: pkg.title,
                description:
                  pkg.description ||
                  `${pkg.games} game${pkg.games === 1 ? '' : 's'} with ${streamer.displayName}`,
              },
            },
          },
        ],
        payment_intent_data: {
          application_fee_amount: applicationFeeSen,
        },
        // Only identifiers go to Stripe — the IGN and player ID stay in our
        // own payment_attempts record, keyed by session ID.
        metadata: {
          streamerId: streamer.streamerId,
          packageId: pkg.packageId,
        },
        success_url: `${origin}/streamer/${streamer.slug}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/streamer/${streamer.slug}?cancelled=1`,
      },
      // Direct charge: created on the connected account.
      { stripeAccount: streamer.stripeAccountId },
    );

    // Parse a game-specific player ID out of the IGN field if present, using
    // the streamer's active game parser (e.g. a Mobile Legends numeric ID).
    const parsed = gameDef.parseMessage(ign);

    await savePaymentAttempt(session.id, {
      streamerId: streamer.streamerId,
      packageId: pkg.packageId,
      packageTitle: pkg.title,
      priceSen: pkg.priceSen,
      games: pkg.games,
      feeBps: fee.feeBps,
      platformFeeSen: applicationFeeSen,
      ign: parsed?.ign || ign,
      playerId: parsed?.player_id ?? null,
      donorName: donorNameRaw || parsed?.ign || ign,
      game: streamer.activeGame,
    });

    return NextResponse.json({ success: true, url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[payments/create] Error:', err);
    return NextResponse.json({ success: false, error: 'Could not start checkout' }, { status: 500 });
  }
}
