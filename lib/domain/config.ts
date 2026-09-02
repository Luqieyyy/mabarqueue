/**
 * Platform-wide configuration defaults.
 *
 * The platform fee lives here and nowhere else. A streamer's effective rate is
 * always read from their own `streamers/{id}.platformFeeBps` field, falling
 * back to `DEFAULT_PLATFORM_FEE_BPS` — so tiers (partner, promotional, special
 * agreement) are data, never code.
 */

import { toBps, type Bps } from './money';

// ─── Platform fee ─────────────────────────────────────────────────────────────

/** Standard streamer rate: 5%. */
export const DEFAULT_PLATFORM_FEE_BPS: Bps = toBps(500);

/**
 * Named reference tiers. These are convenience constants for admin tooling and
 * tests — the authoritative rate for a given payment is always the streamer
 * document's own value.
 */
export const FEE_TIERS = {
  standard: toBps(500),      // 5%
  partner: toBps(300),       // 3%
  special: toBps(250),       // 2.5%
  promotional: toBps(0),     // 0%
} as const satisfies Record<string, Bps>;

/**
 * Resolves the fee rate to apply, tolerating missing or malformed stored values
 * by falling back to the default rather than throwing mid-payment.
 */
export function resolveFeeBps(stored: number | null | undefined): Bps {
  if (stored == null || !Number.isInteger(stored) || stored < 0 || stored > 10_000) {
    return DEFAULT_PLATFORM_FEE_BPS;
  }
  return toBps(stored);
}

// ─── Queue defaults ───────────────────────────────────────────────────────────

/**
 * Fallback viewer-slot count.
 *
 * Real slot counts come from the game registry (`lib/games.ts` → `slotCount`),
 * which is per-game and already in use. This is only the last-resort default
 * for an unknown game id.
 */
export const DEFAULT_MAX_SLOTS = 4;

/** Hard ceiling — guards against a malformed setting opening unbounded slots. */
export const MAX_ALLOWED_SLOTS = 10;

// ─── Currency ─────────────────────────────────────────────────────────────────

export const SUPPORTED_CURRENCY = 'MYR' as const;

/** Smallest payment MabarQueue will accept, in sen (RM1.00). */
export const MIN_PAYMENT_SEN = 100;
