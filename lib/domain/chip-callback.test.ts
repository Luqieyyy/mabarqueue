import { describe, expect, it } from 'vitest';
import { resolveCallbackOrigin } from './chip-callback';

describe('resolveCallbackOrigin', () => {
  it('rejects a localhost origin with a custom port — the exact bug this guards', () => {
    const result = resolveCallbackOrigin('http://localhost:3000', undefined);
    expect(result).toMatchObject({ ok: false, reason: 'localhost_port_rejected' });
  });

  it('accepts a standard-port origin unchanged', () => {
    expect(resolveCallbackOrigin('https://mabarqueue.com', undefined)).toEqual({
      ok: true,
      origin: 'https://mabarqueue.com',
    });
  });

  it('rejects any non-standard port, not just 3000', () => {
    for (const origin of ['http://localhost:8080', 'https://192.168.1.5:4000', 'http://0.0.0.0:5173']) {
      expect(resolveCallbackOrigin(origin, undefined).ok).toBe(false);
    }
  });

  it('lets CHIP_CALLBACK_ORIGIN override a rejected localhost origin', () => {
    expect(resolveCallbackOrigin('http://localhost:3000', 'https://abc123.ngrok-free.app')).toEqual({
      ok: true,
      origin: 'https://abc123.ngrok-free.app',
    });
  });

  it('strips a trailing slash from the override so the callback path never doubles up', () => {
    expect(resolveCallbackOrigin('http://localhost:3000', 'https://abc123.ngrok-free.app/')).toEqual({
      ok: true,
      origin: 'https://abc123.ngrok-free.app',
    });
  });

  it('takes the override even when the request origin would have been fine', () => {
    expect(resolveCallbackOrigin('https://mabarqueue.com', 'https://abc123.ngrok-free.app')).toEqual({
      ok: true,
      origin: 'https://abc123.ngrok-free.app',
    });
  });

  it('ignores a blank override rather than treating it as a real origin', () => {
    expect(resolveCallbackOrigin('https://mabarqueue.com', '   ')).toEqual({
      ok: true,
      origin: 'https://mabarqueue.com',
    });
  });
});
