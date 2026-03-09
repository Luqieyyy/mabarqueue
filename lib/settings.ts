import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface RateTier {
  amount: number;
  games: number;
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

/** All settings are scoped under users/{uid}/settings/ */
function settingsDoc(uid: string, name: string) {
  return doc(db, 'users', uid, 'settings', name);
}

export async function getRates(uid: string): Promise<RateTier[]> {
  const snap = await getDoc(settingsDoc(uid, 'rates'));
  if (!snap.exists()) return DEFAULT_TIERS;
  return (snap.data().tiers as RateTier[]) ?? DEFAULT_TIERS;
}

export async function saveRates(uid: string, tiers: RateTier[]): Promise<void> {
  await setDoc(settingsDoc(uid, 'rates'), { tiers }, { merge: true });
}

export async function getFeatures(uid: string): Promise<FeatureSettings> {
  const snap = await getDoc(settingsDoc(uid, 'features'));
  if (!snap.exists()) return { commentAlbum: false };
  return snap.data() as FeatureSettings;
}

export async function saveFeatures(uid: string, features: FeatureSettings): Promise<void> {
  await setDoc(settingsDoc(uid, 'features'), features, { merge: true });
}

export async function getWebhookToken(uid: string): Promise<string | null> {
  const snap = await getDoc(settingsDoc(uid, 'webhook'));
  if (!snap.exists()) return null;
  return (snap.data().token as string | undefined)?.trim() || null;
}

export async function saveWebhookToken(uid: string, token: string): Promise<void> {
  await setDoc(settingsDoc(uid, 'webhook'), { token: token.trim() }, { merge: true });
}

/** Converts donation amount to games using saved tiers. Returns 0 if below minimum. */
export function convertAmountToGames(amount: number, tiers: RateTier[]): number {
  const sorted = [...tiers].sort((a, b) => b.amount - a.amount);
  for (const tier of sorted) {
    if (amount >= tier.amount) return tier.games;
  }
  return 0;
}
