import 'server-only';
import type { NextRequest } from 'next/server';
import { adminAuth } from './firebase-admin';
import { adminDb } from './firebase-admin';
import { AuthError, requireUser, type AuthenticatedUser } from './require-auth';

export interface AdminContext {
  user: AuthenticatedUser;
}

function emailToDocId(email: string): string {
  return email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

async function hasAdminRole(user: AuthenticatedUser): Promise<boolean> {
  const [authRecord, uidDoc, legacyDoc] = await Promise.all([
    adminAuth().getUser(user.uid),
    adminDb().collection('users').doc(user.uid).get(),
    user.email ? adminDb().collection('users').doc(emailToDocId(user.email)).get() : Promise.resolve(null),
  ]);

  const claims = authRecord.customClaims ?? {};
  const uidRole = uidDoc.exists ? uidDoc.data()?.role : null;
  const legacyRole = legacyDoc?.exists ? legacyDoc.data()?.role : null;

  return claims.admin === true || claims.role === 'admin' || uidRole === 'admin' || legacyRole === 'admin';
}

export async function requireAdmin(req: NextRequest): Promise<AdminContext> {
  const user = await requireUser(req);
  if (!(await hasAdminRole(user))) {
    throw new AuthError('Admin access required.', 403);
  }
  return { user };
}

export function withAdmin(
  handler: (req: NextRequest, ctx: AdminContext) => Promise<Response>,
) {
  return async (req: NextRequest): Promise<Response> => {
    try {
      const ctx = await requireAdmin(req);
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof AuthError) {
        return Response.json({ success: false, error: err.message }, { status: err.status });
      }
      console.error('[withAdmin] Unhandled error:', err);
      return Response.json({ success: false, error: 'Internal error' }, { status: 500 });
    }
  };
}
