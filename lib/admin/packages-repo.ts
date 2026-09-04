/**
 * Game packages for a streamer — server-only.
 *
 * Two deliberate differences from the legacy `lib/packages.ts`:
 *
 *   - Documents use an opaque auto-ID, not the package title. Titles contain
 *     spaces and parentheses, and a title containing "/" would corrupt the
 *     document path outright.
 *   - Prices are integer sen (`priceSen`), never floating-point ringgit, so
 *     no fee or total is ever computed from a float.
 *
 * Price and game count are only ever read from here server-side — a client
 * sends a `packageId` and nothing else about the money.
 */

import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { packagesCol } from './paths';
import { toSen, type Sen } from '../domain/money';
import type { GamePackage, PublicPackage } from '../domain/types';
import type { PackageId, StreamerId } from '../domain/ids';
import { MAX_PACKAGES_PER_STREAMER, type PackageInput } from '../domain/package-rules';

// Validation lives in the pure domain layer so it stays unit-testable; the
// API routes import it from there directly.
export { validatePackageInput, MAX_GAMES_PER_PACKAGE } from '../domain/package-rules';
export type { PackageInput } from '../domain/package-rules';

export async function createPackage(
  streamerId: StreamerId,
  input: PackageInput,
): Promise<{ ok: true; packageId: string } | { ok: false; message: string }> {
  const col = packagesCol(streamerId);
  const existing = await col.count().get();
  if (existing.data().count >= MAX_PACKAGES_PER_STREAMER) {
    return { ok: false, message: `You can have at most ${MAX_PACKAGES_PER_STREAMER} packages.` };
  }

  const ref = col.doc();
  await ref.set({
    ...input,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, packageId: ref.id };
}

export async function updatePackage(
  streamerId: StreamerId,
  packageId: string,
  input: Partial<PackageInput>,
): Promise<boolean> {
  const ref = packagesCol(streamerId).doc(packageId);
  const snap = await ref.get();
  if (!snap.exists) return false;

  await ref.set({ ...input, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return true;
}

export async function deletePackage(streamerId: StreamerId, packageId: string): Promise<boolean> {
  const ref = packagesCol(streamerId).doc(packageId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  // Existing donations keep their own `packageTitle` snapshot, so deleting a
  // package never rewrites history.
  await ref.delete();
  return true;
}

export async function listPackages(streamerId: StreamerId): Promise<GamePackage[]> {
  const snap = await packagesCol(streamerId).orderBy('sortOrder', 'asc').get();
  return snap.docs.map((d) => toPackage(streamerId, d.id, d.data()));
}

/** Enabled packages only, projected to the fields a public page may see. */
export async function listPublicPackages(streamerId: StreamerId): Promise<PublicPackage[]> {
  const snap = await packagesCol(streamerId).where('enabled', '==', true).get();
  return snap.docs
    .map((d) => toPackage(streamerId, d.id, d.data()))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => ({
      packageId: p.packageId,
      title: p.title,
      description: p.description,
      priceSen: p.priceSen,
      games: p.games,
    }));
}

/**
 * Reads one package, verifying it belongs to this streamer.
 *
 * Scoping the lookup by `streamerId` is what stops a crafted `packageId` from
 * another streamer's workspace being used to buy at someone else's price.
 */
export async function getPackage(
  streamerId: StreamerId,
  packageId: string,
): Promise<GamePackage | null> {
  const snap = await packagesCol(streamerId).doc(packageId).get();
  if (!snap.exists) return null;
  return toPackage(streamerId, snap.id, snap.data()!);
}

function toPackage(
  streamerId: StreamerId,
  id: string,
  d: Record<string, unknown>,
): GamePackage {
  return {
    packageId: id as PackageId,
    streamerId,
    title: String(d.title ?? ''),
    description: String(d.description ?? ''),
    priceSen: toSen(Number(d.priceSen ?? 0)) as Sen,
    games: Number(d.games ?? 0),
    enabled: Boolean(d.enabled),
    sortOrder: Number(d.sortOrder ?? 0),
    createdAt: (d.createdAt as GamePackage['createdAt']) ?? null,
    updatedAt: (d.updatedAt as GamePackage['updatedAt']) ?? null,
  };
}
