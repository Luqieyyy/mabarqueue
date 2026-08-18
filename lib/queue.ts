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
import { getActiveGame } from './settings';
import { getGameDefinition, DEFAULT_GAME, type GameId } from './games';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlayerStatus = 'waiting' | 'playing' | 'skipped';

export interface GamePlayer {
  id: string;
  username: string;
  ign: string;
  totalGames: number;
  gamesLeft: number;
  status: PlayerStatus;
  orderDate: string;
  timestamp: Timestamp | null;
  player_id?: string;
  transaction_id?: string;
  packageTitle?: string;
  game?: GameId;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatOrderDate(date: Date = new Date()): string {
  const months = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
  ];
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

function queueCol(uid: string) {
  return collection(db, 'users', uid, 'queue');
}

function queueDoc(uid: string, docId: string) {
  return doc(db, 'users', uid, 'queue', docId);
}

function historyCol(uid: string) {
  return collection(db, 'users', uid, 'history');
}

/** Resolves the number of viewer slots for the given game. */
export async function getMaxSlots(uid: string): Promise<number> {
  return getGameDefinition(await getActiveGame(uid)).slotCount;
}

async function getPlayingCount(uid: string, game: GameId): Promise<number> {
  const snap = await getDocs(
    query(queueCol(uid), where('status', '==', 'playing'), where('game', '==', game)),
  );
  return snap.docs.length;
}

/** Promotes the oldest waiting player of the given game into an open slot, if one exists. */
async function promoteFromQueue(uid: string, game: GameId): Promise<void> {
  const playingCount = await getPlayingCount(uid, game);
  const maxSlots = getGameDefinition(game).slotCount;
  if (playingCount >= maxSlots) return;

  const nextSnap = await getDocs(
    query(
      queueCol(uid),
      where('status', '==', 'waiting'),
      where('game', '==', game),
      orderBy('timestamp', 'asc'),
      limit(1),
    ),
  );
  if (nextSnap.empty) return;

  await updateDoc(nextSnap.docs[0].ref, { status: 'playing' });
}

// ─── Add Player ───────────────────────────────────────────────────────────────

export async function addPlayerToQueue(
  uid: string,
  username: string,
  ign: string,
  games: number,
  orderDate?: string,
  player_id?: string,
  transaction_id?: string,
  packageTitle?: string,
): Promise<void> {
  if (games <= 0) return;
  const date = orderDate ?? formatOrderDate();
  const activeGame = await getActiveGame(uid);

  const extras: Record<string, string> = {};
  if (player_id) extras.player_id = player_id;
  if (transaction_id) extras.transaction_id = transaction_id;
  if (packageTitle) extras.packageTitle = packageTitle;

  // Check if player already exists in this game's queue (any status)
  const existingSnap = await getDocs(
    query(queueCol(uid), where('username', '==', username), where('game', '==', activeGame)),
  );
  if (!existingSnap.empty) {
    const existing = existingSnap.docs[0];
    await updateDoc(existing.ref, {
      gamesLeft: existing.data().gamesLeft + games,
      totalGames: existing.data().totalGames + games,
      ...(ign ? { ign } : {}),  // update IGN if a new one was parsed
      ...extras,
    });
    return;
  }

  // Determine status: playing if slot open, otherwise waiting
  const playingCount = await getPlayingCount(uid, activeGame);
  const maxSlots = getGameDefinition(activeGame).slotCount;
  const status: PlayerStatus = playingCount < maxSlots ? 'playing' : 'waiting';

  await addDoc(queueCol(uid), {
    username, ign, totalGames: games, gamesLeft: games,
    status, orderDate: date, timestamp: serverTimestamp(), game: activeGame, ...extras,
  });
}

// ─── Finish Game ──────────────────────────────────────────────────────────────

export async function finishGame(uid: string): Promise<void> {
  const activeGame = await getActiveGame(uid);
  const playingSnap = await getDocs(
    query(queueCol(uid), where('status', '==', 'playing'), where('game', '==', activeGame)),
  );
  if (playingSnap.empty) return;

  let slotsFreed = 0;

  await Promise.all(
    playingSnap.docs.map(async (d) => {
      const data = d.data();
      const newLeft = data.gamesLeft - 1;

      if (newLeft <= 0) {
        // Move to history, delete from queue
        await addDoc(historyCol(uid), {
          username: data.username,
          ign: data.ign,
          player_id: data.player_id || null,
          gamesPlayed: data.totalGames,
          game: activeGame,
          completedAt: serverTimestamp(),
        });
        await deleteDoc(d.ref);
        slotsFreed++;
      } else {
        await updateDoc(d.ref, { gamesLeft: newLeft });
      }
    }),
  );

  for (let i = 0; i < slotsFreed; i++) {
    await promoteFromQueue(uid, activeGame);
  }
}

// ─── Skip → Hutang (playing → skipped) ───────────────────────────────────────

export async function skipCurrentPlayer(uid: string, docId: string): Promise<void> {
  const ref = queueDoc(uid, docId);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().status !== 'playing') return;
  const game = (snap.data().game as GameId | undefined) ?? DEFAULT_GAME;
  await updateDoc(ref, { status: 'skipped', timestamp: serverTimestamp() });
  await promoteFromQueue(uid, game);
}

// ─── Move Back to Queue (playing → waiting) ─────────────────────────────────

export async function moveCurrentToQueue(uid: string, docId: string): Promise<void> {
  const ref = queueDoc(uid, docId);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().status !== 'playing') return;
  await updateDoc(ref, { status: 'waiting', timestamp: serverTimestamp() });
}

// ─── Remove Player (any status) ──────────────────────────────────────────────

export async function removeCurrentPlayer(uid: string, docId: string): Promise<void> {
  await deleteDoc(queueDoc(uid, docId));
  await promoteFromQueue(uid, await getActiveGame(uid));
}

export async function removeFromQueue(uid: string, docId: string): Promise<void> {
  await deleteDoc(queueDoc(uid, docId));
}

export async function removeHutang(uid: string, docId: string): Promise<void> {
  await deleteDoc(queueDoc(uid, docId));
}

// ─── Adjust Games (works for any status) ─────────────────────────────────────

export async function increaseCurrentGames(uid: string, docId: string): Promise<void> {
  const ref = queueDoc(uid, docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await updateDoc(ref, {
    gamesLeft: snap.data().gamesLeft + 1,
    totalGames: snap.data().totalGames + 1,
  });
}

export async function decreaseCurrentGames(uid: string, docId: string): Promise<void> {
  const ref = queueDoc(uid, docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const newLeft = data.gamesLeft - 1;
  const game = (data.game as GameId | undefined) ?? DEFAULT_GAME;
  if (newLeft <= 0) {
    if (data.status === 'playing') {
      await addDoc(historyCol(uid), {
        username: data.username, ign: data.ign,
        player_id: data.player_id || null,
        gamesPlayed: data.totalGames, game, completedAt: serverTimestamp(),
      });
    }
    await deleteDoc(ref);
    if (data.status === 'playing') await promoteFromQueue(uid, game);
  } else {
    await updateDoc(ref, { gamesLeft: newLeft });
  }
}

export async function increasePlayerGames(uid: string, docId: string): Promise<void> {
  return increaseCurrentGames(uid, docId);
}

export async function decreasePlayerGames(uid: string, docId: string): Promise<void> {
  return decreaseCurrentGames(uid, docId);
}

export async function increaseHutangGames(uid: string, docId: string): Promise<void> {
  return increaseCurrentGames(uid, docId);
}

export async function decreaseHutangGames(uid: string, docId: string): Promise<void> {
  return decreaseCurrentGames(uid, docId);
}

// ─── Queue → In Game (waiting → playing) ────────────────────────────────────

export async function promoteQueuePlayerToGame(uid: string, docId: string): Promise<void> {
  const ref = queueDoc(uid, docId);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().status !== 'waiting') return;
  const game = (snap.data().game as GameId | undefined) ?? DEFAULT_GAME;

  const playingCount = await getPlayingCount(uid, game);
  const maxSlots = getGameDefinition(game).slotCount;
  if (playingCount >= maxSlots) return;

  await updateDoc(ref, { status: 'playing' });
}

// ─── Queue → Hutang (waiting → skipped) ─────────────────────────────────────

export async function skipQueuePlayer(uid: string, docId: string): Promise<void> {
  const ref = queueDoc(uid, docId);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().status !== 'waiting') return;
  await updateDoc(ref, { status: 'skipped', timestamp: serverTimestamp() });
}

// ─── Hutang → Queue (skipped → waiting) ─────────────────────────────────────

export async function settleHutang(uid: string, docId: string): Promise<void> {
  const ref = queueDoc(uid, docId);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().status !== 'skipped') return;
  await updateDoc(ref, { status: 'waiting', timestamp: serverTimestamp() });
}
