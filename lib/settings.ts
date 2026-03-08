import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface RateTier {
  amount: number; // minimum RM
  games: number;  // games awarded (1–10)
}

export interface FeatureSettings {
  commentAlbum: boolean;
}

export const DEFAULT_TIERS: RateTier[] = [
  { amount: 4, games: 1 },
  { amount: 10, games: 3 },
  { amount: 20, games: 6 },
  { amount: 30, games: 10 },
];

export async function getRates(): Promise<RateTier[]> {
  const snap = await getDoc(doc(db, 'settings', 'rates'));
  if (!snap.exists()) return DEFAULT_TIERS;
  return (snap.data().tiers as RateTier[]) ?? DEFAULT_TIERS;
}

export async function saveRates(tiers: RateTier[]): Promise<void> {
  await setDoc(doc(db, 'settings', 'rates'), { tiers }, { merge: true });
}

export async function getFeatures(): Promise<FeatureSettings> {
  const snap = await getDoc(doc(db, 'settings', 'features'));
  if (!snap.exists()) return { commentAlbum: false };
  return snap.data() as FeatureSettings;
}

export async function saveFeatures(features: FeatureSettings): Promise<void> {
  await setDoc(doc(db, 'settings', 'features'), features, { merge: true });
}

/** Converts donation amount to games using saved tiers. Returns 0 if below minimum. */
export function convertAmountToGames(amount: number, tiers: RateTier[]): number {
  const sorted = [...tiers].sort((a, b) => b.amount - a.amount);
  for (const tier of sorted) {
    if (amount >= tier.amount) return tier.games;
  }
  return 0;
}
