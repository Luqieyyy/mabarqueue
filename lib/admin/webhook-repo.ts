/**
 * Admin-SDK data access for the Sociabuzz webhook.
 *
 * This is a server-only mirror of the subset of `lib/settings.ts`,
 * `lib/packages.ts` and `lib/queue.ts` that the webhook route needs — using
 * Firebase Admin instead of the client SDK, so writes are trusted by the
 * server rather than evaluated against Firestore security rules (which,
 * for an unauthenticated webhook request, would simply deny them — the
 * confirmed C2 bug).
 *
 * The dashboard, `/queue` and `/overlay` pages are untouched: they still read
 * via the client SDK, which is fine for reads under rules that already allow
 * public read on `queue`/`packages`/`settings/game`. Only this write path
 * moves to Admin. Migrating the dashboard's own writes is a separate,
 * later step (Phase 4), since it requires session-token verification from
 * the browser rather than a webhook token.
 *
 * Collection layout is unchanged from the live schema
 * (`users/{uid}/...`) — the `streamers/{id}` restructure is Phase 5.
 */

import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../firebase-admin';
import { getGameDefinition, DEFAULT_GAME, type GameId } from '../games';
import { extractMatchCount } from '../packages';
import {
  computeAdmission,
  normalizeMaxSlots,
  type QueueSlotPlayer,
} from '../domain/queue-rules';
import type { QueueStatus } from '../domain/types';

// ─── Path helpers ─────────────────────────────────────────────────────────────

function userDoc(uid: string) {
  return adminDb().collection('users').doc(uid);
}
function settingsDoc(uid: string, name: string) {
  return userDoc(uid).collection('settings').doc(name);
}
function queueCol(uid: string) {
  return userDoc(uid).collection('queue');
}
function packagesCol(uid: string) {
  return userDoc(uid).collection('packages');
}
function paymentEventDoc(uid: string, providerEventId: string) {
  return userDoc(uid).collection('payment_events').doc(providerEventId);
}

// ─── Settings (read-only from this route) ─────────────────────────────────────

export interface RateTier {
  amount: number;
  games: number;
}

const DEFAULT_TIERS: RateTier[] = [
  { amount: 4, games: 1 },
  { amount: 10, games: 3 },
  { amount: 20, games: 6 },
  { amount: 30, games: 10 },
];

export async function getWebhookToken(uid: string): Promise<string | null> {
  const snap = await settingsDoc(uid, 'webhook').get();
  if (!snap.exists) return null;
  const token = snap.data()?.token;
  return typeof token === 'string' ? token.trim() || null : null;
}

export async function getRates(uid: string): Promise<RateTier[]> {
  const snap = await settingsDoc(uid, 'rates').get();
  if (!snap.exists) return DEFAULT_TIERS;
  return (snap.data()?.tiers as RateTier[] | undefined) ?? DEFAULT_TIERS;
}

export async function getFeatures(uid: string): Promise<{ commentAlbum: boolean }> {
  const snap = await settingsDoc(uid, 'features').get();
  if (!snap.exists) return { commentAlbum: false };
  return { commentAlbum: Boolean(snap.data()?.commentAlbum) };
}

export async function getActiveGame(uid: string): Promise<GameId> {
  const snap = await settingsDoc(uid, 'game').get();
  if (!snap.exists) return DEFAULT_GAME;
  return (snap.data()?.activeGame as GameId | undefined) ?? DEFAULT_GAME;
}

/** Converts a donation amount to games using the streamer's saved tiers. */
export function convertAmountToGames(amount: number, tiers: RateTier[]): number {
  const sorted = [...tiers].sort((a, b) => b.amount - a.amount);
  for (const tier of sorted) {
    if (amount >= tier.amount) return tier.games;
  }
  return 0;
}

// ─── Packages ─────────────────────────────────────────────────────────────────

export interface StreamerPackage {
  title: string;
  price: number;
  description: string;
  matchCount: number;
  isActive: boolean;
}

/**
 * Ensures a package exists for the given Sociabuzz level title, auto-creating
 * it if this is the first time it's been seen. Package docs are still keyed
 * by title (H2 in the audit — a stable `packageId` is Phase 9 scope, deferred
 * so this change stays focused on moving writes to Admin).
 */
export async function ensurePackageExists(
  uid: string,
  levelTitle: string,
  levelPrice: number,
  levelDescription: string,
): Promise<StreamerPackage> {
  const ref = packagesCol(uid).doc(levelTitle);
  const snap = await ref.get();
  if (snap.exists) return snap.data() as StreamerPackage;

  const matchCount = extractMatchCount(levelTitle) || extractMatchCount(levelDescription);
  const pkg: StreamerPackage = {
    title: levelTitle,
    price: levelPrice,
    description: levelDescription.replace(/<[^>]*>/g, '').trim(),
    matchCount,
    isActive: true,
  };

  await ref.set({ ...pkg, createdAt: FieldValue.serverTimestamp() });
  console.log(`[Packages/${uid}] ✓ Auto-created package: "${levelTitle}" (${matchCount} matches, RM${levelPrice})`);
  return pkg;
}

// ─── Donation log (non-transactional; no credits/queue impact) ───────────────

export type DonationStatus =
  | 'success'
  | 'failed_parse'
  | 'package_disabled'
  | 'no_games'
  | 'duplicate';

export interface DonationLogInput {
  donorName: string;
  amount: number;
  ign: string | null;
  playerId: string | null;
  gamesAdded: number;
  gameSource?: string;
  message: string;
  transactionId: string;
  packageTitle: string | null;
  status: DonationStatus;
  game: GameId;
}

export async function logDonation(uid: string, input: DonationLogInput): Promise<void> {
  await userDoc(uid).collection('donations').add({
    donorName: input.donorName,
    amount: input.amount,
    ign: input.ign,
    player_id: input.playerId,
    gamesAdded: input.gamesAdded,
    ...(input.gameSource ? { gameSource: input.gameSource } : {}),
    message: input.message,
    transaction_id: input.transactionId,
    packageTitle: input.packageTitle,
    status: input.status,
    game: input.game,
    timestamp: FieldValue.serverTimestamp(),
  });
}

export async function logAlbumComment(
  uid: string,
  input: { donorName: string; gameId: string; ign: string; amount: number; message: string },
): Promise<void> {
  await userDoc(uid).collection('comment_album').add({
    ...input,
    timestamp: FieldValue.serverTimestamp(),
  });
}

// ─── Formatting helper (mirrors lib/queue.ts, kept in sync intentionally) ─────

export function formatOrderDate(date: Date = new Date()): string {
  const months = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
  ];
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

// ─── Paid-viewer admission (transactional — fixes C2, C4, C6) ────────────────

export interface AdmitPaidViewerInput {
  uid: string;
  /** Sociabuzz donor name — used to find/merge an existing queue entry. */
  username: string;
  ign: string;
  games: number;
  orderDate: string;
  playerId: string;
  /** Idempotency key: the Sociabuzz transaction ID for this donation. */
  transactionId: string;
  packageTitle?: string;
  game: GameId;
}

export type AdmitPaidViewerResult =
  | { kind: 'duplicate' }
  | { kind: 'topped-up'; entryId: string; gamesLeft: number; totalGames: number }
  | { kind: 'admitted' | 'queued'; entryId: string };

/**
 * Admits a paid viewer into the queue, atomically.
 *
 * Runs as a single Firestore transaction so that:
 *
 *   - a redelivered webhook with the same `transactionId` is a no-op
 *     (checked via `payment_events/{transactionId}` — fixes C4), and
 *   - two donations arriving at nearly the same instant can never both
 *     observe the same open slot and overfill the game (fixes C6 —
 *     the live `addPlayerToQueue` does an un-transactional
 *     read-then-write of exactly this check).
 *
 * The admission decision itself is the pure `computeAdmission` from
 * `lib/domain/queue-rules.ts`, so the same logic this reuses is covered by
 * that module's unit tests.
 */
export async function admitPaidViewer(
  input: AdmitPaidViewerInput,
): Promise<AdmitPaidViewerResult> {
  const { uid, username, ign, games, orderDate, playerId, transactionId, packageTitle, game } = input;
  const db = adminDb();
  const maxSlots = normalizeMaxSlots(getGameDefinition(game).slotCount);

  return db.runTransaction(async (tx) => {
    const eventRef = paymentEventDoc(uid, transactionId);
    const streamerRef = userDoc(uid);
    const existingQuery = queueCol(uid)
      .where('username', '==', username)
      .where('game', '==', game)
      .limit(1);
    const playingCountQuery = queueCol(uid)
      .where('status', '==', 'playing')
      .where('game', '==', game);

    // All reads before any write — required by Firestore transactions.
    const [eventSnap, existingSnap, playingSnap, streamerSnap] = await Promise.all([
      tx.get(eventRef),
      tx.get(existingQuery),
      tx.get(playingCountQuery),
      tx.get(streamerRef),
    ]);

    if (eventSnap.exists) {
      // Already processed by a prior delivery of this exact event — this is
      // the idempotency guard. Nothing further is written.
      return { kind: 'duplicate' };
    }

    const existingDoc = existingSnap.docs[0] ?? null;
    const playingCount = playingSnap.size;

    // Build the minimal player set computeAdmission needs: the real existing
    // entry (if any) plus enough anonymous 'playing' placeholders to make the
    // slot count line up. Only the existing entry's identity and status ever
    // matter to the outcome; the placeholders exist purely to be counted.
    const players: QueueSlotPlayer[] = [];
    if (existingDoc) {
      const d = existingDoc.data();
      players.push({
        entryId: existingDoc.id,
        status: d.status as QueueStatus,
        gamesLeft: d.gamesLeft ?? 0,
        totalGames: d.totalGames ?? 0,
        seq: d.seq ?? 0,
      });
    }
    const otherPlayingCount = playingCount - (existingDoc?.data().status === 'playing' ? 1 : 0);
    for (let i = 0; i < otherPlayingCount; i++) {
      players.push({ entryId: `__placeholder_${i}`, status: 'playing', gamesLeft: 1, totalGames: 1, seq: 0 });
    }

    const outcome = computeAdmission(players, existingDoc?.id ?? null, games, maxSlots);
    if (!outcome) {
      // games <= 0 — nothing to grant. Still mark the event processed so a
      // retry of the same non-credit-worthy delivery doesn't re-run this.
      tx.set(eventRef, {
        provider: 'sociabuzz',
        type: 'donation',
        donationId: null,
        processedAt: FieldValue.serverTimestamp(),
      });
      return { kind: 'duplicate' };
    }

    const extras: Record<string, string> = { player_id: playerId, transaction_id: transactionId };
    if (packageTitle) extras.packageTitle = packageTitle;

    let result: AdmitPaidViewerResult;

    if (outcome.kind === 'topped-up') {
      tx.update(existingDoc!.ref, {
        gamesLeft: outcome.gamesLeft,
        totalGames: outcome.totalGames,
        ign,
        ...extras,
      });
      result = { kind: 'topped-up', entryId: outcome.entryId, gamesLeft: outcome.gamesLeft, totalGames: outcome.totalGames };
    } else {
      const nextSeq = ((streamerSnap.data()?.queueSeq as number | undefined) ?? 0) + 1;
      const newRef = queueCol(uid).doc();
      tx.set(newRef, {
        username, ign, totalGames: games, gamesLeft: games,
        status: outcome.status, orderDate, timestamp: FieldValue.serverTimestamp(),
        game, seq: nextSeq, ...extras,
      });
      tx.set(streamerRef, { queueSeq: nextSeq }, { merge: true });
      result = { kind: outcome.status === 'playing' ? 'admitted' : 'queued', entryId: newRef.id };
    }

    // `result` is always 'topped-up' | 'admitted' | 'queued' here — the
    // 'duplicate' case returned early above, before any write was queued.
    tx.set(eventRef, {
      provider: 'sociabuzz',
      type: 'donation',
      donationId: result.entryId,
      processedAt: FieldValue.serverTimestamp(),
    });

    return result;
  });
}
