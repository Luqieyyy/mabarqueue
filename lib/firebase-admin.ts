/**
 * Firebase Admin SDK — server-only.
 *
 * Every write that involves money, credits, or queue state must go through
 * this module, never through `lib/firebase.ts` (the client SDK). The client
 * SDK is bound by Firestore security rules and has no server-trusted identity;
 * using it from an API route either gets silently denied (the confirmed bug
 * in the old `/api/queue` route and the Sociabuzz webhook) or requires rules
 * loose enough to let an authenticated browser write anything.
 *
 * This file must never be imported from a Client Component or any code that
 * ships to the browser — the service account key grants full, rule-bypassing
 * access to the project.
 */

import 'server-only';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

function loadCredentials() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // Env files store the key with literal "\n" sequences; they must be
  // converted to real newlines or PEM parsing fails.
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing Firebase Admin credentials. Set FIREBASE_ADMIN_PROJECT_ID, ' +
        'FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY (server-only, ' +
        'never NEXT_PUBLIC_*) in .env.local.',
    );
  }

  return { projectId, clientEmail, privateKey };
}

function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const { projectId, clientEmail, privateKey } = loadCredentials();
  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;

/** The Admin Auth instance — verifying ID tokens, managing users. */
export function adminAuth(): Auth {
  if (!cachedAuth) cachedAuth = getAuth(getAdminApp());
  return cachedAuth;
}

/** The Admin Firestore instance — bypasses all security rules. */
export function adminDb(): Firestore {
  if (!cachedDb) cachedDb = getFirestore(getAdminApp());
  return cachedDb;
}
