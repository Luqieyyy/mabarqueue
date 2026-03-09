/**
 * Donation message parsing and package detection for MabarQueue.
 *
 * Handles messy viewer messages to extract Mobile Legends player ID and IGN,
 * and determines number of games from Sociabuzz level/package title.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedMessage {
  player_id: string;  // Mobile Legends numeric ID (6–10 digits)
  ign: string;        // In-Game Name (word following the ID)
}

// ─── Message Parser ───────────────────────────────────────────────────────────

/**
 * Extracts Mobile Legends player ID and IGN from a donation message.
 *
 * The player ID is a 6–10 digit number. The IGN is the word immediately
 * following it. Handles messy messages like:
 *
 *   "43149159 luqman"                                → { player_id: "43149159", ign: "luqman" }
 *   "hello bang add saya 43149159 luqman nak main"   → { player_id: "43149159", ign: "luqman" }
 *   "id saya 43149159 ign luqman"                    → { player_id: "43149159", ign: "luqman" }
 *   "ID: 43149159 IGN: luqman"                       → { player_id: "43149159", ign: "luqman" }
 *   "43149159(1234) luqman"                          → { player_id: "43149159", ign: "luqman" }
 *
 * Returns null if no valid ML ID is found.
 */
export function parseMessage(message: string): ParsedMessage | null {
  if (!message || !message.trim()) return null;

  const cleaned = message.trim();

  // Strategy 1: Look for "IGN:" label after the numeric ID
  // e.g. "id saya 43149159 ign: luqman" or "43149159 IGN: luqman"
  const ignLabelMatch = cleaned.match(
    /(\d{6,10})(?:\s*\(\d+\))?\s+(?:ign\s*[:=]\s*)(\S+)/i
  );
  if (ignLabelMatch) {
    return { player_id: ignLabelMatch[1], ign: ignLabelMatch[2] };
  }

  // Strategy 2: Look for "ID:" label followed by digits, then IGN
  // e.g. "ID: 43149159 IGN: luqman" or "id:43149159 luqman"
  const idLabelMatch = cleaned.match(
    /id\s*[:=]\s*(\d{6,10})(?:\s*\(\d+\))?\s+(?:ign\s*[:=]\s*)?(\S+)/i
  );
  if (idLabelMatch) {
    return { player_id: idLabelMatch[1], ign: idLabelMatch[2] };
  }

  // Strategy 3: Generic — find a 6–10 digit number, take the next word as IGN
  // Handles "43149159 luqman", "bang 43149159 luqman nak main", etc.
  // The optional (\d+) handles server IDs like "43149159(1234)"
  const genericMatch = cleaned.match(
    /(\d{6,10})(?:\s*\(\d+\))?\s+(\S+)/
  );
  if (genericMatch) {
    let ign = genericMatch[2];
    // Skip filler words that are clearly not an IGN
    const fillerWords = new Set([
      'ign', 'ign:', 'nama', 'name', 'name:', 'nick', 'nick:',
      'nickname', 'nickname:', 'id', 'id:', 'saya', 'nak', 'mau',
      'ingin', 'tolong', 'please', 'bang', 'bro',
    ]);
    if (fillerWords.has(ign.toLowerCase())) {
      // If the word after the ID is filler, try the word after that
      const afterFiller = cleaned
        .slice(cleaned.indexOf(genericMatch[0]) + genericMatch[0].length)
        .trim()
        .match(/^(\S+)/);
      if (afterFiller) {
        ign = afterFiller[1];
      }
    }
    return { player_id: genericMatch[1], ign };
  }

  // Strategy 4: Message contains only a bare ML ID with no IGN
  const bareIdMatch = cleaned.match(/(\d{6,10})/);
  if (bareIdMatch) {
    return { player_id: bareIdMatch[1], ign: '' };
  }

  return null;
}

// ─── Legacy IGN Extractor (kept for backward compatibility) ───────────────────

/**
 * Extracts IGN from "IGN: AliPro" format. Returns null if not found.
 */
export function extractIGN(message: string): string | null {
  const match = message.match(/IGN\s*:\s*(.+)/i);
  if (!match) return null;
  return match[1].trim();
}

// ─── Package / Level Detection ────────────────────────────────────────────────

/**
 * Determines number of games from a Sociabuzz level/package title.
 *
 *   "PACKAGE MABAR 1 GAME"   → 1
 *   "PACKAGE MABAR 3 GAME"   → 3
 *   "PACKAGE MABAR 5 GAME"   → 5
 *   "PACKAGE PRIORITY"       → null  (no game count — caller decides)
 *   undefined / empty        → null
 *
 * Returns null if the title doesn't contain a recognizable game count,
 * so the caller can fall back to amount-based conversion.
 */
export function extractGamesFromPackage(title: string | undefined | null): number | null {
  if (!title) return null;

  // Look for a number followed by "GAME" (case-insensitive)
  const match = title.match(/(\d+)\s*GAME/i);
  if (match) {
    const games = parseInt(match[1], 10);
    return games > 0 ? games : null;
  }

  return null;
}

// ─── Legacy Amount Converter (hardcoded tiers — superseded by settings.ts) ────

export function convertDonationToGames(amount: number): number {
  if (amount >= 30) return 10;
  if (amount >= 20) return 6;
  if (amount >= 10) return 3;
  if (amount >= 4) return 1;
  return 0;
}
