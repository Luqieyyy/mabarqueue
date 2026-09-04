/**
 * Workspace authorization — server-only.
 *
 * Authentication alone is not enough: every protected operation must confirm
 * that the verified caller actually owns the workspace being mutated. The
 * `streamerId` is resolved *from the token*, never accepted from the request
 * body, so a crafted request can't act on another streamer's queue, packages
 * or earnings.
 */

import 'server-only';
import type { NextRequest } from 'next/server';
import { AuthError, requireUser, type AuthenticatedUser } from './require-auth';
import { getStreamerByOwner } from './admin/streamers-repo';
import type { Streamer } from './domain/types';

export interface StreamerContext {
  user: AuthenticatedUser;
  streamer: Streamer;
}

/**
 * Verifies the caller and loads the workspace they own.
 *
 * Throws `AuthError` with 404 if they haven't created one yet — the caller
 * should send them through onboarding.
 */
export async function requireStreamer(req: NextRequest): Promise<StreamerContext> {
  const user = await requireUser(req);
  const streamer = await getStreamerByOwner(user.uid);

  if (!streamer) {
    throw new AuthError('No streamer workspace found for this account.', 404);
  }
  if (streamer.status === 'suspended') {
    throw new AuthError('This workspace is suspended.', 403);
  }

  return { user, streamer };
}

/**
 * Wraps a route handler with authentication *and* workspace authorization,
 * mapping `AuthError` to its status and anything else to a generic 500.
 */
export function withStreamer(
  handler: (req: NextRequest, ctx: StreamerContext) => Promise<Response>,
) {
  return async (req: NextRequest): Promise<Response> => {
    try {
      const ctx = await requireStreamer(req);
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof AuthError) {
        return Response.json({ success: false, error: err.message }, { status: err.status });
      }
      console.error('[withStreamer] Unhandled error:', err);
      return Response.json({ success: false, error: 'Internal error' }, { status: 500 });
    }
  };
}
