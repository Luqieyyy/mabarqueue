import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '../../../lib/require-auth';
import { createStreamer, getStreamerByOwner } from '../../../lib/admin/streamers-repo';

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
  const body = await req.json().catch(() => null);
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  const slug = typeof body?.slug === 'string' ? body.slug : '';

  if (!displayName) {
    return NextResponse.json({ success: false, error: 'displayName is required' }, { status: 400 });
  }
  if (!slug) {
    return NextResponse.json({ success: false, error: 'slug is required' }, { status: 400 });
  }

  const result = await createStreamer(user.uid, displayName, slug);

  if (!result.ok) {
    const status = result.reason === 'already-has-streamer' ? 409 : 400;
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
