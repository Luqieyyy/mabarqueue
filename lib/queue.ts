import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GamePlayer {
  id: string;
  username: string;   // Sociabuzz donor name / manual entry
  ign: string;        // In-Game Name displayed in overlay
  totalGames: number; // Total games purchased (accumulates on re-donation)
  gamesLeft: number;  // Remaining games to play
  orderDate: string;  // e.g. "8 MARCH"
  timestamp: Timestamp | null;
}

export const MAX_GAME_SLOTS = 4;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatOrderDate(date: Date = new Date()): string {
  const months = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
  ];
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

// ─── Add Player ───────────────────────────────────────────────────────────────

/**
 * Adds a player to the system.
 * - If they are already IN GAME, bumps their totalGames + gamesLeft.
 * - If they are already in the queue, bumps their totals.
 * - If the game has an open slot (< 4 viewers), they join IN GAME directly.
 * - Otherwise they join the waiting queue.
 */
export async function addPlayerToQueue(
  username: string,
  ign: string,
  games: number,
  orderDate?: string,
): Promise<void> {
  if (games <= 0) return;
  const date = orderDate ?? formatOrderDate();

  // Check in current game
  const gameSnap = await getDocs(collection(db, 'current_game'));
  const inGame = gameSnap.docs.find((d) => d.data().username === username);
  if (inGame) {
    await updateDoc(inGame.ref, {
      gamesLeft: inGame.data().gamesLeft + games,
      totalGames: inGame.data().totalGames + games,
    });
    return;
  }

  // Check in queue
  const queueSnap = await getDocs(
    query(collection(db, 'queue'), where('username', '==', username)),
  );
  if (!queueSnap.empty) {
    const existing = queueSnap.docs[0];
    await updateDoc(existing.ref, {
      gamesLeft: existing.data().gamesLeft + games,
      totalGames: existing.data().totalGames + games,
    });
    return;
  }

  // Fill open game slot if available
  if (gameSnap.docs.length < MAX_GAME_SLOTS) {
    await addDoc(collection(db, 'current_game'), {
      username,
      ign,
      totalGames: games,
      gamesLeft: games,
      orderDate: date,
      timestamp: serverTimestamp(),
    });
    return;
  }

  // Otherwise join the waiting queue
  await addDoc(collection(db, 'queue'), {
    username,
    ign,
    totalGames: games,
    gamesLeft: games,
    orderDate: date,
    timestamp: serverTimestamp(),
  });
}

// ─── Finish Game ──────────────────────────────────────────────────────────────

/**
 * Streamer presses "Finish Game":
 * - Decrements gamesLeft by 1 for EVERY viewer currently in the game.
 * - Viewers who hit 0 are removed and replaced by the next in queue.
 */
export async function finishGame(): Promise<void> {
  const gameSnap = await getDocs(collection(db, 'current_game'));
  if (gameSnap.empty) {
    await promoteFromQueue();
    return;
  }

  let removed = 0;
  await Promise.all(
    gameSnap.docs.map(async (d) => {
      const newLeft = d.data().gamesLeft - 1;
      if (newLeft <= 0) {
        await deleteDoc(d.ref);
        removed++;
      } else {
        await updateDoc(d.ref, { gamesLeft: newLeft });
      }
    }),
  );

  // For each freed slot, pull the next person from queue
  for (let i = 0; i < removed; i++) {
    await promoteFromQueue();
  }
}

// ─── Skip Current Player → Hutang ────────────────────────────────────────────

/**
 * Syno skips a specific in-game viewer (e.g. internet issues).
 * - Viewer moves to hutang_game WITHOUT any game deduction.
 * - Their slot is filled from the queue.
 */
export async function skipCurrentPlayer(docId: string): Promise<void> {
  const ref = doc(db, 'current_game', docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  await addDoc(collection(db, 'hutang_game'), {
    ...snap.data(),
    skippedAt: serverTimestamp(),
  });
  await deleteDoc(ref);
  await promoteFromQueue();
}

// ─── Remove Current Player ────────────────────────────────────────────────────

export async function removeCurrentPlayer(docId: string): Promise<void> {
  await deleteDoc(doc(db, 'current_game', docId));
  await promoteFromQueue();
}

// ─── Adjust Current Player Games ─────────────────────────────────────────────

export async function increaseCurrentGames(docId: string): Promise<void> {
  const ref = doc(db, 'current_game', docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await updateDoc(ref, {
    gamesLeft: snap.data().gamesLeft + 1,
    totalGames: snap.data().totalGames + 1,
  });
}

export async function decreaseCurrentGames(docId: string): Promise<void> {
  const ref = doc(db, 'current_game', docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const newLeft = snap.data().gamesLeft - 1;
  if (newLeft <= 0) {
    await deleteDoc(ref);
    await promoteFromQueue();
  } else {
    await updateDoc(ref, { gamesLeft: newLeft });
  }
}

// ─── Queue Management ─────────────────────────────────────────────────────────

export async function removeFromQueue(docId: string): Promise<void> {
  await deleteDoc(doc(db, 'queue', docId));
}

export async function skipQueuePlayer(docId: string): Promise<void> {
  const ref = doc(db, 'queue', docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await addDoc(collection(db, 'hutang_game'), {
    ...snap.data(),
    skippedAt: serverTimestamp(),
  });
  await deleteDoc(ref);
}

export async function increasePlayerGames(docId: string): Promise<void> {
  const ref = doc(db, 'queue', docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await updateDoc(ref, {
    gamesLeft: snap.data().gamesLeft + 1,
    totalGames: snap.data().totalGames + 1,
  });
}

export async function decreasePlayerGames(docId: string): Promise<void> {
  const ref = doc(db, 'queue', docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const newLeft = snap.data().gamesLeft - 1;
  if (newLeft <= 0) {
    await deleteDoc(ref);
  } else {
    await updateDoc(ref, { gamesLeft: newLeft });
  }
}

// ─── Hutang Game ──────────────────────────────────────────────────────────────

/** Move hutang player back to the waiting queue */
export async function settleHutang(docId: string): Promise<void> {
  const ref = doc(db, 'hutang_game', docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await addDoc(collection(db, 'queue'), {
    ...snap.data(),
    timestamp: serverTimestamp(),
  });
  await deleteDoc(ref);
}

export async function removeHutang(docId: string): Promise<void> {
  await deleteDoc(doc(db, 'hutang_game', docId));
}

export async function increaseHutangGames(docId: string): Promise<void> {
  const ref = doc(db, 'hutang_game', docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await updateDoc(ref, {
    gamesLeft: snap.data().gamesLeft + 1,
    totalGames: snap.data().totalGames + 1,
  });
}

export async function decreaseHutangGames(docId: string): Promise<void> {
  const ref = doc(db, 'hutang_game', docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const newLeft = snap.data().gamesLeft - 1;
  if (newLeft <= 0) {
    await deleteDoc(ref);
  } else {
    await updateDoc(ref, { gamesLeft: newLeft });
  }
}

// ─── Internal: Promote Next From Queue ───────────────────────────────────────

async function promoteFromQueue(): Promise<void> {
  const gameSnap = await getDocs(collection(db, 'current_game'));
  if (gameSnap.docs.length >= MAX_GAME_SLOTS) return;

  const nextSnap = await getDocs(
    query(collection(db, 'queue'), orderBy('timestamp', 'asc'), limit(1)),
  );
  if (nextSnap.empty) return;

  const next = nextSnap.docs[0];
  await addDoc(collection(db, 'current_game'), next.data());
  await deleteDoc(next.ref);
}
