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

  // Strategy 3: Generic — find a 6–10 digit number, collect words as IGN
  // Stops when hitting a filler/connector word that's clearly not part of the IGN.
  // Handles multi-word IGNs: "43149159 Luqman bahrin bang nak main" → ign: "Luqman bahrin"
  const genericMatch = cleaned.match(/(\d{6,10})(?:\s*\(\d+\))?\s+(.+)/);
  if (genericMatch) {
    const fillerWords = new Set([
      'ign', 'ign:', 'nama', 'name', 'name:', 'nick', 'nick:',
      'nickname', 'nickname:', 'id', 'id:', 'saya', 'nak', 'mau',
      'ingin', 'tolong', 'please', 'bang', 'bro', 'kak', 'abang',
      'la', 'lah', 'ya', 'ye', 'ok', 'okay', 'join', 'add',
      'sekali', 'dua', 'tiga', 'main', 'game', 'nak', 'nk',
    ]);
    const words = genericMatch[2].trim().split(/\s+/);
    // Skip leading filler words (e.g. "ign luqman" → skip "ign")
    let start = 0;
    while (start < words.length && fillerWords.has(words[start].toLowerCase())) start++;
    // Collect words until we hit a filler/connector
    const ignWords: string[] = [];
    for (let i = start; i < words.length; i++) {
      if (fillerWords.has(words[i].toLowerCase())) break;
      ignWords.push(words[i]);
    }
    const ign = ignWords.join(' ').trim();
    if (ign) return { player_id: genericMatch[1], ign };
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

  // Look for a number followed by "MATCH"
  const matchMatch = title.match(/(\d+)\s*MATCH/i);
  if (matchMatch) {
    const games = parseInt(matchMatch[1], 10);
    return games > 0 ? games : null;
  }

  return null;
}

// ─── Level Info Extraction ───────────────────────────────────────────────────

export interface LevelInfo {
  title: string;
  price: number;
  description: string;
}

/**
 * Extracts level/package info from a Sociabuzz webhook body.
 * Returns null if no level field is present.
 */
export function extractLevelInfo(body: Record<string, unknown>): LevelInfo | null {
  const findLevel = (obj: Record<string, unknown>): LevelInfo | null => {
    if (obj.level && typeof obj.level === 'object') {
      const level = obj.level as Record<string, unknown>;
      if (level.title) {
        return {
          title: String(level.title).trim(),
          price: parseFloat(String(level.price ?? '0')) || 0,
          description: String(level.description ?? '').trim(),
        };
      }
    }
    return null;
  };

  // Check top-level
  let info = findLevel(body);
  if (info) return info;

  // Check nested objects (donation, support, data)
  for (const key of ['donation', 'support', 'data']) {
    if (body[key] && typeof body[key] === 'object') {
      info = findLevel(body[key] as Record<string, unknown>);
      if (info) return info;
    }
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
