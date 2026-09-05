/**
 * CHIP Collect API client — server-only.
 *
 * Every field and path here comes from CHIP's published API reference. CHIP's
 * own integration guide is explicit that paths must not be invented, so this
 * client exposes only endpoints the spec documents:
 *
 *   POST /purchases/    create a purchase, returns `checkout_url`
 *   GET  /purchases/{id}/  read a purchase back (server-side truth)
 *   GET  /public_key/   PEM used to verify `success_callback` signatures
 *
 * `CHIP_SECRET_KEY` is server-only and must never reach the browser. The
 * integration is redirect-based, so the client never needs a CHIP credential.
 */

import 'server-only';
import { normalisePublicKey } from './signature';
import {
  resolveCallbackOrigin as resolveCallbackOriginPure,
  type CallbackOriginResult,
} from '../domain/chip-callback';

export type { CallbackOriginResult };

export const CHIP_BASE_URL = 'https://gate.chip-in.asia/api/v1';
export const CHIP_CURRENCY = 'MYR';

export class ChipError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'ChipError';
    this.status = status;
  }
}

function credentials(): { secretKey: string; brandId: string } {
  const secretKey = process.env.CHIP_SECRET_KEY;
  const brandId = process.env.CHIP_BRAND_ID;

  if (!secretKey || !brandId) {
    throw new ChipError(
      'CHIP is not configured. Set CHIP_SECRET_KEY and CHIP_BRAND_ID (server-only).',
      503,
    );
  }
  return { secretKey, brandId };
}

/** True when the configured key is a CHIP test-mode key. */
export function chipConfigured(): boolean {
  return Boolean(process.env.CHIP_SECRET_KEY && process.env.CHIP_BRAND_ID);
}

/**
 * Resolves the origin CHIP's `success_callback` should point at.
 *
 * The decision logic is pure and lives in `lib/domain/chip-callback.ts`; this
 * wrapper just supplies the `CHIP_CALLBACK_ORIGIN` env var, which a client
 * module (or a test) can't read through `server-only`.
 */
export function resolveCallbackOrigin(requestOrigin: string): CallbackOriginResult {
  return resolveCallbackOriginPure(requestOrigin, process.env.CHIP_CALLBACK_ORIGIN);
}

async function chipFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { secretKey } = credentials();

  let response: Response;
  try {
    response = await fetch(`${CHIP_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
      cache: 'no-store',
    });
  } catch (err) {
    throw new ChipError(
      `Could not reach CHIP: ${err instanceof Error ? err.message : 'network error'}`,
    );
  }

  const text = await response.text();

  if (!response.ok) {
    // CHIP's error body can echo request data, so only the status and a
    // truncated body reach the logs — never the Authorization header.
    throw new ChipError(`CHIP ${init?.method ?? 'GET'} ${path} failed (${response.status}): ${text.slice(0, 300)}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ChipError(`CHIP returned a non-JSON response for ${path}`);
  }
}

// ─── Purchase ─────────────────────────────────────────────────────────────────

/**
 * Purchase statuses from CHIP's schema.
 *
 * `paid` is the only one that means money has actually been collected.
 */
export type ChipPurchaseStatus =
  | 'created'
  | 'sent'
  | 'viewed'
  | 'error'
  | 'cancelled'
  | 'overdue'
  | 'expired'
  | 'blocked'
  | 'hold'
  | 'released'
  | 'pending_release'
  | 'pending_capture'
  | 'pending_charge'
  | 'pending_execute'
  | 'pending_refund'
  | 'preauthorized'
  | 'paid'
  | 'refunded';

export interface ChipPurchase {
  id: string;
  status: ChipPurchaseStatus;
  is_test: boolean;
  brand_id: string;
  reference: string | null;
  checkout_url: string | null;
  created_on: number;
  updated_on: number;
  purchase: {
    currency: string;
    total: number;
    products: Array<{ name: string; price: number; quantity?: string | number }>;
  };
  payment?: { amount?: number; currency?: string; is_outgoing?: boolean } | null;
  status_history?: Array<{ status: string; timestamp: number }>;
}

export interface CreatePurchaseInput {
  /** Buyer email — CHIP requires it on the client object. */
  email: string;
  /** Buyer display name, when we have one. */
  fullName?: string;
  /** Line items, each priced in integer sen. */
  products: Array<{ name: string; price: number }>;
  /** Our own identifier, echoed back on the callback for reconciliation. */
  reference: string;
  successRedirect: string;
  failureRedirect: string;
  cancelRedirect: string;
  /** Server-to-server confirmation. This, not the redirect, is authoritative. */
  successCallback: string;
  /** Small key/value bag carried on the purchase. */
  metadata?: Record<string, string>;
}

/**
 * Creates a CHIP purchase and returns it, including the `checkout_url` the
 * viewer is redirected to.
 *
 * All prices are integer minor units — CHIP documents `price: 100` as RM1.00,
 * which lines up exactly with the sen used throughout MabarQueue, so no
 * conversion (and no rounding risk) is introduced here.
 */
export async function createPurchase(input: CreatePurchaseInput): Promise<ChipPurchase> {
  const { brandId } = credentials();

  return chipFetch<ChipPurchase>('/purchases/', {
    method: 'POST',
    body: JSON.stringify({
      brand_id: brandId,
      client: {
        email: input.email,
        ...(input.fullName ? { full_name: input.fullName.slice(0, 128) } : {}),
      },
      purchase: {
        currency: CHIP_CURRENCY,
        products: input.products.map((p) => ({ name: p.name.slice(0, 256), price: p.price })),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
      reference: input.reference,
      platform: 'api',
      success_redirect: input.successRedirect,
      failure_redirect: input.failureRedirect,
      cancel_redirect: input.cancelRedirect,
      success_callback: input.successCallback,
    }),
  });
}

/**
 * Re-reads a purchase from CHIP.
 *
 * Used to confirm payment independently of the callback body, so fulfilment
 * never depends on something a client could have crafted.
 */
export async function getPurchase(purchaseId: string): Promise<ChipPurchase> {
  return chipFetch<ChipPurchase>(`/purchases/${encodeURIComponent(purchaseId)}/`);
}

// ─── Public key ───────────────────────────────────────────────────────────────

let cachedPublicKey: string | null = null;

/**
 * Fetches the company public key used to verify `success_callback` signatures.
 *
 * Cached per server instance: it's stable, and re-fetching on every callback
 * would add a network round trip to the critical payment path.
 *
 * Note this is the *company* key. A registered Webhook carries its own
 * separate key, which is not interchangeable with this one.
 */
export async function getCompanyPublicKey(): Promise<string> {
  if (cachedPublicKey) return cachedPublicKey;

  // The endpoint returns a JSON-encoded PEM string.
  const raw = await chipFetch<string>('/public_key/');
  cachedPublicKey = normalisePublicKey(typeof raw === 'string' ? raw : String(raw));
  return cachedPublicKey;
}
