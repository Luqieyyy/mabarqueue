import { describe, expect, it } from 'vitest';
import {
  type QueueSlotPlayer,
  availableSlots,
  computeAdjustCredits,
  computeAdmission,
  computeFinishGame,
  computeRejoinFromHutang,
  computeSkip,
  countPlaying,
  normalizeMaxSlots,
  selectPromotions,
  waitingInOrder,
} from './queue-rules';
import type { QueueStatus } from './types';

const MAX = 4;

/** Terse player factory: p('a', 'playing', 3) */
function p(
  entryId: string,
  status: QueueStatus,
  gamesLeft: number,
  seq = 0,
  totalGames = gamesLeft,
): QueueSlotPlayer {
  return { entryId, status, gamesLeft, totalGames, seq };
}

/** Applies a plan to a snapshot so post-state invariants can be asserted. */
function apply(
  players: readonly QueueSlotPlayer[],
  plan: ReturnType<typeof computeFinishGame>,
): QueueSlotPlayer[] {
  let out = players.map((x) => ({ ...x }));
  for (const a of plan.actions) {
    switch (a.type) {
      case 'set-games':
        out = out.map((x) => (x.entryId === a.entryId ? { ...x, gamesLeft: a.gamesLeft } : x));
        break;
      case 'set-status':
        out = out.map((x) => (x.entryId === a.entryId ? { ...x, status: a.status } : x));
        break;
      case 'promote':
        out = out.map((x) => (x.entryId === a.entryId ? { ...x, status: 'playing' } : x));
        break;
      case 'complete':
      case 'remove':
        out = out.filter((x) => x.entryId !== a.entryId);
        break;
    }
  }
  return out;
}

// ─── Slot arithmetic ──────────────────────────────────────────────────────────

describe('normalizeMaxSlots', () => {
  it('defaults on missing or nonsensical values', () => {
    expect(normalizeMaxSlots(null)).toBe(4);
    expect(normalizeMaxSlots(undefined)).toBe(4);
    expect(normalizeMaxSlots(0)).toBe(4);
    expect(normalizeMaxSlots(-3)).toBe(4);
    expect(normalizeMaxSlots(2.5)).toBe(4);
  });

  it('caps at the hard ceiling', () => {
    expect(normalizeMaxSlots(5)).toBe(5);
    expect(normalizeMaxSlots(999)).toBe(10);
  });
});

describe('availableSlots', () => {
  it('counts only playing players', () => {
    const players = [p('a', 'playing', 3), p('b', 'waiting', 2), p('c', 'skipped', 1)];
    expect(countPlaying(players)).toBe(1);
    expect(availableSlots(players, MAX)).toBe(3);
  });

  it('never returns negative even if the game is somehow overfull', () => {
    const overfull = ['a', 'b', 'c', 'd', 'e'].map((id) => p(id, 'playing', 1));
    expect(availableSlots(overfull, MAX)).toBe(0);
  });
});

describe('waitingInOrder', () => {
  it('orders deterministically by seq, not by array position', () => {
    const players = [p('c', 'waiting', 1, 30), p('a', 'waiting', 1, 10), p('b', 'waiting', 1, 20)];
    expect(waitingInOrder(players).map((x) => x.entryId)).toEqual(['a', 'b', 'c']);
  });

  it('excludes playing and skipped players', () => {
    const players = [p('a', 'playing', 1, 1), p('b', 'skipped', 1, 2), p('c', 'waiting', 1, 3)];
    expect(waitingInOrder(players).map((x) => x.entryId)).toEqual(['c']);
  });
});

describe('selectPromotions', () => {
  it('fills exactly the open slots, in queue order', () => {
    const players = [
      p('a', 'playing', 2, 1),
      p('w1', 'waiting', 3, 10),
      p('w2', 'waiting', 3, 20),
      p('w3', 'waiting', 3, 30),
      p('w4', 'waiting', 3, 40),
    ];
    expect(selectPromotions(players, MAX).map((x) => x.entryId)).toEqual(['w1', 'w2', 'w3']);
  });

  it('promotes nobody when the game is full', () => {
    const players = [
      ...['a', 'b', 'c', 'd'].map((id, i) => p(id, 'playing', 2, i)),
      p('w1', 'waiting', 3, 10),
    ];
    expect(selectPromotions(players, MAX)).toEqual([]);
  });

  it('promotes nobody when the queue is empty', () => {
    expect(selectPromotions([p('a', 'playing', 2)], MAX)).toEqual([]);
  });
});

// ─── Finish game ──────────────────────────────────────────────────────────────

describe('computeFinishGame', () => {
  it('deducts exactly one credit from every playing player', () => {
    const players = [
      p('a', 'playing', 3, 1),
      p('b', 'playing', 5, 2),
      p('c', 'playing', 2, 3),
    ];
    const after = apply(players, computeFinishGame(players, MAX));
    expect(after.map((x) => [x.entryId, x.gamesLeft])).toEqual([
      ['a', 2],
      ['b', 4],
      ['c', 1],
    ]);
  });

  it('does not touch waiting or skipped players', () => {
    const players = [p('a', 'playing', 3, 1), p('w', 'waiting', 5, 2), p('h', 'skipped', 7, 3)];
    const after = apply(players, computeFinishGame(players, MAX));
    expect(after.find((x) => x.entryId === 'w')!.gamesLeft).toBe(5);
    expect(after.find((x) => x.entryId === 'h')!.gamesLeft).toBe(7);
  });

  it('retires a player who reaches zero and refills the slot', () => {
    // The README's worked example: A=3 B=1 C=5 D=2 → B hits zero.
    const players = [
      p('A', 'playing', 3, 1),
      p('B', 'playing', 1, 2),
      p('C', 'playing', 5, 3),
      p('D', 'playing', 2, 4),
      p('E', 'waiting', 4, 10),
    ];
    const plan = computeFinishGame(players, MAX);
    expect(plan.completedEntryIds).toEqual(['B']);
    expect(plan.promotedEntryIds).toEqual(['E']);

    const after = apply(players, plan);
    expect(after.find((x) => x.entryId === 'B')).toBeUndefined();
    expect(after.find((x) => x.entryId === 'E')!.status).toBe('playing');
    expect(after.filter((x) => x.status === 'playing').map((x) => x.entryId)).toEqual([
      'A', 'C', 'D', 'E',
    ]);
  });

  it('retires multiple zeroed players and refills every freed slot in order', () => {
    const players = [
      p('A', 'playing', 1, 1),
      p('B', 'playing', 1, 2),
      p('C', 'playing', 3, 3),
      p('w1', 'waiting', 2, 10),
      p('w2', 'waiting', 2, 20),
      p('w3', 'waiting', 2, 30),
    ];
    const plan = computeFinishGame(players, MAX);
    expect(plan.completedEntryIds).toEqual(['A', 'B']);
    // Two zeroed + one free slot to begin with = 3 promotions.
    expect(plan.promotedEntryIds).toEqual(['w1', 'w2', 'w3']);
    expect(countPlaying(apply(players, plan))).toBe(4);
  });

  it('records lifetime games played when retiring', () => {
    const players = [p('A', 'playing', 1, 1, 9)];
    const plan = computeFinishGame(players, MAX);
    expect(plan.actions).toContainEqual({ type: 'complete', entryId: 'A', gamesPlayed: 9 });
  });

  it('is a no-op when nobody is playing', () => {
    const plan = computeFinishGame([p('w', 'waiting', 3, 1)], MAX);
    expect(plan.actions).toEqual([]);
    expect(plan.promotedEntryIds).toEqual([]);
  });

  it('handles an empty queue with nobody to promote', () => {
    const players = [p('A', 'playing', 1, 1)];
    const plan = computeFinishGame(players, MAX);
    expect(plan.completedEntryIds).toEqual(['A']);
    expect(plan.promotedEntryIds).toEqual([]);
    expect(apply(players, plan)).toEqual([]);
  });

  it('never drives gamesLeft below zero even from corrupt stored state', () => {
    // Invariant 2, defended against bad data rather than assumed.
    const players = [p('A', 'playing', 0, 1)];
    const plan = computeFinishGame(players, MAX);
    expect(plan.completedEntryIds).toEqual(['A']);
    for (const after of apply(players, plan)) {
      expect(after.gamesLeft).toBeGreaterThanOrEqual(0);
    }
  });

  it('never exceeds the slot cap after refilling', () => {
    // Invariant 1, across a spread of starting shapes.
    for (let playing = 0; playing <= 4; playing++) {
      const players = [
        ...Array.from({ length: playing }, (_, i) => p(`g${i}`, 'playing', 1, i)),
        ...Array.from({ length: 6 }, (_, i) => p(`w${i}`, 'waiting', 2, 100 + i)),
      ];
      expect(countPlaying(apply(players, computeFinishGame(players, MAX)))).toBeLessThanOrEqual(MAX);
    }
  });
});

// ─── Skip / hutang game ───────────────────────────────────────────────────────

describe('computeSkip', () => {
  it('moves the player to skipped without deducting a credit', () => {
    const players = [p('a', 'playing', 3, 1)];
    const after = apply(players, computeSkip(players, 'a', MAX));
    expect(after[0].status).toBe('skipped');
    expect(after[0].gamesLeft).toBe(3); // unchanged — the whole point of hutang game
  });

  it('refills the freed slot from the queue', () => {
    const players = [
      ...['a', 'b', 'c', 'd'].map((id, i) => p(id, 'playing', 2, i)),
      p('w1', 'waiting', 3, 10),
      p('w2', 'waiting', 3, 20),
    ];
    const plan = computeSkip(players, 'a', MAX);
    expect(plan.promotedEntryIds).toEqual(['w1']);

    const after = apply(players, plan);
    expect(countPlaying(after)).toBe(4);
    expect(after.find((x) => x.entryId === 'a')!.status).toBe('skipped');
  });

  it('is a no-op for an unknown player', () => {
    expect(computeSkip([p('a', 'playing', 3)], 'nope', MAX).actions).toEqual([]);
  });

  it('is idempotent — skipping an already-skipped player does nothing', () => {
    // Guards the double-click case.
    expect(computeSkip([p('a', 'skipped', 3)], 'a', MAX).actions).toEqual([]);
  });

  it('refuses to skip a waiting player', () => {
    expect(computeSkip([p('a', 'waiting', 3)], 'a', MAX).actions).toEqual([]);
  });
});

describe('computeRejoinFromHutang', () => {
  it('returns the player to waiting with credits intact', () => {
    const players = [p('h', 'skipped', 4, 1)];
    const after = apply(players, computeRejoinFromHutang(players, 'h'));
    expect(after[0].status).toBe('waiting');
    expect(after[0].gamesLeft).toBe(4);
  });

  it('only acts on skipped players', () => {
    expect(computeRejoinFromHutang([p('a', 'playing', 2)], 'a').actions).toEqual([]);
    expect(computeRejoinFromHutang([p('a', 'waiting', 2)], 'a').actions).toEqual([]);
  });

  it('never produces a dual state', () => {
    // Invariant 3: exactly one status per player after the transition.
    const players = [p('h', 'skipped', 4, 1)];
    const after = apply(players, computeRejoinFromHutang(players, 'h'));
    expect(after).toHaveLength(1);
    expect(['waiting', 'playing', 'skipped']).toContain(after[0].status);
  });
});

// ─── Manual credit adjustment ─────────────────────────────────────────────────

describe('computeAdjustCredits', () => {
  it('increases credits', () => {
    const players = [p('a', 'playing', 2, 1)];
    const after = apply(players, computeAdjustCredits(players, 'a', +1, MAX));
    expect(after[0].gamesLeft).toBe(3);
  });

  it('decreases credits', () => {
    const players = [p('a', 'playing', 3, 1)];
    const after = apply(players, computeAdjustCredits(players, 'a', -1, MAX));
    expect(after[0].gamesLeft).toBe(2);
  });

  it('retires a playing player decremented to zero and refills the slot', () => {
    const players = [p('a', 'playing', 1, 1), p('w', 'waiting', 5, 10)];
    const plan = computeAdjustCredits(players, 'a', -1, MAX);
    expect(plan.completedEntryIds).toEqual(['a']);
    expect(plan.promotedEntryIds).toEqual(['w']);
  });

  it('does not promote when a non-playing player hits zero', () => {
    const players = [p('h', 'skipped', 1, 1), p('w', 'waiting', 5, 10)];
    const plan = computeAdjustCredits(players, 'h', -1, MAX);
    expect(plan.completedEntryIds).toEqual(['h']);
    expect(plan.promotedEntryIds).toEqual([]);
  });

  it('clamps at zero rather than going negative', () => {
    const players = [p('a', 'playing', 2, 1)];
    const plan = computeAdjustCredits(players, 'a', -10, MAX);
    expect(plan.completedEntryIds).toEqual(['a']);
    expect(apply(players, plan)).toEqual([]);
  });

  it('ignores zero and fractional deltas', () => {
    const players = [p('a', 'playing', 2, 1)];
    expect(computeAdjustCredits(players, 'a', 0, MAX).actions).toEqual([]);
    expect(computeAdjustCredits(players, 'a', 1.5, MAX).actions).toEqual([]);
  });
});

// ─── Admission of paid viewers ────────────────────────────────────────────────

describe('computeAdmission', () => {
  it('admits straight into the game when a slot is open', () => {
    expect(computeAdmission([], null, 3, MAX)).toEqual({ kind: 'admitted', status: 'playing' });
    const three = ['a', 'b', 'c'].map((id, i) => p(id, 'playing', 2, i));
    expect(computeAdmission(three, null, 3, MAX)).toEqual({ kind: 'admitted', status: 'playing' });
  });

  it('queues when the game is full', () => {
    const four = ['a', 'b', 'c', 'd'].map((id, i) => p(id, 'playing', 2, i));
    expect(computeAdmission(four, null, 3, MAX)).toEqual({ kind: 'queued', status: 'waiting' });
  });

  it('tops up an existing player without changing their status', () => {
    // A player mid-game who buys more credits must not be moved.
    const players = [p('a', 'playing', 2, 1, 5)];
    expect(computeAdmission(players, 'a', 3, MAX)).toEqual({
      kind: 'topped-up',
      entryId: 'a',
      gamesLeft: 5,
      totalGames: 8,
    });
  });

  it('tops up a hutang player without pulling them out of hutang', () => {
    const players = [p('h', 'skipped', 1, 1, 4)];
    const out = computeAdmission(players, 'h', 2, MAX);
    expect(out).toMatchObject({ kind: 'topped-up', gamesLeft: 3, totalGames: 6 });
  });

  it('treats a stale existing id as a new player', () => {
    expect(computeAdmission([], 'gone', 3, MAX)).toEqual({ kind: 'admitted', status: 'playing' });
  });

  it('rejects non-positive and fractional credit counts', () => {
    expect(computeAdmission([], null, 0, MAX)).toBeNull();
    expect(computeAdmission([], null, -5, MAX)).toBeNull();
    expect(computeAdmission([], null, 2.5, MAX)).toBeNull();
  });

  it('cannot overfill slots when applied sequentially', () => {
    // Models what a transaction must guarantee: each admission sees the
    // previous one. Simultaneous non-transactional reads are exactly the
    // live bug this replaces.
    let players: QueueSlotPlayer[] = [];
    const outcomes: string[] = [];
    for (let i = 0; i < 6; i++) {
      const out = computeAdmission(players, null, 1, MAX)!;
      outcomes.push(out.kind);
      players = [
        ...players,
        p(`v${i}`, out.kind === 'admitted' ? 'playing' : 'waiting', 1, i),
      ];
    }
    expect(outcomes).toEqual([
      'admitted', 'admitted', 'admitted', 'admitted', 'queued', 'queued',
    ]);
    expect(countPlaying(players)).toBe(MAX);
  });
});
