import { describe, expect, it } from 'vitest';
import {
  RESERVED_SLUGS,
  SLUG_MAX_LENGTH,
  isValidSlug,
  normalizeSlug,
  validateSlug,
} from './ids';

describe('normalizeSlug', () => {
  it('lowercases and hyphenates separators', () => {
    expect(normalizeSlug('  Luq Man_2004 ')).toBe('luq-man-2004');
    expect(normalizeSlug('Syno.Plays')).toBe('syno-plays');
  });

  it('strips invalid characters', () => {
    expect(normalizeSlug('Syno Plays!!')).toBe('syno-plays');
    expect(normalizeSlug('luq@#$%man')).toBe('luqman');
    expect(normalizeSlug('日本luqieyyy')).toBe('luqieyyy');
  });

  it('collapses and trims hyphens', () => {
    expect(normalizeSlug('a---b')).toBe('a-b');
    expect(normalizeSlug('-luqieyyy-')).toBe('luqieyyy');
    expect(normalizeSlug('--')).toBe('');
  });
});

describe('validateSlug', () => {
  it('accepts well-formed slugs', () => {
    for (const s of ['luqieyyy', 'syno-plays', 'abc', 'player-1', 'a1b2c3']) {
      expect(validateSlug(s)).toEqual({ ok: true, slug: s });
    }
  });

  it('normalizes before validating', () => {
    const r = validateSlug('  Luqieyyy Dev ');
    expect(r).toEqual({ ok: true, slug: 'luqieyyy-dev' });
  });

  it('rejects empty and whitespace-only input', () => {
    expect(validateSlug('')).toMatchObject({ ok: false, reason: 'empty' });
    expect(validateSlug('   ')).toMatchObject({ ok: false, reason: 'empty' });
    expect(validateSlug('!!!')).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('enforces length bounds', () => {
    expect(validateSlug('ab')).toMatchObject({ ok: false, reason: 'too-short' });
    expect(validateSlug('a'.repeat(SLUG_MAX_LENGTH + 1))).toMatchObject({
      ok: false,
      reason: 'too-long',
    });
    expect(validateSlug('a'.repeat(SLUG_MAX_LENGTH)).ok).toBe(true);
  });

  it('rejects reserved slugs that would shadow routes or impersonate the platform', () => {
    for (const s of ['api', 'dashboard', 'overlay', 'queue', 'admin', 'mabarqueue', 'stripe']) {
      expect(validateSlug(s)).toMatchObject({ ok: false, reason: 'reserved' });
    }
  });

  it('rejects reserved slugs regardless of input casing', () => {
    expect(validateSlug('ADMIN')).toMatchObject({ ok: false, reason: 'reserved' });
    expect(validateSlug('  Dashboard ')).toMatchObject({ ok: false, reason: 'reserved' });
  });

  it('rejects purely numeric slugs', () => {
    expect(validateSlug('12345')).toMatchObject({ ok: false, reason: 'numeric-only' });
    expect(validateSlug('007')).toMatchObject({ ok: false, reason: 'numeric-only' });
    expect(validateSlug('a007').ok).toBe(true);
  });

  it('covers every existing app route', () => {
    // Guards against a streamer claiming a slug that collides with a real page.
    for (const route of ['dashboard', 'login', 'overlay', 'queue', 'api']) {
      expect(RESERVED_SLUGS.has(route)).toBe(true);
    }
  });
});

describe('isValidSlug', () => {
  it('mirrors validateSlug', () => {
    expect(isValidSlug('luqieyyy')).toBe(true);
    expect(isValidSlug('admin')).toBe(false);
    expect(isValidSlug('ab')).toBe(false);
  });
});
