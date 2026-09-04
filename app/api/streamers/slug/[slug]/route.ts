import { NextRequest, NextResponse } from 'next/server';
import { getStreamerBySlug } from '../../../../../lib/admin/streamers-repo';
import type { PublicStreamer } from '../../../../../lib/domain/types';

/**
 * GET /api/streamers/slug/:slug
 *
 * Public lookup — the resolver behind `/streamer/[slug]`, `/queue/[slug]` and
 * `/overlay/[slug]` once those pages exist (Phase 8). No auth required, and
 * only public-safe fields are returned: never `ownerUid`, Stripe references,
 * or `platformFeeBps`.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const streamer = await getStreamerBySlug(slug);

  if (!streamer || streamer.status === 'suspended') {
    return NextResponse.json({ success: false, error: 'Streamer not found' }, { status: 404 });
  }

  const publicStreamer: PublicStreamer = {
    streamerId: streamer.streamerId,
    displayName: streamer.displayName,
    slug: streamer.slug,
    avatarUrl: streamer.avatarUrl,
    bio: streamer.bio,
    activeGame: streamer.activeGame,
    acceptingPayments: streamer.status === 'active' && streamer.stripeChargesEnabled,
  };

  return NextResponse.json({ success: true, streamer: publicStreamer });
}
