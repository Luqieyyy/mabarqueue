/**
 * Resolving CHIP's `success_callback` origin — pure, no `server-only`.
 *
 * Lives in the domain layer (rather than beside `lib/chip/client.ts`, which
 * imports `server-only`) so it stays directly unit-testable.
 */

export type CallbackOriginResult =
  | { ok: true; origin: string }
  | { ok: false; reason: 'localhost_port_rejected'; message: string };

/**
 * Resolves the origin CHIP's `success_callback` should point at.
 *
 * CHIP rejects callback URLs on a non-standard port ("You can't use custom
 * ports in callback (only 80/443 ... are supported)"), which `localhost:3000`
 * always is in local development. `req.nextUrl.origin` is fine for the
 * browser-facing redirect URLs — only the server-to-server callback needs a
 * publicly reachable host, so `CHIP_CALLBACK_ORIGIN` (e.g. an ngrok/
 * cloudflared tunnel, or the deployed Vercel URL) overrides just that one.
 *
 * Failing fast here, with a specific message, beats letting CHIP's opaque
 * "webhooks_callback_port" error surface from a checkout attempt.
 */
export function resolveCallbackOrigin(
  requestOrigin: string,
  overrideEnv: string | undefined,
): CallbackOriginResult {
  const override = overrideEnv?.trim();
  if (override) return { ok: true, origin: override.replace(/\/+$/, '') };

  let hasCustomPort = false;
  try {
    hasCustomPort = Boolean(new URL(requestOrigin).port);
  } catch {
    hasCustomPort = /:\d+$/.test(requestOrigin);
  }

  if (hasCustomPort) {
    return {
      ok: false,
      reason: 'localhost_port_rejected',
      message:
        'Payments need a public callback URL in local development. Run a tunnel ' +
        '(e.g. `ngrok http 3000`) and set CHIP_CALLBACK_ORIGIN to its https URL.',
    };
  }

  return { ok: true, origin: requestOrigin };
}
