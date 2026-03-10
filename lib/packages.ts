import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StreamerPackage {
  title: string;
  price: number;
  description: string;
  matchCount: number;
  isActive: boolean;
  createdAt: unknown; // Firestore Timestamp
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function packagesCol(uid: string) {
  return collection(db, 'users', uid, 'packages');
}

function packageDoc(uid: string, title: string) {
  return doc(db, 'users', uid, 'packages', title);
}

// ─── Match Count Detection ───────────────────────────────────────────────────

/**
 * Extracts the number of matches/games from a package title or description.
 *
 *   "PACKAGE MABAR 3 GAME"       → 3
 *   "1 MATCH RM 1"               → 1
 *   "MAIN 5 GAME"                → 5
 *   "PACKAGE 9 GAME"             → 9
 *   "1 GAME"                     → 1
 *   "MAINKAN AKAUN RM55 (15-20 GAMES)" → 15
 *   "JOKI ACCOUNT"               → 1 (fallback)
 *
 * Tries multiple regex patterns in order of specificity.
 * Returns 1 if no number can be detected.
 */
export function extractMatchCount(text: string): number {
  if (!text) return 1;

  const cleaned = text.replace(/<[^>]*>/g, '').trim(); // strip HTML tags

  // Pattern 1: N GAME(S) or N MATCH(ES)
  const gameMatch = cleaned.match(/(\d+)\s*(?:GAME|MATCH|PERLAWANAN)/i);
  if (gameMatch) return parseInt(gameMatch[1], 10) || 1;

  // Pattern 2: PACKAGE N or PACKAGE X N GAME
  const packageNum = cleaned.match(/PACKAGE\s+(?:\w+\s+)?(\d+)/i);
  if (packageNum) return parseInt(packageNum[1], 10) || 1;

  // Pattern 3: MAIN N GAME
  const mainMatch = cleaned.match(/MAIN\s+(\d+)/i);
  if (mainMatch) return parseInt(mainMatch[1], 10) || 1;

  // Pattern 4: standalone number that looks like a count (1-99)
  const standaloneNum = cleaned.match(/\b(\d{1,2})\b/);
  if (standaloneNum) {
    const n = parseInt(standaloneNum[1], 10);
    if (n >= 1 && n <= 50) return n;
  }

  return 1;
}

// ─── CRUD Operations ─────────────────────────────────────────────────────────

/** Get a single package by title */
export async function getPackage(uid: string, title: string): Promise<StreamerPackage | null> {
  const snap = await getDoc(packageDoc(uid, title));
  if (!snap.exists()) return null;
  return { title: snap.id, ...snap.data() } as StreamerPackage;
}

/** Get all packages for a streamer */
export async function getPackages(uid: string): Promise<StreamerPackage[]> {
  const snap = await getDocs(query(packagesCol(uid), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ title: d.id, ...d.data() }) as StreamerPackage);
}

/**
 * Ensure a package exists. If it doesn't, create it automatically.
 * Called during webhook processing when a donation with level.title arrives.
 *
 * Returns the package (existing or newly created) and whether it's active.
 */
export async function ensurePackageExists(
  uid: string,
  levelTitle: string,
  levelPrice: number,
  levelDescription: string,
): Promise<{ pkg: StreamerPackage; isNew: boolean }> {
  const existing = await getPackage(uid, levelTitle);
  if (existing) {
    return { pkg: existing, isNew: false };
  }

  // Auto-detect match count from title first, then description
  const matchCount = extractMatchCount(levelTitle) || extractMatchCount(levelDescription);

  const newPkg: StreamerPackage = {
    title: levelTitle,
    price: levelPrice,
    description: levelDescription.replace(/<[^>]*>/g, '').trim(), // strip HTML
    matchCount,
    isActive: true,
    createdAt: serverTimestamp(),
  };

  await setDoc(packageDoc(uid, levelTitle), newPkg);
  console.log(`[Packages/${uid}] ✓ Auto-created package: "${levelTitle}" (${matchCount} matches, RM${levelPrice})`);

  return { pkg: newPkg, isNew: true };
}

/** Delete a package. Does NOT affect existing donation/queue history. */
export async function deletePackage(uid: string, title: string): Promise<void> {
  await deleteDoc(packageDoc(uid, title));
}

/** Toggle package active status */
export async function togglePackage(uid: string, title: string, isActive: boolean): Promise<void> {
  await setDoc(packageDoc(uid, title), { isActive }, { merge: true });
}

/** Update package match count manually */
export async function updatePackageMatchCount(uid: string, title: string, matchCount: number): Promise<void> {
  await setDoc(packageDoc(uid, title), { matchCount }, { merge: true });
}

/**
 * Sync packages from existing donation records.
 * Scans all donations with a levelTitle and rebuilds missing packages.
 * Avoids duplicates — only creates packages that don't exist yet.
 *
 * Returns the number of new packages created.
 */
export async function syncPackages(uid: string): Promise<number> {
  const donationsSnap = await getDocs(collection(db, 'users', uid, 'donations'));
  const existingPackages = new Set(
    (await getDocs(packagesCol(uid))).docs.map((d) => d.id),
  );

  let created = 0;
  const seen = new Set<string>();

  for (const d of donationsSnap.docs) {
    const data = d.data();
    const title = data.levelTitle || data.packageTitle;
    if (!title || existingPackages.has(title) || seen.has(title)) continue;

    seen.add(title);

    const price = data.amount || data.price || 0;
    const description = data.levelDescription || '';
    const matchCount = extractMatchCount(title) || extractMatchCount(description);

    await setDoc(packageDoc(uid, title), {
      title,
      price,
      description: typeof description === 'string' ? description.replace(/<[^>]*>/g, '').trim() : '',
      matchCount,
      isActive: true,
      createdAt: serverTimestamp(),
    });

    created++;
  }

  console.log(`[Packages/${uid}] Sync complete: ${created} new packages created`);
  return created;
}
