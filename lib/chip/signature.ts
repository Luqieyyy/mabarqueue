/**
 * CHIP callback signature verification.
 *
 * Per CHIP's API reference, every callback delivery carries an `X-Signature`
 * header holding a **base64-encoded RSA PKCS#1 v1.5 signature of the SHA256
 * digest of the raw request body**. Verification therefore has to run against
 * the exact bytes CHIP signed — never a re-serialised JSON object, whose key
 * order or whitespace would differ and fail every time.
 *
 * Two different keys exist and must not be confused:
 *
 *   - `success_callback` on a purchase  → the company key from `GET /public_key/`
 *   - a registered Webhook              → that webhook's own `public_key`
 *
 * This module is deliberately free of network and Firebase access so it can
 * be unit-tested directly.
 */

import { createVerify } from 'crypto';

export const CHIP_SIGNATURE_HEADER = 'x-signature';

export type SignatureResult =
  | { valid: true }
  | { valid: false; reason: 'missing_signature' | 'missing_key' | 'malformed' | 'mismatch' };

/**
 * Verifies a CHIP callback body against a PEM public key.
 *
 * Returns a result rather than throwing so the caller can log the reason and
 * still answer CHIP with a plain 400 — an unverifiable payload must never
 * reach fulfilment, but it also shouldn't surface a stack trace.
 */
export function verifyChipSignature(
  rawBody: string,
  signatureHeader: string | null,
  publicKeyPem: string | null,
): SignatureResult {
  if (!signatureHeader) return { valid: false, reason: 'missing_signature' };
  if (!publicKeyPem) return { valid: false, reason: 'missing_key' };

  try {
    const verifier = createVerify('RSA-SHA256');
    verifier.update(rawBody, 'utf8');
    verifier.end();

    const ok = verifier.verify(publicKeyPem, signatureHeader.trim(), 'base64');
    return ok ? { valid: true } : { valid: false, reason: 'mismatch' };
  } catch {
    // A malformed key or non-base64 signature lands here; it's a rejection,
    // not a server fault.
    return { valid: false, reason: 'malformed' };
  }
}

/**
 * Normalises the PEM returned by `GET /public_key/`.
 *
 * CHIP returns the key as a JSON-encoded string, so it arrives with literal
 * `\n` escapes rather than real newlines — which OpenSSL will not parse. It
 * may also arrive already-decoded, so both forms are handled.
 */
export function normalisePublicKey(raw: string): string {
  return raw.trim().replace(/\\n/g, '\n');
}
