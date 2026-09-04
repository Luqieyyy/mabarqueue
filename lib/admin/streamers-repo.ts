/**
 * Admin-SDK data access for streamer workspaces and slugs.
 *
 * This is the first piece of the multi-tenant identity model from
 * `lib/domain/types.ts`: `streamers/{streamerId}` as the tenant boundary,
 * `slugs/{slug}` enforcing uniqueness, decoupled from `users/{authUid}`
 * (the person). Nothing here touches the legacy `users/{emailPrefix}/...`
 * data the live app still reads — this is purely additive until the
 * migration script (Phase 6) and the slug-based public pages (Phase 8)
 * switch reads over.
 */

import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../firebase-admin';
import { validateSlug, type AuthUid, type Slug, type StreamerId } from '../domain/ids';
import { DEFAULT_GAME } from '../games';
import type { Streamer, StreamerStatus } from '../domain/types';

function streamersCol() {
  return adminDb().collection('streamers');
}
function slugsCol() {
  return adminDb().collection('slugs');
}
function usersCol() {
  return adminDb().collection('users');
}

export type CreateStreamerError =
  | { ok: false; reason: 'invalid-slug'; message: string }
  | { ok: false; reason: 'slug-taken'; message: string }
  | { ok: false; reason: 'already-has-streamer'; message: string; streamerId: string };

export type CreateStreamerResult = { ok: true; streamer: Streamer } | CreateStreamerError;

/**
 * Creates a new streamer workspace owned by `authUid` and claims its slug.
 *
 * Slug uniqueness is enforced by using the slug itself as the `slugs/{slug}`
 * document ID: the create only succeeds if that document doesn't already
 * exist, which Firestore guarantees atomically inside the transaction. One
 * user owning more than one streamer is blocked in V1 by checking
 * `users/{authUid}.primaryStreamerId` first — matching the "one user, one
 * workspace for now" constraint from the target architecture, without
 * baking that limit into the `Streamer` document shape itself.
 */
export async function createStreamer(
  authUid: AuthUid,
  displayName: string,
  requestedSlug: string,
): Promise<CreateStreamerResult> {
  const validation = validateSlug(requestedSlug);
  if (!validation.ok) {
    return { ok: false, reason: 'invalid-slug', message: validation.message };
  }
  const slug = validation.slug;

  const db = adminDb();
  const userRef = usersCol().doc(authUid);
  const slugRef = slugsCol().doc(slug);
  const streamerRef = streamersCol().doc();

  const result = await db.runTransaction(async (tx) => {
    const [userSnap, slugSnap] = await Promise.all([tx.get(userRef), tx.get(slugRef)]);

    const existingStreamerId = userSnap.data()?.primaryStreamerId as string | undefined;
    if (existingStreamerId) {
      return {
        ok: false as const,
        reason: 'already-has-streamer' as const,
        message: 'This account already owns a streamer workspace.',
        streamerId: existingStreamerId,
      };
    }

    if (slugSnap.exists) {
      return {
        ok: false as const,
        reason: 'slug-taken' as const,
        message: `"${slug}" is already taken.`,
      };
    }

    const now = FieldValue.serverTimestamp();
    const streamerData = {
      ownerUid: authUid,
      displayName,
      slug,
      avatarUrl: null,
      bio: null,
      status: 'draft' as StreamerStatus,
      activeGame: DEFAULT_GAME,
      stripeAccountId: null,
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripeDetailsSubmitted: false,
      platformFeeBps: null, // null → caller falls back to DEFAULT_PLATFORM_FEE_BPS
      legacyUsername: null,
      createdAt: now,
      updatedAt: now,
    };

    tx.set(streamerRef, streamerData);
    tx.set(slugRef, { streamerId: streamerRef.id, createdAt: now });
    tx.set(userRef, { primaryStreamerId: streamerRef.id, updatedAt: now }, { merge: true });

    return { ok: true as const, streamerId: streamerRef.id, data: streamerData };
  });

  if (!result.ok) return result;

  return {
    ok: true,
    streamer: {
      streamerId: result.streamerId as StreamerId,
      ...result.data,
      slug: result.data.slug as Slug,
      // Firestore resolves serverTimestamp() after commit; the caller gets
      // null here and should re-fetch if it needs the resolved value.
      createdAt: null,
      updatedAt: null,
    },
  };
}

/** Resolves a streamer by its owning Firebase Auth UID, for dashboard bootstrap. */
export async function getStreamerByOwner(authUid: AuthUid): Promise<Streamer | null> {
  const snap = await streamersCol().where('ownerUid', '==', authUid).limit(1).get();
  if (snap.empty) return null;
  return docToStreamer(snap.docs[0]);
}

/** Resolves a streamer by public slug, for `/streamer/[slug]`, `/queue/[slug]`, `/overlay/[slug]`. */
export async function getStreamerBySlug(slug: string): Promise<Streamer | null> {
  const normalized = validateSlug(slug);
  if (!normalized.ok) return null;

  const mapSnap = await slugsCol().doc(normalized.slug).get();
  if (!mapSnap.exists) return null;

  const streamerId = mapSnap.data()?.streamerId as string;
  const streamerSnap = await streamersCol().doc(streamerId).get();
  if (!streamerSnap.exists) return null;

  return docToStreamer(streamerSnap);
}

function docToStreamer(doc: FirebaseFirestore.DocumentSnapshot): Streamer {
  const d = doc.data()!;
  return {
    streamerId: doc.id as StreamerId,
    ownerUid: d.ownerUid,
    displayName: d.displayName,
    slug: d.slug,
    avatarUrl: d.avatarUrl ?? null,
    bio: d.bio ?? null,
    status: d.status,
    activeGame: d.activeGame,
    stripeAccountId: d.stripeAccountId ?? null,
    stripeChargesEnabled: Boolean(d.stripeChargesEnabled),
    stripePayoutsEnabled: Boolean(d.stripePayoutsEnabled),
    stripeDetailsSubmitted: Boolean(d.stripeDetailsSubmitted),
    platformFeeBps: d.platformFeeBps ?? null,
    legacyUsername: d.legacyUsername ?? null,
    createdAt: d.createdAt ?? null,
    updatedAt: d.updatedAt ?? null,
  };
}
