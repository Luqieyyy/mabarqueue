import { parseMessage } from './donation';
import type { ParsedMessage } from './donation';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GameId = 'ml' | 'valorant' | 'pubgm';

export interface GameDefinition {
  id: GameId;
  label: string;        // "Mobile Legends" — for UI display
  slotCount: number;    // viewer slots in-game (streamer not counted)
  idLabel: string;      // "ML ID" — for UI copy (donation instructions, warnings)
  parseMessage: (message: string) => ParsedMessage | null;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const DEFAULT_GAME: GameId = 'ml';

export const GAMES: Partial<Record<GameId, GameDefinition>> = {
  ml: {
    id: 'ml',
    label: 'Mobile Legends',
    slotCount: 4,
    idLabel: 'ML ID',
    parseMessage,
  },
};

/** Resolves a game id to its definition, falling back to the default game for missing/unknown ids. */
export function getGameDefinition(id: GameId | null | undefined): GameDefinition {
  if (id && GAMES[id]) return GAMES[id]!;
  return GAMES[DEFAULT_GAME]!;
}
