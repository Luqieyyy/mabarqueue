'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../lib/auth';
import { apiFetch, ApiError } from '../../lib/api-client';
import { normalizeSlug, validateSlug } from '../../lib/domain/ids';

interface StreamerResponse {
  success: boolean;
  streamer?: { slug: string; displayName: string };
}

/**
 * Streamer onboarding: claim a workspace and a public URL.
 *
 * Slug validation runs here for immediate feedback, but the server re-runs
 * the same `validateSlug` rules and owns uniqueness, so nothing here is
 * load-bearing for correctness.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [slugInput, setSlugInput] = useState('');
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  // If a workspace already exists, skip straight past onboarding.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await apiFetch<StreamerResponse>('/api/streamers');
        if (!cancelled && res.streamer) {
          router.replace('/dashboard');
          return;
        }
      } catch (err) {
        // A 404 simply means "no workspace yet", which is the expected path.
        if (!cancelled && err instanceof ApiError && err.status !== 404) {
          setError(err.message);
        }
      }
      if (!cancelled) setChecking(false);
    })();

    return () => { cancelled = true; };
  }, [user, router]);

  useEffect(() => {
    if (displayName && !slugInput) setSlugInput(normalizeSlug(displayName));
  }, [displayName, slugInput]);

  const normalized = normalizeSlug(slugInput);
  const slugCheck = slugInput ? validateSlug(slugInput) : null;
  const slugError = slugCheck && !slugCheck.ok ? slugCheck.message : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!displayName.trim()) { setError('Enter your streamer name.'); return; }
    if (!slugCheck?.ok) { setError(slugError || 'Choose a valid URL.'); return; }

    setSubmitting(true);
    try {
      await apiFetch('/api/streamers', {
        method: 'POST',
        body: { displayName: displayName.trim(), slug: slugCheck.slug },
      });
      router.push('/dashboard/payments');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create your workspace.');
      setSubmitting(false);
    }
  };

  if (authLoading || checking) {
    return (
      <div className="min-h-screen bg-[#08080e] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08080e] flex items-center justify-center px-4 py-12">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-violet-700/8 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-violet-600 rounded-2xl text-xl font-black mb-4 glow-violet text-white">
            M
          </div>
          <h1 className="text-2xl font-black text-white">Set up your channel</h1>
          <p className="text-gray-500 text-sm mt-1">Step 1 of 2 — claim your MabarQueue link</p>
        </div>

        <div className="bg-[#0f0f1a] border border-white/5 rounded-2xl p-6 shadow-2xl">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 text-red-400 text-sm mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                Streamer name
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Luqieyyy"
                maxLength={60}
                required
                className="w-full bg-[#1a1a2a] border border-white/5 focus:border-violet-500/50 rounded-xl px-3 py-2.5 text-white placeholder-gray-600 text-sm outline-none transition-colors"
              />
              <p className="text-gray-600 text-xs mt-1.5">Shown to viewers on your page.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                Your link
              </label>
              <div className="flex items-center bg-[#1a1a2a] border border-white/5 focus-within:border-violet-500/50 rounded-xl px-3 transition-colors">
                <span className="text-gray-600 text-sm shrink-0">mabarqueue.com/streamer/</span>
                <input
                  value={slugInput}
                  onChange={(e) => setSlugInput(e.target.value)}
                  placeholder="yourname"
                  maxLength={30}
                  required
                  className="flex-1 min-w-0 bg-transparent py-2.5 text-white placeholder-gray-600 text-sm outline-none"
                />
              </div>
              {slugError ? (
                <p className="text-amber-400 text-xs mt-1.5">{slugError}</p>
              ) : (
                <p className="text-gray-600 text-xs mt-1.5">
                  {normalized ? `Your page: /streamer/${normalized}` : 'Letters, numbers and hyphens.'}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || !slugCheck?.ok || !displayName.trim()}
              className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all text-sm mt-2 hover:shadow-lg hover:shadow-violet-500/25"
            >
              {submitting ? 'Creating...' : 'Continue'}
            </button>
          </form>
        </div>

        <div className="text-center mt-6">
          <Link href="/dashboard" className="text-gray-600 hover:text-gray-400 text-sm transition-colors">
            Skip for now
          </Link>
        </div>
      </div>
    </div>
  );
}
