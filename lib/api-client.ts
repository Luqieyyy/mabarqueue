'use client';

/**
 * Browser-side helper for calling MabarQueue's authenticated API routes.
 *
 * Attaches the current user's Firebase ID token as a bearer token, which the
 * server verifies with the Admin SDK before resolving which workspace the
 * caller owns. The browser never sends a `streamerId` for authorization —
 * the server derives it from the token.
 */

import { auth } from './firebase';

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new ApiError('Not signed in.', 401);
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

/** Authenticated JSON request. Throws `ApiError` on a non-2xx response. */
export async function apiFetch<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(await authHeader()),
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
  };

  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`,
      res.status,
    );
  }
  return data as T;
}

/** Unauthenticated JSON request, for public endpoints. */
export async function publicFetch<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? 'GET',
    ...(options.body !== undefined
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) }
      : {}),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`,
      res.status,
    );
  }
  return data as T;
}
