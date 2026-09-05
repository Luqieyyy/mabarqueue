import { NextRequest, NextResponse } from 'next/server';
import { getStreamerBySlug } from '../../../../lib/admin/streamers-repo';
import { listPublicPackages } from '../../../../lib/admin/packages-repo';
import { resolveCheckoutAmounts } from '../../../../lib/admin/payments-repo';
import { listQueue } from '../../../../lib/admin/queue-repo';
import { getGameDefinition } from '../../../../lib/games';
import type { PublicQueueEntry } from '../../../../lib/domain/types';
import { getLatestPublicDonationAlert } from '../../../../lib/admin/payments-repo';
import { getLatestLegacyDonationAlert } from '../../../../lib/admin/webhook-repo';

// Resolves a per-request slug against Firestore, so it must not be prerendered.
export const dynamic = 'force-dynamic';

/**
 * GET /api/public/:slug
 *
 * Everything a public page needs in one call: profile, purchasable packages,
 * and the live queue. Backs `/streamer/[slug]`, `/queue/[slug]` and
 * `/overlay/[slug]`.
 *
 * Only public-safe fields are returned. Deliberately withheld:
 * `ownerUid`, `platformFeeBps`, donation records,
 * payment IDs, and each entry's game-specific `playerId` — the last of which
 * the legacy `/overlay` page exposes to anyone who can read the queue.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const streamer = await getStreamerBySlug(slug);
  if (!streamer || streamer.status === 'suspended') {
    return NextResponse.json({ success: false, error: 'Streamer not found' }, { status: 404 });
  }

  const [packages, queue, chipDonationAlert, sociabuzzDonationAlert] = await Promise.all([
    listPublicPackages(streamer.streamerId),
    listQueue(streamer.streamerId, streamer.activeGame),
    getLatestPublicDonationAlert(streamer.streamerId),
    streamer.legacyUsername ? getLatestLegacyDonationAlert(streamer.legacyUsername) : Promise.resolve(null),
  ]);
  const donationAlert = [chipDonationAlert, sociabuzzDonationAlert]
    .filter((alert): alert is NonNullable<typeof chipDonationAlert> => alert !== null)
    .sort((a, b) => b.createdAtMs - a.createdAtMs)[0] ?? null;

  const project = (e: (typeof queue)[number]): PublicQueueEntry => ({
    entryId: e.entryId,
    ign: e.ign,
    totalGames: e.totalGames,
    gamesLeft: e.gamesLeft,
    status: e.status,
    orderDate: e.orderDate,
    seq: e.seq,
  });

  const gameDef = getGameDefinition(streamer.activeGame);

  // Each package carries its own computed total so the viewer sees exactly
  // what they will be charged. The service fee is added on top of the
  // creator's price, so it is a viewer-facing amount and must be visible —
  // the underlying rate config still isn't exposed.
  const pricedPackages = packages.map((p) => {
    const amounts = resolveCheckoutAmounts(p.priceSen, streamer.platformFeeBps);
    return {
      ...p,
      platformFeeSen: amounts.platformFeeSen,
      totalSen: amounts.totalSen,
    };
  });

  return NextResponse.json(
    {
      success: true,
      streamer: {
        streamerId: streamer.streamerId,
        displayName: streamer.displayName,
        slug: streamer.slug,
        avatarUrl: streamer.avatarUrl,
        bio: streamer.bio,
        activeGame: streamer.activeGame,
        // Suspended streamers already returned 404 above.
    acceptingPayments: true,
      },
      game: { id: gameDef.id, label: gameDef.label, idLabel: gameDef.idLabel, slotCount: gameDef.slotCount },
      packages: pricedPackages,
      playing: queue.filter((e) => e.status === 'playing').map(project),
      waiting: queue.filter((e) => e.status === 'waiting').map(project),
      hutang: queue.filter((e) => e.status === 'skipped').map(project),
      donationAlert,
    },
    {
      // The overlay polls this; a short cache keeps Firestore reads bounded
      // without making the stream visibly stale.
      headers: { 'Cache-Control': 'public, max-age=2, stale-while-revalidate=5' },
    },
  );
}
