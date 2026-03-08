/**
 * Converts a Sociabuzz donation amount (RM) into number of games.
 * Tiers: RM4=1, RM10=3, RM20=6, RM30=10
 * Uses highest matching tier (e.g. RM25 -> 6 games).
 */
export function convertDonationToGames(amount: number): number {
  if (amount >= 30) return 10;
  if (amount >= 20) return 6;
  if (amount >= 10) return 3;
  if (amount >= 4) return 1;
  return 0;
}

/**
 * Extracts the IGN from a donation message.
 * Expects format: "IGN: AliPro" (case-insensitive, optional space after colon).
 * Returns null if no IGN found.
 */
export function extractIGN(message: string): string | null {
  const match = message.match(/IGN\s*:\s*(.+)/i);
  if (!match) return null;
  return match[1].trim();
}
