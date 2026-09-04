import { NextRequest, NextResponse } from 'next/server';
import { getStreamerBySlug } from '../../../../lib/admin/streamers-repo';
import { listPublicPackages } from '../../../../lib/admin/packages-repo';
import { listQueue } from '../../../../lib/admin/queue-repo';
import { getGameDefinition } from '../../../../lib/games';
import type { PublicQueueEntry } from '../../../../lib/domain/types';

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
 * `ownerUid`, Stripe account IDs, `platformFeeBps`, donation records,
 * payment IDs, and each entry's game-specific `playerId` — the last of which
 * the legacy `/overlay` page exposes to anyone who can read the queue.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const streamer = await getStreamerBySlug(slug);
  if (!streamer || streamer.status === 'suspended') {
    return NextResponse.json({ success: false, error: 'Streamer not found' }, { status: 404 });
  }

  const [packages, queue] = await Promise.all([
    listPublicPackages(streamer.streamerId),
    listQueue(streamer.streamerId, streamer.activeGame),
  ]);

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
        acceptingPayments: streamer.status === 'active' && streamer.stripeChargesEnabled,
      },
      game: { id: gameDef.id, label: gameDef.label, idLabel: gameDef.idLabel, slotCount: gameDef.slotCount },
      packages,
      playing: queue.filter((e) => e.status === 'playing').map(project),
      waiting: queue.filter((e) => e.status === 'waiting').map(project),
      hutang: queue.filter((e) => e.status === 'skipped').map(project),
    },
    {
      // The overlay polls this; a short cache keeps Firestore reads bounded
      // without making the stream visibly stale.
      headers: { 'Cache-Control': 'public, max-age=2, stale-while-revalidate=5' },
    },
  );
}
