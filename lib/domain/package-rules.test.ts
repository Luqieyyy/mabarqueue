import { describe, expect, it } from 'vitest';
import { MAX_GAMES_PER_PACKAGE, validatePackageInput } from './package-rules';

const valid = {
  title: '3 Games',
  description: 'Play three games with me',
  priceSen: 1000,
  games: 3,
  enabled: true,
  sortOrder: 1,
};

describe('validatePackageInput', () => {
  it('accepts a well-formed package', () => {
    const result = validatePackageInput(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.priceSen).toBe(1000);
      expect(result.value.games).toBe(3);
    }
  });

  it('trims whitespace from text fields', () => {
    const result = validatePackageInput({ ...valid, title: '  3 Games  ', description: '  x  ' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe('3 Games');
      expect(result.value.description).toBe('x');
    }
  });

  it('rejects a missing body', () => {
    expect(validatePackageInput(null).ok).toBe(false);
  });

  it('requires a title', () => {
    expect(validatePackageInput({ ...valid, title: '' }).ok).toBe(false);
    expect(validatePackageInput({ ...valid, title: '   ' }).ok).toBe(false);
    expect(validatePackageInput({ ...valid, title: 'a'.repeat(101) }).ok).toBe(false);
  });

  it('rejects fractional prices — money must be integer sen', () => {
    // A float price is the exact failure mode the sen-based model exists to
    // prevent, so it's refused rather than rounded.
    expect(validatePackageInput({ ...valid, priceSen: 19.99 }).ok).toBe(false);
    expect(validatePackageInput({ ...valid, priceSen: 1000.5 }).ok).toBe(false);
  });

  it('rejects negative and absurd prices', () => {
    expect(validatePackageInput({ ...valid, priceSen: -100 }).ok).toBe(false);
    expect(validatePackageInput({ ...valid, priceSen: 100_000_01 }).ok).toBe(false);
  });

  it('coerces string prices, matching how form data arrives', () => {
    const result = validatePackageInput({ ...valid, priceSen: '2000' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.priceSen).toBe(2000);
  });

  it('rejects non-numeric prices', () => {
    expect(validatePackageInput({ ...valid, priceSen: 'free' }).ok).toBe(false);
    expect(validatePackageInput({ ...valid, priceSen: null }).ok).toBe(false);
    expect(validatePackageInput({ ...valid, priceSen: undefined }).ok).toBe(false);
  });

  it('requires at least one game and rejects fractional counts', () => {
    expect(validatePackageInput({ ...valid, games: 0 }).ok).toBe(false);
    expect(validatePackageInput({ ...valid, games: -3 }).ok).toBe(false);
    expect(validatePackageInput({ ...valid, games: 2.5 }).ok).toBe(false);
  });

  it('caps the game count', () => {
    expect(validatePackageInput({ ...valid, games: MAX_GAMES_PER_PACKAGE }).ok).toBe(true);
    expect(validatePackageInput({ ...valid, games: MAX_GAMES_PER_PACKAGE + 1 }).ok).toBe(false);
  });

  it('caps the description length', () => {
    expect(validatePackageInput({ ...valid, description: 'a'.repeat(500) }).ok).toBe(true);
    expect(validatePackageInput({ ...valid, description: 'a'.repeat(501) }).ok).toBe(false);
  });

  it('defaults enabled to true and sortOrder to 0', () => {
    const result = validatePackageInput({
      title: 'x', description: '', priceSen: 100, games: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.enabled).toBe(true);
      expect(result.value.sortOrder).toBe(0);
    }
  });

  it('ignores unexpected extra fields rather than passing them through', () => {
    // Stops a client from smuggling its own streamerId or createdAt.
    const result = validatePackageInput({ ...valid, streamerId: 'someone-else', evil: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.value).sort()).toEqual(
        ['description', 'enabled', 'games', 'priceSen', 'sortOrder', 'title'],
      );
    }
  });
});
