/**
 * Firestore path helpers for the multi-tenant schema — server-only.
 *
 * Centralised so a collection name appears exactly once in the codebase.
 * See `lib/domain/types.ts` for the document shapes these paths hold.
 */

import 'server-only';
import { adminDb } from '../firebase-admin';

export function streamerDoc(streamerId: string) {
  return adminDb().collection('streamers').doc(streamerId);
}

export function queueCol(streamerId: string) {
  return streamerDoc(streamerId).collection('queue');
}

export function packagesCol(streamerId: string) {
  return streamerDoc(streamerId).collection('packages');
}

export function donationsCol(streamerId: string) {
  return streamerDoc(streamerId).collection('donations');
}

export function historyCol(streamerId: string) {
  return streamerDoc(streamerId).collection('history');
}

/** Keyed by the payment provider's own event ID — the idempotency guard. */
export function paymentEventDoc(streamerId: string, providerEventId: string) {
  return streamerDoc(streamerId).collection('payment_events').doc(providerEventId);
}

/** Pending checkout attempts, keyed by Stripe Checkout Session ID. */
export function paymentAttemptDoc(streamerId: string, sessionId: string) {
  return streamerDoc(streamerId).collection('payment_attempts').doc(sessionId);
}
