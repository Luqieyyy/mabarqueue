import { NextRequest, NextResponse } from 'next/server';
import { ChipError, chipConfigured, createPurchase } from '../../../../lib/chip/client';
import { getStreamerBySlug } from '../../../../lib/admin/streamers-repo';
import { getPackage } from '../../../../lib/admin/packages-repo';
import { resolveCheckoutAmounts, savePaymentAttempt } from '../../../../lib/admin/payments-repo';
import { MIN_PAYMENT_SEN } from '../../../../lib/domain/config';
import { getGameDefinition } from '../../../../lib/games';
import { formatSen, toSen } from '../../../../lib/domain/money';
import { logEvent, logFailure } from '../../../../lib/observability';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payments/create
 *
 * Creates a CHIP purchase for a viewer and returns the hosted checkout URL.
 *
 * The most security-sensitive route in the application, so every monetary
 * value is derived server-side:
 *
 *   - the client sends only `{ slug, packageId | amountSen, ign, donorName? }`
 *   - the creator's price comes from the package document in Firestore
 *   - the platform fee comes from the streamer document (or the default)
 *
 * An `amount`, `total` or `games` value in the request body is ignored for
 * package purchases. Fees are shown as their own CHIP line item so the viewer
 * sees exactly what they're paying and why.
 */
export async function POST(req: NextRequest) {
  try {
    if (!chipConfigured()) {
      logEvent('chip_checkout_blocked', { reason: 'chip_not_configured' });
      return NextResponse.json(
        { success: false, error: 'Payments are not enabled yet. Please try again later.' },
        { status: 503 },
      );
    }

    const body = await req.json().catch(() => null);

    const slug = typeof body?.slug === 'string' ? body.slug : '';
    const packageId = typeof body?.packageId === 'string' ? body.packageId : '';
    const kind = body?.kind === 'donation' ? 'donation' : 'mabar';
    const ign = typeof body?.ign === 'string' ? body.ign.trim() : '';
    const donorNameRaw = typeof body?.donorName === 'string' ? body.donorName.trim() : '';
    const emailRaw = typeof body?.email === 'string' ? body.email.trim() : '';
    const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 240) : '';
    const donationAmountSen = Number.isInteger(body?.amountSen) ? Number(body.amountSen) : 0;

    if (!slug || (kind === 'mabar' && !packageId)) {
      return NextResponse.json(
        { success: false, error: 'slug and packageId are required' },
        { status: 400 },
      );
    }
    if (kind === 'mabar' && !ign) {
      return NextResponse.json({ success: false, error: 'IGN is required' }, { status: 400 });
    }
    if (ign.length > 60 || donorNameRaw.length > 60) {
      return NextResponse.json({ success: false, error: 'Name is too long' }, { status: 400 });
    }

    // ─── Resolve streamer ────────────────────────────────────────────────
    const streamer = await getStreamerBySlug(slug);
    if (!streamer) {
      return NextResponse.json({ success: false, error: 'Streamer not found' }, { status: 404 });
    }
    if (streamer.status === 'suspended') {
      return NextResponse.json({ success: false, error: 'Streamer unavailable' }, { status: 403 });
    }

    // ─── Authoritative price, scoped to this streamer ────────────────────
    // Scoping the package lookup by streamerId is what stops a packageId from
    // another workspace being used to buy at a different price.
    const pkg = kind === 'mabar' ? await getPackage(streamer.streamerId, packageId) : null;
    if (kind === 'mabar' && !pkg) {
      return NextResponse.json({ success: false, error: 'Package not found' }, { status: 404 });
    }
    if (pkg && !pkg.enabled) {
      return NextResponse.json(
        { success: false, error: 'This package is no longer available.' },
        { status: 409 },
      );
    }

    const basePriceSen = kind === 'donation' ? donationAmountSen : pkg!.priceSen;
    if (!Number.isInteger(basePriceSen) || basePriceSen < MIN_PAYMENT_SEN || basePriceSen > 10_000_000) {
      return NextResponse.json({ success: false, error: 'Invalid amount.' }, { status: 400 });
    }

    // ─── Server-side amounts ─────────────────────────────────────────────
    const amounts = resolveCheckoutAmounts(basePriceSen, streamer.platformFeeBps);

    const origin = req.nextUrl.origin;
    const gameDef = getGameDefinition(streamer.activeGame);
    const parsed = kind === 'mabar' ? gameDef.parseMessage(ign) : null;

    const baseLabel =
      kind === 'donation' ? `Support ${streamer.displayName}` : `${pkg!.title} — ${streamer.displayName}`;

    // The fee is its own line so the viewer can see the breakdown on CHIP's
    // hosted page rather than being shown one opaque total.
    const products = [{ name: baseLabel, price: amounts.baseSen }];
    if (amounts.platformFeeSen > 0) {
      products.push({ name: 'MabarQueue service fee', price: amounts.platformFeeSen });
    }

    const purchase = await createPurchase({
      // CHIP requires a client email. Viewers aren't asked to register, so a
      // supplied address is used when present and CHIP collects one on its
      // own hosted page otherwise.
      email: emailRaw || 'viewer@mabarqueue.com',
      fullName: donorNameRaw || parsed?.ign || ign || undefined,
      products,
      reference: `${streamer.streamerId}:${kind}`,
      successRedirect: `${origin}/streamer/${streamer.slug}?${kind === 'donation' ? 'donated' : 'paid'}=1`,
      failureRedirect: `${origin}/streamer/${streamer.slug}?failed=1`,
      cancelRedirect: `${origin}/streamer/${streamer.slug}?cancelled=1`,
      successCallback: `${origin}/api/webhooks/chip`,
      metadata: { streamerId: streamer.streamerId, kind },
    });

    // Persist the authoritative amounts keyed by the purchase ID, so the
    // callback never has to trust anything echoed back to it.
    await savePaymentAttempt(purchase.id, {
      kind,
      streamerId: streamer.streamerId,
      packageId: pkg?.packageId ?? null,
      packageTitle: pkg?.title ?? (kind === 'donation' ? 'Donation' : null),
      baseSen: amounts.baseSen,
      platformFeeSen: amounts.platformFeeSen,
      processingFeeSen: amounts.processingFeeSen,
      totalSen: amounts.totalSen,
      creatorEntitlementSen: amounts.creatorEntitlementSen,
      platformNetSen: amounts.platformNetSen,
      feeBps: amounts.feeBps,
      games: pkg?.games ?? 0,
      ign: kind === 'mabar' ? parsed?.ign || ign : '',
      playerId: kind === 'mabar' ? (parsed?.player_id ?? null) : null,
      donorName: donorNameRaw || parsed?.ign || ign || 'Anonymous supporter',
      message: kind === 'donation' ? message : null,
      game: streamer.activeGame,
    });

    logEvent('chip_purchase_created', {
      streamerId: streamer.streamerId,
      purchaseId: purchase.id,
      kind,
      totalSen: amounts.totalSen,
      isTest: purchase.is_test,
    });

    return NextResponse.json({
      success: true,
      url: purchase.checkout_url,
      purchaseId: purchase.id,
      // Returned so the UI can show the breakdown before redirecting.
      breakdown: {
        baseSen: amounts.baseSen,
        platformFeeSen: amounts.platformFeeSen,
        totalSen: amounts.totalSen,
        baseFormatted: formatSen(toSen(amounts.baseSen)),
        platformFeeFormatted: formatSen(toSen(amounts.platformFeeSen)),
        totalFormatted: formatSen(toSen(amounts.totalSen)),
      },
    });
  } catch (err) {
    logFailure('chip_purchase_failed', err, {});
    if (err instanceof ChipError) {
      // Safe message only — CHIP's raw error stays in the server log.
      return NextResponse.json(
        { success: false, error: 'Could not start checkout. Please try again.' },
        { status: err.status },
      );
    }
    return NextResponse.json({ success: false, error: 'Could not start checkout' }, { status: 500 });
  }
}
