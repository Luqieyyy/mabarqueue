import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME, GAMES, getGameDefinition, isAvailableGame } from './games';

describe('game registry', () => {
  it('keeps mabar queue and donations as core capabilities for every game', () => {
    for (const game of Object.values(GAMES)) {
      expect(game.capabilities.mabarQueue).toBe(true);
      expect(game.capabilities.donations).toBe(true);
    }
  });

  it('enables Comment Album only for Mobile Legends', () => {
    expect(GAMES.ml.capabilities.commentAlbum).toBe(true);
    expect(GAMES.valorant.capabilities.commentAlbum).toBe(false);
    expect(GAMES.pubgm.capabilities.commentAlbum).toBe(false);
  });

  it('exposes only Mobile Legends for onboarding today', () => {
    expect(isAvailableGame('ml')).toBe(true);
    expect(isAvailableGame('valorant')).toBe(false);
    expect(isAvailableGame('pubgm')).toBe(false);
    expect(isAvailableGame('unknown')).toBe(false);
  });

  it('falls back safely for an unknown stored game', () => {
    expect(getGameDefinition('unknown' as typeof DEFAULT_GAME)).toBe(GAMES[DEFAULT_GAME]);
  });
});
