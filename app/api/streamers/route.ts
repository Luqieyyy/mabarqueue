import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '../../../lib/require-auth';
import { createStreamer, getStreamerByOwner } from '../../../lib/admin/streamers-repo';
import { DEFAULT_GAME, isAvailableGame } from '../../../lib/games';

// Reads per-request auth headers, so it must never be statically prerendered.
export const dynamic = 'force-dynamic';

/**
 * POST /api/streamers
 *
 * Creates the caller's streamer workspace and claims a slug.
 *
 * Requires `Authorization: Bearer <Firebase ID token>` — the workspace owner
 * is always taken from the verified token (`user.uid`), never from the
 * request body, so a client can't create a workspace on someone else's
 * behalf.
 */
export const POST = withAuth(async (req: NextRequest, user) => {
  if (!user.emailVerified || !user.email) {
    return NextResponse.json({ success: false, error: 'Verify your email before creating a creator profile.' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  const activeGame = body?.activeGame ?? DEFAULT_GAME;

  if (!displayName || displayName.length > 60) {
    return NextResponse.json({ success: false, error: 'Creator name must contain 1–60 characters.' }, { status: 400 });
  }
  if (!slug) {
    return NextResponse.json({ success: false, error: 'slug is required' }, { status: 400 });
  }
  if (!isAvailableGame(activeGame)) {
    return NextResponse.json({ success: false, error: 'Selected game is not available yet.' }, { status: 400 });
  }

  const result = await createStreamer(user.uid, displayName, slug, user.email, activeGame);

  if (!result.ok) {
    const status = result.reason === 'invalid-slug' || result.reason === 'invalid-name' ? 400 : 409;
    return NextResponse.json({ success: false, error: result.message, reason: result.reason }, { status });
  }

  return NextResponse.json({ success: true, streamer: result.streamer }, { status: 201 });
});

/**
 * GET /api/streamers
 *
 * Returns the caller's own streamer workspace, or 404 if they haven't
 * created one yet.
 */
export const GET = withAuth(async (_req: NextRequest, user) => {
  const streamer = await getStreamerByOwner(user.uid);
  if (!streamer) {
    return NextResponse.json({ success: false, error: 'No streamer workspace found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, streamer });
});
