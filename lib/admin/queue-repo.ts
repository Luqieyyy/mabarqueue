/**
 * Queue operations for a streamer workspace — server-only, transactional.
 *
 * Each operation reads the queue inside a Firestore transaction, hands the
 * snapshot to a pure function from `lib/domain/queue-rules.ts`, then applies
 * the returned plan in that same transaction. That structure is what makes
 * the invariants hold under concurrency:
 *
 *   - at most `maxSlots` players are 'playing'
 *   - `gamesLeft` never goes negative
 *   - a player holds exactly one status
 *   - ordering is deterministic via `seq`
 *
 * The legacy `lib/queue.ts` does the same logic non-transactionally from the
 * browser, which is why a double-clicked "Finish Game" can double-deduct and
 * simultaneous donations can overfill the game.
 */

import 'server-only';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminDb } from '../firebase-admin';
import { queueCol, historyCol, streamerDoc } from './paths';
import { getGameDefinition, type GameId } from '../games';
import {
  computeAdjustCredits,
  computeAdmission,
  computeFinishGame,
  computeRejoinFromHutang,
  computeSkip,
  normalizeMaxSlots,
  type QueueAction,
  type QueuePlan,
  type QueueSlotPlayer,
} from '../domain/queue-rules';
import type { QueueEntry, QueueStatus } from '../domain/types';
import type { StreamerId } from '../domain/ids';

// ─── Snapshot helpers ─────────────────────────────────────────────────────────

interface LoadedQueue {
  players: QueueSlotPlayer[];
  refs: Map<string, FirebaseFirestore.DocumentReference>;
  data: Map<string, Record<string, unknown>>;
}

/** Reads every queue entry for one game, inside a transaction. */
async function loadQueue(
  tx: Transaction,
  streamerId: StreamerId,
  game: GameId,
): Promise<LoadedQueue> {
  const snap = await tx.get(queueCol(streamerId).where('game', '==', game));
  const players: QueueSlotPlayer[] = [];
  const refs = new Map<string, FirebaseFirestore.DocumentReference>();
  const data = new Map<string, Record<string, unknown>>();

  for (const doc of snap.docs) {
    const d = doc.data();
    players.push({
      entryId: doc.id,
      status: d.status as QueueStatus,
      gamesLeft: Number(d.gamesLeft ?? 0),
      totalGames: Number(d.totalGames ?? 0),
      seq: Number(d.seq ?? 0),
    });
    refs.set(doc.id, doc.ref);
    data.set(doc.id, d);
  }

  return { players, refs, data };
}

/** Applies a computed plan's actions as transaction writes. */
function applyPlan(
  tx: Transaction,
  streamerId: StreamerId,
  loaded: LoadedQueue,
  plan: QueuePlan,
  game: GameId,
): void {
  for (const action of plan.actions) {
    const ref = loaded.refs.get(action.entryId);
    if (!ref) continue;

    switch (action.type) {
      case 'set-games':
        tx.update(ref, { gamesLeft: action.gamesLeft });
        break;

      case 'set-status':
        tx.update(ref, {
          status: action.status,
          statusChangedAt: FieldValue.serverTimestamp(),
        });
        break;

      case 'promote':
        tx.update(ref, {
          status: 'playing',
          statusChangedAt: FieldValue.serverTimestamp(),
        });
        break;

      case 'complete': {
        const d = loaded.data.get(action.entryId) ?? {};
        tx.set(historyCol(streamerId).doc(), {
          displayName: d.displayName ?? d.username ?? '',
          ign: d.ign ?? '',
          playerId: d.playerId ?? d.player_id ?? null,
          gamesPlayed: action.gamesPlayed,
          game,
          completedAt: FieldValue.serverTimestamp(),
        });
        tx.delete(ref);
        break;
      }

      case 'remove':
        tx.delete(ref);
        break;
    }
  }
}

function slotsFor(game: GameId): number {
  return normalizeMaxSlots(getGameDefinition(game).slotCount);
}

// ─── Streamer-facing operations ───────────────────────────────────────────────

export interface QueueOpResult {
  changed: number;
  promoted: string[];
  completed: string[];
}

const noChange: QueueOpResult = { changed: 0, promoted: [], completed: [] };

function toResult(plan: QueuePlan): QueueOpResult {
  return {
    changed: plan.actions.length,
    promoted: plan.promotedEntryIds,
    completed: plan.completedEntryIds,
  };
}

/** Deducts one credit from every in-game player and refills freed slots. */
export async function finishGame(streamerId: StreamerId, game: GameId): Promise<QueueOpResult> {
  return adminDb().runTransaction(async (tx) => {
    const loaded = await loadQueue(tx, streamerId, game);
    const plan = computeFinishGame(loaded.players, slotsFor(game));
    if (plan.actions.length === 0) return noChange;
    applyPlan(tx, streamerId, loaded, plan, game);
    return toResult(plan);
  });
}

/** Moves a player to hutang game without deducting a credit, then refills. */
export async function skipPlayer(
  streamerId: StreamerId,
  game: GameId,
  entryId: string,
): Promise<QueueOpResult> {
  return adminDb().runTransaction(async (tx) => {
    const loaded = await loadQueue(tx, streamerId, game);
    const plan = computeSkip(loaded.players, entryId, slotsFor(game));
    if (plan.actions.length === 0) return noChange;
    applyPlan(tx, streamerId, loaded, plan, game);
    return toResult(plan);
  });
}

/**
 * Returns a hutang player to the waiting list, credits intact.
 *
 * A fresh `seq` is allocated so they rejoin at the back of the queue rather
 * than reclaiming their original position.
 */
export async function rejoinFromHutang(
  streamerId: StreamerId,
  game: GameId,
  entryId: string,
): Promise<QueueOpResult> {
  return adminDb().runTransaction(async (tx) => {
    const loaded = await loadQueue(tx, streamerId, game);
    const streamerSnap = await tx.get(streamerDoc(streamerId));

    const plan = computeRejoinFromHutang(loaded.players, entryId);
    if (plan.actions.length === 0) return noChange;

    const nextSeq = ((streamerSnap.data()?.queueSeq as number | undefined) ?? 0) + 1;
    applyPlan(tx, streamerId, loaded, plan, game);
    tx.update(loaded.refs.get(entryId)!, { seq: nextSeq });
    tx.set(streamerDoc(streamerId), { queueSeq: nextSeq }, { merge: true });

    return toResult(plan);
  });
}

/** Manual credit adjustment from the dashboard (+1 / −1 buttons). */
export async function adjustCredits(
  streamerId: StreamerId,
  game: GameId,
  entryId: string,
  delta: number,
): Promise<QueueOpResult> {
  return adminDb().runTransaction(async (tx) => {
    const loaded = await loadQueue(tx, streamerId, game);
    const plan = computeAdjustCredits(loaded.players, entryId, delta, slotsFor(game));
    if (plan.actions.length === 0) return noChange;
    applyPlan(tx, streamerId, loaded, plan, game);

    // An increase raises lifetime totals too, which the pure rule can't
    // express through `set-games` alone.
    if (delta > 0) {
      const action = plan.actions.find((a): a is Extract<QueueAction, { type: 'set-games' }> =>
        a.type === 'set-games',
      );
      if (action) {
        const current = loaded.players.find((p) => p.entryId === entryId);
        if (current) {
          tx.update(loaded.refs.get(entryId)!, { totalGames: current.totalGames + delta });
        }
      }
    }

    return toResult(plan);
  });
}

/** Removes a player outright, refilling their slot if they were in the game. */
export async function removePlayer(
  streamerId: StreamerId,
  game: GameId,
  entryId: string,
): Promise<QueueOpResult> {
  return adminDb().runTransaction(async (tx) => {
    const loaded = await loadQueue(tx, streamerId, game);
    const target = loaded.players.find((p) => p.entryId === entryId);
    if (!target) return noChange;

    const ref = loaded.refs.get(entryId)!;
    tx.delete(ref);

    // Refill only if a playing slot just opened.
    if (target.status === 'playing') {
      const remaining = loaded.players.filter((p) => p.entryId !== entryId);
      const open = slotsFor(game) - remaining.filter((p) => p.status === 'playing').length;
      const waiting = remaining
        .filter((p) => p.status === 'waiting')
        .sort((a, b) => a.seq - b.seq)
        .slice(0, Math.max(0, open));
      for (const w of waiting) {
        tx.update(loaded.refs.get(w.entryId)!, {
          status: 'playing',
          statusChangedAt: FieldValue.serverTimestamp(),
        });
      }
      return { changed: 1 + waiting.length, promoted: waiting.map((w) => w.entryId), completed: [] };
    }

    return { changed: 1, promoted: [], completed: [] };
  });
}

// ─── Paid admission (called from the Stripe webhook) ─────────────────────────

export interface GrantCreditsInput {
  streamerId: StreamerId;
  game: GameId;
  displayName: string;
  ign: string;
  playerId: string | null;
  games: number;
  orderDate: string;
  /** Provider payment reference, stored on the entry for traceability. */
  providerPaymentId: string;
}

export type GrantCreditsResult =
  | { kind: 'topped-up'; entryId: string }
  | { kind: 'admitted' | 'queued'; entryId: string };

/**
 * Grants paid credits and places the viewer, atomically.
 *
 * Must be called from inside an already-idempotent context (the Stripe
 * webhook checks `payment_events/{eventId}` in its own transaction) — this
 * function assumes the payment has been confirmed and is being applied once.
 */
export async function grantCreditsAndPlace(
  input: GrantCreditsInput,
): Promise<GrantCreditsResult> {
  const { streamerId, game, displayName, ign, playerId, games, orderDate, providerPaymentId } = input;

  return adminDb().runTransaction(async (tx) => {
    const loaded = await loadQueue(tx, streamerId, game);
    const streamerSnap = await tx.get(streamerDoc(streamerId));

    // Match an existing entry on the game-specific player ID when we have
    // one, since that identifies the human more reliably than a donor name.
    const existing = playerId
      ? loaded.players.find((p) => (loaded.data.get(p.entryId)?.playerId ?? null) === playerId)
      : loaded.players.find((p) => loaded.data.get(p.entryId)?.displayName === displayName);

    const outcome = computeAdmission(
      loaded.players,
      existing?.entryId ?? null,
      games,
      slotsFor(game),
    );
    if (!outcome) throw new Error(`Invalid game count for credit grant: ${games}`);

    if (outcome.kind === 'topped-up') {
      tx.update(loaded.refs.get(outcome.entryId)!, {
        gamesLeft: outcome.gamesLeft,
        totalGames: outcome.totalGames,
        ign,
        lastPaymentId: providerPaymentId,
      });
      return { kind: 'topped-up', entryId: outcome.entryId };
    }

    const nextSeq = ((streamerSnap.data()?.queueSeq as number | undefined) ?? 0) + 1;
    const ref = queueCol(streamerId).doc();
    tx.set(ref, {
      displayName,
      ign,
      playerId,
      totalGames: games,
      gamesLeft: games,
      status: outcome.status,
      game,
      seq: nextSeq,
      orderDate,
      joinedAt: FieldValue.serverTimestamp(),
      statusChangedAt: FieldValue.serverTimestamp(),
      lastPaymentId: providerPaymentId,
    });
    tx.set(streamerDoc(streamerId), { queueSeq: nextSeq }, { merge: true });

    return { kind: outcome.status === 'playing' ? 'admitted' : 'queued', entryId: ref.id };
  });
}

// ─── Reads ────────────────────────────────────────────────────────────────────

/** Full queue for the dashboard. */
export async function listQueue(streamerId: StreamerId, game: GameId): Promise<QueueEntry[]> {
  const snap = await queueCol(streamerId).where('game', '==', game).get();
  return snap.docs
    .map((d) => {
      const x = d.data();
      return {
        entryId: d.id,
        displayName: String(x.displayName ?? ''),
        ign: String(x.ign ?? ''),
        playerId: (x.playerId as string | null) ?? null,
        totalGames: Number(x.totalGames ?? 0),
        gamesLeft: Number(x.gamesLeft ?? 0),
        status: x.status as QueueStatus,
        game: x.game as GameId,
        seq: Number(x.seq ?? 0),
        orderDate: String(x.orderDate ?? ''),
        joinedAt: (x.joinedAt as QueueEntry['joinedAt']) ?? null,
        statusChangedAt: (x.statusChangedAt as QueueEntry['statusChangedAt']) ?? null,
      };
    })
    .sort((a, b) => a.seq - b.seq);
}
