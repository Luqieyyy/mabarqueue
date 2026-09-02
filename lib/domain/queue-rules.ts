/**
 * Pure queue and game-slot rules.
 *
 * Every function here is a total function over plain data: no Firebase, no
 * network, no clock, no randomness. The caller (Phase 4's repository layer)
 * reads the current state inside a Firestore transaction, passes it here, and
 * applies the returned plan in that same transaction.
 *
 * This is what makes the invariants testable and enforceable:
 *
 *   1. At most `maxSlots` players are 'playing'.
 *   2. `gamesLeft` never goes below zero.
 *   3. A player holds exactly one status — no dual states.
 *   4. Ordering is deterministic, driven by `seq`.
 *
 * The live implementation in `lib/queue.ts` computes all of this inline in the
 * browser with non-transactional read-then-write pairs, which is why it can
 * double-deduct and overfill slots. That file is untouched until Phase 4.
 */

import { DEFAULT_MAX_SLOTS, MAX_ALLOWED_SLOTS } from './config';
import type { QueueStatus } from './types';

// ─── Input / output shapes ────────────────────────────────────────────────────

/** The minimum a rule needs to know about a queue entry. */
export interface QueueSlotPlayer {
  entryId: string;
  gamesLeft: number;
  totalGames: number;
  status: QueueStatus;
  seq: number;
}

/** A single change for the caller to apply. */
export type QueueAction =
  | { type: 'set-games'; entryId: string; gamesLeft: number }
  | { type: 'set-status'; entryId: string; status: QueueStatus }
  | { type: 'promote'; entryId: string }
  | { type: 'complete'; entryId: string; gamesPlayed: number }
  | { type: 'remove'; entryId: string };

export interface QueuePlan {
  actions: QueueAction[];
  /** Slots that opened up and were filled from the waiting list. */
  promotedEntryIds: string[];
  /** Players who reached zero credits and were retired to history. */
  completedEntryIds: string[];
}

const emptyPlan = (): QueuePlan => ({
  actions: [],
  promotedEntryIds: [],
  completedEntryIds: [],
});

// ─── Slot arithmetic ──────────────────────────────────────────────────────────

/** Clamps a configured slot count into a sane range. */
export function normalizeMaxSlots(configured: number | null | undefined): number {
  if (configured == null || !Number.isInteger(configured) || configured < 1) {
    return DEFAULT_MAX_SLOTS;
  }
  return Math.min(configured, MAX_ALLOWED_SLOTS);
}

export function countPlaying(players: readonly QueueSlotPlayer[]): number {
  return players.filter((p) => p.status === 'playing').length;
}

/** How many additional players may enter the game right now. Never negative. */
export function availableSlots(
  players: readonly QueueSlotPlayer[],
  maxSlots: number,
): number {
  return Math.max(0, normalizeMaxSlots(maxSlots) - countPlaying(players));
}

/** Waiting players in deterministic queue order. */
export function waitingInOrder(
  players: readonly QueueSlotPlayer[],
): QueueSlotPlayer[] {
  return players
    .filter((p) => p.status === 'waiting')
    .sort((a, b) => a.seq - b.seq);
}

/**
 * Chooses which waiting players fill the currently-open slots.
 *
 * Pure and order-stable, so two concurrent callers computing against the same
 * transactional snapshot always agree on the outcome.
 */
export function selectPromotions(
  players: readonly QueueSlotPlayer[],
  maxSlots: number,
): QueueSlotPlayer[] {
  const open = availableSlots(players, maxSlots);
  if (open === 0) return [];
  return waitingInOrder(players).slice(0, open);
}

// ─── Finish game ──────────────────────────────────────────────────────────────

/**
 * Deducts exactly one credit from every 'playing' player.
 *
 * Players reaching zero are retired to history and their slots refilled from
 * the waiting list, in `seq` order. Players with credits remaining keep
 * playing. Deduction is computed from the snapshot, so applying the plan twice
 * is impossible within one transaction — the double-deduction bug in the
 * current implementation comes from recomputing between reads and writes.
 */
export function computeFinishGame(
  players: readonly QueueSlotPlayer[],
  maxSlots: number,
): QueuePlan {
  const playing = players.filter((p) => p.status === 'playing');
  if (playing.length === 0) return emptyPlan();

  const plan = emptyPlan();
  const survivors: QueueSlotPlayer[] = [];

  for (const p of playing) {
    // Invariant 2: clamp at zero rather than trusting stored data.
    const next = Math.max(0, p.gamesLeft - 1);
    if (next === 0) {
      plan.actions.push({
        type: 'complete',
        entryId: p.entryId,
        gamesPlayed: p.totalGames,
      });
      plan.completedEntryIds.push(p.entryId);
    } else {
      plan.actions.push({ type: 'set-games', entryId: p.entryId, gamesLeft: next });
      survivors.push({ ...p, gamesLeft: next });
    }
  }

  // Refill against post-deduction state, not the state we started from.
  const remaining = [
    ...survivors,
    ...players.filter((p) => p.status !== 'playing'),
  ];
  for (const promoted of selectPromotions(remaining, maxSlots)) {
    plan.actions.push({ type: 'promote', entryId: promoted.entryId });
    plan.promotedEntryIds.push(promoted.entryId);
  }

  return plan;
}

// ─── Skip → hutang game ───────────────────────────────────────────────────────

/**
 * Moves a playing player to 'skipped' (hutang game) **without** deducting a
 * credit, then refills the freed slot.
 *
 * A no-op unless the player is currently playing, which keeps the operation
 * idempotent under a double-click.
 */
export function computeSkip(
  players: readonly QueueSlotPlayer[],
  entryId: string,
  maxSlots: number,
): QueuePlan {
  const target = players.find((p) => p.entryId === entryId);
  if (!target || target.status !== 'playing') return emptyPlan();

  const plan = emptyPlan();
  plan.actions.push({ type: 'set-status', entryId, status: 'skipped' });

  const remaining = players.map((p) =>
    p.entryId === entryId ? { ...p, status: 'skipped' as QueueStatus } : p,
  );
  for (const promoted of selectPromotions(remaining, maxSlots)) {
    plan.actions.push({ type: 'promote', entryId: promoted.entryId });
    plan.promotedEntryIds.push(promoted.entryId);
  }

  return plan;
}

/**
 * Returns a hutang player to the waiting list with credits intact.
 *
 * They re-enter at the back: `seq` is reassigned by the caller from the
 * counter, so a rejoin cannot jump the queue.
 */
export function computeRejoinFromHutang(
  players: readonly QueueSlotPlayer[],
  entryId: string,
): QueuePlan {
  const target = players.find((p) => p.entryId === entryId);
  if (!target || target.status !== 'skipped') return emptyPlan();

  const plan = emptyPlan();
  plan.actions.push({ type: 'set-status', entryId, status: 'waiting' });
  return plan;
}

// ─── Manual credit adjustment ─────────────────────────────────────────────────

/**
 * Applies a manual credit delta from the dashboard.
 *
 * An increase raises `totalGames` alongside `gamesLeft` so lifetime totals stay
 * truthful. A decrease to zero retires the player exactly as finishing would,
 * refilling their slot if they were playing.
 */
export function computeAdjustCredits(
  players: readonly QueueSlotPlayer[],
  entryId: string,
  delta: number,
  maxSlots: number,
): QueuePlan {
  const target = players.find((p) => p.entryId === entryId);
  if (!target || delta === 0 || !Number.isInteger(delta)) return emptyPlan();

  const plan = emptyPlan();
  const next = Math.max(0, target.gamesLeft + delta);

  if (next === 0) {
    plan.actions.push({
      type: 'complete',
      entryId,
      gamesPlayed: target.totalGames,
    });
    plan.completedEntryIds.push(entryId);

    if (target.status === 'playing') {
      const remaining = players.filter((p) => p.entryId !== entryId);
      for (const promoted of selectPromotions(remaining, maxSlots)) {
        plan.actions.push({ type: 'promote', entryId: promoted.entryId });
        plan.promotedEntryIds.push(promoted.entryId);
      }
    }
    return plan;
  }

  plan.actions.push({ type: 'set-games', entryId, gamesLeft: next });
  return plan;
}

// ─── Admitting a paid viewer ──────────────────────────────────────────────────

export type AdmissionOutcome =
  /** Existing player found; credits were topped up, status untouched. */
  | { kind: 'topped-up'; entryId: string; gamesLeft: number; totalGames: number }
  /** New player goes straight into an open slot. */
  | { kind: 'admitted'; status: 'playing' }
  /** New player joins the waiting list. */
  | { kind: 'queued'; status: 'waiting' };

/**
 * Decides what happens when a paid viewer arrives.
 *
 * Topping up an existing entry preserves their current status — a player who
 * is mid-game or in hutang game must not be yanked elsewhere by buying more
 * credits.
 *
 * The caller must run this inside a transaction that also reads `players`;
 * otherwise two simultaneous payments can both observe the same open slot.
 * That race (`getPlayingCount` then `addDoc`) is exactly the live bug in
 * `lib/queue.ts:addPlayerToQueue`.
 */
export function computeAdmission(
  players: readonly QueueSlotPlayer[],
  existingEntryId: string | null,
  gamesPurchased: number,
  maxSlots: number,
): AdmissionOutcome | null {
  if (!Number.isInteger(gamesPurchased) || gamesPurchased <= 0) return null;

  if (existingEntryId) {
    const existing = players.find((p) => p.entryId === existingEntryId);
    if (existing) {
      return {
        kind: 'topped-up',
        entryId: existing.entryId,
        gamesLeft: existing.gamesLeft + gamesPurchased,
        totalGames: existing.totalGames + gamesPurchased,
      };
    }
  }

  return availableSlots(players, maxSlots) > 0
    ? { kind: 'admitted', status: 'playing' }
    : { kind: 'queued', status: 'waiting' };
}
