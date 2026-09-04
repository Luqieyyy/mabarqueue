/**
 * Package validation rules — pure, no Firebase, no `server-only`.
 *
 * Lives in the domain layer rather than beside the repository so it can be
 * unit-tested directly and reused by any caller. The API route is the only
 * authority that matters: a form's own checks are a convenience, and every
 * field is re-validated here server-side before it reaches Firestore.
 */

export const MAX_PACKAGES_PER_STREAMER = 20;
export const MAX_GAMES_PER_PACKAGE = 500;
export const MAX_PACKAGE_TITLE_LENGTH = 100;
export const MAX_PACKAGE_DESCRIPTION_LENGTH = 500;
/** RM100,000 in sen. */
export const MAX_PACKAGE_PRICE_SEN = 10_000_000;

export interface PackageInput {
  title: string;
  description: string;
  priceSen: number;
  games: number;
  enabled: boolean;
  sortOrder: number;
}

export type PackageValidation =
  | { ok: true; value: PackageInput }
  | { ok: false; message: string };

/**
 * Validates untrusted package input.
 *
 * Returns only the six known fields, so unexpected properties in the request
 * body (a `streamerId`, a `createdAt`) can't be smuggled through into the
 * stored document.
 */
export function validatePackageInput(body: unknown): PackageValidation {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return { ok: false, message: 'Missing request body.' };

  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title) return { ok: false, message: 'Title is required.' };
  if (title.length > MAX_PACKAGE_TITLE_LENGTH) {
    return { ok: false, message: `Title must be ${MAX_PACKAGE_TITLE_LENGTH} characters or fewer.` };
  }

  const description = typeof b.description === 'string' ? b.description.trim() : '';
  if (description.length > MAX_PACKAGE_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      message: `Description must be ${MAX_PACKAGE_DESCRIPTION_LENGTH} characters or fewer.`,
    };
  }

  // Money must arrive as whole sen. A fractional value is the exact failure
  // the integer-sen model exists to prevent, so it's refused, not rounded.
  if (b.priceSen === null || b.priceSen === undefined || b.priceSen === '') {
    return { ok: false, message: 'Price is required.' };
  }
  const priceSen = Number(b.priceSen);
  if (!Number.isInteger(priceSen)) {
    return { ok: false, message: 'Price must be a whole number of sen (RM1.00 = 100).' };
  }
  if (priceSen < 0) return { ok: false, message: 'Price must not be negative.' };
  if (priceSen > MAX_PACKAGE_PRICE_SEN) {
    return { ok: false, message: 'Price must not exceed RM100,000.' };
  }

  if (b.games === null || b.games === undefined || b.games === '') {
    return { ok: false, message: 'Game count is required.' };
  }
  const games = Number(b.games);
  if (!Number.isInteger(games) || games < 1) {
    return { ok: false, message: 'Games must be a whole number of at least 1.' };
  }
  if (games > MAX_GAMES_PER_PACKAGE) {
    return { ok: false, message: `Games must not exceed ${MAX_GAMES_PER_PACKAGE}.` };
  }

  const sortOrderRaw = Number(b.sortOrder);
  const sortOrder = Number.isInteger(sortOrderRaw) ? sortOrderRaw : 0;

  return {
    ok: true,
    value: {
      title,
      description,
      priceSen,
      games,
      enabled: b.enabled === undefined ? true : Boolean(b.enabled),
      sortOrder,
    },
  };
}
