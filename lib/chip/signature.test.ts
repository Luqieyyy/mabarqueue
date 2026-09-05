/**
 * Signature verification tests.
 *
 * These sign with a real generated RSA key pair rather than mocking, so the
 * test exercises the same OpenSSL path production uses. If CHIP's scheme
 * (RSA PKCS#1 v1.5 over a SHA256 digest, base64) is implemented wrongly,
 * these fail.
 */

import { generateKeyPairSync, createSign } from 'crypto';
import { describe, expect, it } from 'vitest';
import { normalisePublicKey, verifyChipSignature } from './signature';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const otherPair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function sign(body: string, key = privateKey): string {
  const signer = createSign('RSA-SHA256');
  signer.update(body, 'utf8');
  signer.end();
  return signer.sign(key, 'base64');
}

const body = JSON.stringify({ id: 'purchase_123', status: 'paid', purchase: { total: 1050 } });

describe('verifyChipSignature', () => {
  it('accepts a genuine signature', () => {
    expect(verifyChipSignature(body, sign(body), publicKey)).toEqual({ valid: true });
  });

  it('rejects a signature made with a different key', () => {
    // The forgery case: someone signs their own payload with their own key.
    const forged = sign(body, otherPair.privateKey);
    expect(verifyChipSignature(body, forged, publicKey)).toEqual({
      valid: false,
      reason: 'mismatch',
    });
  });

  it('rejects a tampered body, even by one character', () => {
    // Attacker inflates the amount after CHIP signed the original.
    const signature = sign(body);
    const tampered = body.replace('"total":1050', '"total":100000');
    expect(verifyChipSignature(tampered, signature, publicKey)).toEqual({
      valid: false,
      reason: 'mismatch',
    });
  });

  it('rejects a flipped payment status', () => {
    const pending = JSON.stringify({ id: 'purchase_123', status: 'created' });
    const signature = sign(pending);
    const flipped = pending.replace('created', 'paid');
    expect(verifyChipSignature(flipped, signature, publicKey).valid).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verifyChipSignature(body, null, publicKey)).toEqual({
      valid: false,
      reason: 'missing_signature',
    });
  });

  it('rejects when no public key is available', () => {
    // Fail closed: an unfetchable key must never mean "trust the payload".
    expect(verifyChipSignature(body, sign(body), null)).toEqual({
      valid: false,
      reason: 'missing_key',
    });
  });

  it('rejects a malformed signature or key without throwing', () => {
    expect(verifyChipSignature(body, 'not-base64!!', publicKey).valid).toBe(false);
    expect(verifyChipSignature(body, sign(body), 'not-a-pem').valid).toBe(false);
  });

  it('is whitespace tolerant on the header value', () => {
    expect(verifyChipSignature(body, `  ${sign(body)}\n`, publicKey)).toEqual({ valid: true });
  });

  it('verifies against raw bytes, not re-serialised JSON', () => {
    // Re-encoding changes key order/spacing and would break verification —
    // this is why the route must read the raw body.
    const signature = sign(body);
    const reSerialised = JSON.stringify(JSON.parse(body), ['status', 'id']);
    expect(verifyChipSignature(reSerialised, signature, publicKey).valid).toBe(false);
  });
});

describe('normalisePublicKey', () => {
  it('turns JSON-escaped newlines into real ones so OpenSSL can parse it', () => {
    const escaped = publicKey.replace(/\n/g, '\\n');
    const restored = normalisePublicKey(escaped);

    expect(restored).toContain('-----BEGIN PUBLIC KEY-----\n');
    expect(verifyChipSignature(body, sign(body), restored)).toEqual({ valid: true });
  });

  it('leaves an already-decoded key working', () => {
    expect(verifyChipSignature(body, sign(body), normalisePublicKey(publicKey))).toEqual({
      valid: true,
    });
  });
});
