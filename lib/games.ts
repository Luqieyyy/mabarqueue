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
  availability: 'available' | 'coming-soon';
  capabilities: {
    mabarQueue: boolean;
    donations: boolean;
    commentAlbum: boolean;
  };
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const DEFAULT_GAME: GameId = 'ml';

export const GAMES: Record<GameId, GameDefinition> = {
  ml: {
    id: 'ml',
    label: 'Mobile Legends',
    slotCount: 4,
    idLabel: 'ML ID',
    parseMessage,
    availability: 'available',
    capabilities: { mabarQueue: true, donations: true, commentAlbum: true },
  },
  pubgm: {
    id: 'pubgm',
    label: 'PUBG Mobile',
    slotCount: 3,
    idLabel: 'PUBG ID',
    parseMessage,
    availability: 'coming-soon',
    capabilities: { mabarQueue: true, donations: true, commentAlbum: false },
  },
  valorant: {
    id: 'valorant',
    label: 'Valorant',
    slotCount: 4,
    idLabel: 'Riot ID',
    parseMessage,
    availability: 'coming-soon',
    capabilities: { mabarQueue: true, donations: true, commentAlbum: false },
  },
};

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && value in GAMES;
}

export function isAvailableGame(value: unknown): value is GameId {
  return isGameId(value) && GAMES[value].availability === 'available';
}

/** Resolves a game id to its definition, falling back to the default game for missing/unknown ids. */
export function getGameDefinition(id: GameId | null | undefined): GameDefinition {
  if (id && GAMES[id]) return GAMES[id]!;
  return GAMES[DEFAULT_GAME]!;
}
