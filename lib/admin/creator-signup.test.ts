import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(), counter: 0, failCommit: false,
  identity: { uid: 'uid-a', email: 'creator@example.com', email_verified: true },
}));
vi.mock('server-only', () => ({}));
vi.mock('../firebase-admin', () => {
  function snapshot(path: string) {
    return { exists: state.docs.has(path), id: path.split('/').pop(), data: () => state.docs.get(path) };
  }
  function collection(path: string) {
    return {
      doc(id = `auto-${++state.counter}`) { return { path: `${path}/${id}`, id, collection: (name: string) => collection(`${path}/${id}/${name}`) }; },
      where(field: string, _op: string, value: string) {
        return { limit: (_n: number) => ({ queryPath: path, field, value }) };
      },
    };
  }
  return {
    adminAuth: () => ({ verifyIdToken: async (token: string) => {
      if (token !== 'valid') throw new Error('private provider detail');
      return state.identity;
    } }),
    adminDb: () => ({ collection, runTransaction: async (work: (tx: unknown) => Promise<unknown>) => {
      const writes: Array<{ path: string; data: Record<string, unknown>; merge: boolean }> = [];
      const result = await work({
        get: async (ref: { path?: string; queryPath?: string; field?: string; value?: string }) => {
          if (writes.length) throw new Error('Read after write');
          if (ref.path) return snapshot(ref.path);
          const docs = Array.from(state.docs.entries()).filter(([path, data]) => path.startsWith(`${ref.queryPath}/`) && path.split('/').length === 2 && data[ref.field!] === ref.value).map(([path]) => snapshot(path));
          return { docs, empty: !docs.length };
        },
        set: (ref: { path: string }, data: Record<string, unknown>, options?: { merge: boolean }) => writes.push({ path: ref.path, data, merge: options?.merge ?? false }),
      });
      if (state.failCommit) throw new Error('simulated commit failure');
      writes.forEach(({ path, data, merge }) => state.docs.set(path, { ...(merge ? state.docs.get(path) : {}), ...data }));
      return result;
    } }),
  };
});

import { POST } from '../../app/api/streamers/route';

function request(body: unknown = { displayName: 'Creator', slug: 'creator-one' }, token: string | null = 'valid') {
  return new NextRequest('http://localhost/api/streamers', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  });
}
beforeEach(() => {
  state.docs.clear(); state.counter = 0; state.failCommit = false;
  state.identity = { uid: 'uid-a', email: 'creator@example.com', email_verified: true };
});

describe('creator signup route and real provisioning repository', () => {
  it('requires a verified identity before any writes', async () => {
    expect((await POST(request(undefined, null))).status).toBe(401);
    const invalid = await POST(request(undefined, 'invalid'));
    expect(invalid.status).toBe(401);
    expect(await invalid.text()).not.toContain('private provider detail');
    state.identity.email_verified = false;
    expect((await POST(request())).status).toBe(403);
    expect(state.docs.size).toBe(0);
  });

  it.each([
    { displayName: '', slug: 'creator-one' },
    { displayName: 'x'.repeat(61), slug: 'creator-one' },
    { displayName: 'Name', slug: 'admin' },
    { displayName: 'Name', slug: '12' },
    { displayName: [], slug: 'creator-one' },
    null,
  ])('rejects invalid fields: %j', async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(state.docs.size).toBe(0);
  });

  it('rejects games that are not available yet', async () => {
    const response = await POST(request({ displayName: 'Creator', slug: 'creator-one', activeGame: 'valorant' }));
    expect(response.status).toBe(400);
    expect(state.docs.size).toBe(0);
  });

  it('ignores forged ownership and fees, normalizes the handle, and seeds both existing storage formats', async () => {
    const res = await POST(request({ displayName: ' Creator ', slug: 'Creator_One', uid: 'victim', role: 'admin', platformFeeBps: 0 }));
    expect(res.status).toBe(201);
    const { streamer } = await res.json();
    // No payment-account fields: payments are collected through MabarQueue's
    // own merchant account, so a new creator can sell without onboarding one.
    expect(streamer).toMatchObject({ ownerUid: 'uid-a', slug: 'creator-one', displayName: 'Creator', activeGame: 'ml', platformFeeBps: 500, legacyUsername: 'uid-a', status: 'draft', payoutOnboardingCompletedAt: null });
    expect(state.docs.get('users/uid-a')).toMatchObject({ uid: 'uid-a', email: 'creator@example.com', role: 'streamer', primaryStreamerId: streamer.streamerId });
    expect(state.docs.has('users/creator')).toBe(false);
    expect(Array.from(state.docs.keys()).filter((p) => p.startsWith('users/uid-a/packages/'))).toHaveLength(4);
    expect(Array.from(state.docs.keys()).filter((p) => p.startsWith(`streamers/${streamer.streamerId}/packages/`))).toHaveLength(4);
    expect(state.docs.get('users/uid-a/settings/features')).toMatchObject({ mabarQueue: true, donations: true, commentAlbum: true });
  });

  it('returns 409 for an owned workspace without reseeding data', async () => {
    await POST(request()); const count = state.docs.size;
    expect((await POST(request({ displayName: 'Again', slug: 'another-name' }))).status).toBe(409);
    expect(state.docs.size).toBe(count);
    expect(state.docs.has('slugs/another-name')).toBe(false);
  });

  it('checks ownership even when a historical profile lacks a workspace pointer', async () => {
    state.docs.set('streamers/existing', { ownerUid: 'uid-a' });
    expect((await POST(request())).status).toBe(409);
    expect(state.docs.size).toBe(1);
  });

  it('returns 409 for a taken handle without provisioning the second user', async () => {
    await POST(request()); state.identity.uid = 'uid-b';
    expect((await POST(request())).status).toBe(409);
    expect(state.docs.has('users/uid-b')).toBe(false);
  });

  it('preserves an owned legacy dashboard and customized packages', async () => {
    state.docs.set('users/creator', { uid: 'uid-a', role: 'streamer', name: 'Old name' });
    state.docs.set('users/creator/packages/Custom', { price: 99 });
    const res = await POST(request());
    expect((await res.json()).streamer.legacyUsername).toBe('creator');
    expect(state.docs.get('users/creator/packages/Custom')).toEqual({ price: 99 });
    expect(Array.from(state.docs.keys()).filter((p) => p.startsWith('users/creator/packages/'))).toHaveLength(1);
  });

  it('never claims a matching email prefix owned by another account', async () => {
    state.docs.set('users/creator', { uid: 'other-user', role: 'admin' });
    expect((await POST(request())).status).toBe(201);
    expect(state.docs.get('users/creator')).toEqual({ uid: 'other-user', role: 'admin' });
    expect(state.docs.get('users/uid-a')?.legacyUsername).toBe('uid-a');
  });

  it('leaves no partial profile when commit fails and allows a retry', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.failCommit = true;
    expect((await POST(request())).status).toBe(500);
    expect(state.docs.size).toBe(0);
    state.failCommit = false;
    expect((await POST(request())).status).toBe(201);
    log.mockRestore();
  });
});
