import { NextRequest, NextResponse } from 'next/server';
import { withStreamer } from '../../../lib/require-streamer';
import {
  adjustCredits,
  finishGame,
  listQueue,
  rejoinFromHutang,
  removePlayer,
  skipPlayer,
} from '../../../lib/admin/queue-repo';

// Reads per-request auth headers, so it must never be statically prerendered.
export const dynamic = 'force-dynamic';

/**
 * GET /api/game — the caller's queue for their active game.
 */
export const GET = withStreamer(async (_req: NextRequest, { streamer }) => {
  const queue = await listQueue(streamer.streamerId, streamer.activeGame);
  return NextResponse.json({ success: true, queue, activeGame: streamer.activeGame });
});

/**
 * POST /api/game — perform a queue action.
 *
 * Body: `{ action, entryId?, delta? }`
 *
 * All queue mutation runs here rather than in the browser, so the transaction
 * boundaries in `lib/admin/queue-repo.ts` actually protect the invariants. A
 * signed-in streamer's browser can no longer write arbitrary credit values
 * straight to Firestore.
 */
export const POST = withStreamer(async (req: NextRequest, { streamer }) => {
  const body = await req.json().catch(() => null);
  const action = typeof body?.action === 'string' ? body.action : '';
  const entryId = typeof body?.entryId === 'string' ? body.entryId : '';
  const game = streamer.activeGame;
  const sid = streamer.streamerId;

  const needsEntry = () => {
    if (!entryId) throw new BadRequest('entryId is required for this action');
    return entryId;
  };

  try {
    switch (action) {
      case 'finish':
        return NextResponse.json({ success: true, result: await finishGame(sid, game) });

      case 'skip':
        return NextResponse.json({
          success: true,
          result: await skipPlayer(sid, game, needsEntry()),
        });

      case 'rejoin':
        return NextResponse.json({
          success: true,
          result: await rejoinFromHutang(sid, game, needsEntry()),
        });

      case 'remove':
        return NextResponse.json({
          success: true,
          result: await removePlayer(sid, game, needsEntry()),
        });

      case 'adjust': {
        const delta = Number(body?.delta);
        if (!Number.isInteger(delta) || delta === 0) {
          throw new BadRequest('delta must be a non-zero integer');
        }
        return NextResponse.json({
          success: true,
          result: await adjustCredits(sid, game, needsEntry(), delta),
        });
      }

      default:
        throw new BadRequest(
          'action must be one of: finish, skip, rejoin, remove, adjust',
        );
    }
  } catch (err) {
    if (err instanceof BadRequest) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    throw err;
  }
});

class BadRequest extends Error {}
