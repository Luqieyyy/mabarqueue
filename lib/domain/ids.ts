/**
 * Identifier types and slug handling for MabarQueue.
 *
 * Two distinct kinds of identifier, deliberately kept apart:
 *
 *   - **Internal, stable, opaque**: `AuthUid`, `StreamerId`, `PackageId`.
 *     Used as Firestore document IDs and in all authorization checks.
 *     Never derived from user-controlled data, never change.
 *
 *   - **Public, mutable, human-readable**: `Slug`. Appears in URLs
 *     (`/streamer/luqieyyy`) and can be changed by the streamer.
 *
 * The current codebase conflates these — it derives its tenant key from the
 * user's email local-part (`lib/auth.ts:emailToUsername`), which is mutable,
 * collision-prone across providers, and publicly enumerable. Nothing here
 * depends on that behaviour; these types describe the target model.
 */

// ─── Branded identifier types ─────────────────────────────────────────────────

/** Firebase Authentication UID. Immutable, assigned by Firebase. */
export type AuthUid = string & { readonly __brand: 'AuthUid' };

/** A streamer workspace ID. Immutable, Firestore auto-ID. */
export type StreamerId = string & { readonly __brand: 'StreamerId' };

/** A package ID. Immutable, Firestore auto-ID — never the package title. */
export type PackageId = string & { readonly __brand: 'PackageId' };

/** A normalized, validated public URL slug. */
export type Slug = string & { readonly __brand: 'Slug' };

export const asAuthUid = (v: string): AuthUid => v as AuthUid;
export const asStreamerId = (v: string): StreamerId => v as StreamerId;
export const asPackageId = (v: string): PackageId => v as PackageId;

// ─── Slug rules ───────────────────────────────────────────────────────────────

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 30;

/** Lowercase alphanumerics and single inner hyphens. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Slugs that must never be claimed by a streamer.
 *
 * Covers existing and planned application routes, common infrastructure
 * paths, and words that would let a slug impersonate the platform.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // existing + planned routes
  'api', 'dashboard', 'login', 'logout', 'signup', 'register',
  'overlay', 'queue', 'streamer', 'streamers', 'settings', 'packages',
  'earnings', 'payments', 'payment', 'checkout', 'webhook', 'webhooks',
  'onboard', 'onboarding', 'verify-email', 'connect', 'chip', 'stripe', 'sociabuzz',
  // platform identity / impersonation risks
  'mabarqueue', 'mabar', 'admin', 'administrator', 'root', 'system',
  'support', 'help', 'official', 'staff', 'team', 'moderator', 'mod',
  'billing', 'invoice', 'refund', 'security',
  // infrastructure conventions
  'www', 'app', 'cdn', 'static', 'assets', 'public', 'private',
  'mail', 'email', 'ftp', 'ns', 'dns', 'health', 'status', 'metrics',
  'robots', 'sitemap', 'favicon', '_next', 'vercel', 'firebase',
  // legal / marketing pages
  'about', 'contact', 'terms', 'privacy', 'legal', 'pricing',
  'blog', 'docs', 'faq', 'home', 'index', 'null', 'undefined',
]);

export type SlugRejection =
  | 'empty'
  | 'too-short'
  | 'too-long'
  | 'invalid-characters'
  | 'reserved'
  | 'numeric-only';

export type SlugValidation =
  | { ok: true; slug: Slug }
  | { ok: false; reason: SlugRejection; message: string };

/**
 * Normalizes arbitrary text toward a slug: lowercases, converts spaces,
 * underscores and dots to hyphens, strips remaining invalid characters and
 * collapses/trims hyphens.
 *
 *   normalizeSlug("  Luq Man_2004 ") → "luq-man-2004"
 *   normalizeSlug("Syno Plays!!")    → "syno-plays"
 *   normalizeSlug("a---b")           → "a-b"
 *
 * Normalizing is not validating — always run the result through
 * `validateSlug`, which is the authority.
 */
export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[\s_.]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Validates an already-normalized slug against every rule.
 *
 * Must be called server-side; the client's normalization is a convenience,
 * never a guarantee. Uniqueness is enforced separately by the `slugs/{slug}`
 * document ID and is not checked here.
 */
export function validateSlug(input: string): SlugValidation {
  const slug = normalizeSlug(input);

  if (!slug) {
    return { ok: false, reason: 'empty', message: 'Slug cannot be empty.' };
  }
  if (slug.length < SLUG_MIN_LENGTH) {
    return {
      ok: false,
      reason: 'too-short',
      message: `Slug must be at least ${SLUG_MIN_LENGTH} characters.`,
    };
  }
  if (slug.length > SLUG_MAX_LENGTH) {
    return {
      ok: false,
      reason: 'too-long',
      message: `Slug must be at most ${SLUG_MAX_LENGTH} characters.`,
    };
  }
  if (!SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      reason: 'invalid-characters',
      message: 'Slug may only contain lowercase letters, numbers and single hyphens.',
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, reason: 'reserved', message: `"${slug}" is reserved.` };
  }
  // A purely numeric slug would be ambiguous against any future numeric route.
  if (/^\d+$/.test(slug)) {
    return {
      ok: false,
      reason: 'numeric-only',
      message: 'Slug must contain at least one letter.',
    };
  }

  return { ok: true, slug: slug as Slug };
}

/** Narrow helper for call sites that only need a boolean. */
export function isValidSlug(input: string): boolean {
  return validateSlug(input).ok;
}
