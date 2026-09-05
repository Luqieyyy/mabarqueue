/**
 * Server-side authentication and authorization for API routes.
 *
 * Every protected route must call `requireUser` before touching Firestore.
 * Never trust a `uid`/`streamerId` sent in the request body for
 * authorization — always resolve identity from the verified ID token, and
 * (once `streamers/{id}` exists — Phase 5) re-check `ownerUid` against it
 * before allowing any write to that workspace.
 */

import 'server-only';
import type { NextRequest } from 'next/server';
import { adminAuth } from './firebase-admin';
import type { AuthUid } from './domain/ids';

export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

export interface AuthenticatedUser {
  uid: AuthUid;
  email: string | null;
  emailVerified?: boolean;
}

/**
 * Extracts and verifies the Firebase ID token from the `Authorization` header.
 *
 * Throws `AuthError` (never returns null) so callers can let it propagate to
 * a route's top-level catch, which is the intended usage — see
 * `withAuth` below for the common case.
 */
export async function requireUser(req: NextRequest): Promise<AuthenticatedUser> {
  const header = req.headers.get('authorization');
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    throw new AuthError('Missing Authorization: Bearer <idToken> header.');
  }

  try {
    // `checkRevoked: true` costs an extra lookup but ensures a signed-out or
    // deleted user's still-live token is rejected immediately, not just at
    // its natural expiry.
    const decoded = await adminAuth().verifyIdToken(token, true);
    return { uid: decoded.uid as AuthUid, email: decoded.email ?? null, emailVerified: decoded.email_verified === true };
  } catch (err) {
    throw new AuthError(
      'Invalid or expired token.',
    );
  }
}

/**
 * Wraps a route handler so `AuthError` becomes the right HTTP response
 * automatically, and any other thrown error becomes a generic 500 —
 * mirroring the "never leak internals, never trust the client" posture used
 * throughout the domain layer.
 */
export function withAuth(
  handler: (req: NextRequest, user: AuthenticatedUser) => Promise<Response>,
) {
  return async (req: NextRequest): Promise<Response> => {
    try {
      const user = await requireUser(req);
      return await handler(req, user);
    } catch (err) {
      if (err instanceof AuthError) {
        return Response.json({ success: false, error: err.message }, { status: err.status });
      }
      console.error('[withAuth] Unhandled error:', err);
      return Response.json({ success: false, error: 'Internal error' }, { status: 500 });
    }
  };
}
