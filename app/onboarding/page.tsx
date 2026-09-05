'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../lib/auth';
import { apiFetch, ApiError } from '../../lib/api-client';
import { normalizeSlug, validateSlug } from '../../lib/domain/ids';
import AuthCard, { authButtonClass, authInputClass } from '../../components/AuthCard';
import { DEFAULT_GAME, GAMES, type GameId } from '../../lib/games';

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [slugInput, setSlugInput] = useState('');
  const [activeGame, setActiveGame] = useState<GameId>(DEFAULT_GAME);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const busy = useRef(false);
  const slugEdited = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    let cancelled = false;
    setChecking(true); setError('');
    (async () => {
      try {
        await apiFetch('/api/streamers');
        if (!cancelled) router.replace('/dashboard');
      } catch (err) {
        if (cancelled) return;
        if (!(err instanceof ApiError) || err.status !== 404) {
          setError(err instanceof Error ? err.message : 'Could not load your account.');
          setChecking(false); return;
        }
        if (!user.emailVerified) { router.replace('/verify-email'); return; }
        let name = user.displayName || '';
        let slug = normalizeSlug(name);
        try {
          const saved = JSON.parse(sessionStorage.getItem(`creator-draft:${user.uid}`) || 'null');
          if (typeof saved?.name === 'string' && typeof saved?.slug === 'string') {
            name = saved.name; slug = saved.slug; slugEdited.current = true;
            if (saved.activeGame === 'ml') setActiveGame(saved.activeGame);
          }
        } catch { /* An unavailable or invalid draft is harmless. */ }
        setDisplayName(name.slice(0, 60)); setSlugInput(slug.slice(0, 30));
        setReady(true); setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, loading, router, attempt]);

  useEffect(() => {
    if (!user || !ready) return;
    try { sessionStorage.setItem(`creator-draft:${user.uid}`, JSON.stringify({ name: displayName, slug: slugInput, activeGame })); } catch { /* The form remains usable without storage. */ }
  }, [user, ready, displayName, slugInput, activeGame]);

  const check = validateSlug(slugInput);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current || !ready || !check.ok || !displayName.trim()) return;
    busy.current = true; setSubmitting(true); setError('');
    try {
      await apiFetch('/api/streamers', { method: 'POST', body: { displayName: displayName.trim(), slug: check.slug, activeGame } });
      try { sessionStorage.removeItem(`creator-draft:${user?.uid}`); } catch { /* Optional draft cleanup. */ }
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Recover a successful submission whose response was lost. A taken
        // handle without an owned workspace remains an editable error.
        try { await apiFetch('/api/streamers'); router.replace('/dashboard'); return; } catch { /* Show original conflict. */ }
      }
      setError(err instanceof Error ? err.message : 'Could not create your profile. Try again.');
    } finally { busy.current = false; setSubmitting(false); }
  }

  return <AuthCard title="Set up your creator profile" subtitle="Step 3 of 3 · Public identity" footer={<Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">Back to sign in</Link>}>
    {error && <p role="alert" className="text-red-300 text-sm mb-4">{error}</p>}
    {loading || checking ? <p role="status" className="text-slate-500">Loading your account…</p> : !ready ? <button className={authButtonClass} onClick={() => setAttempt((n) => n + 1)}>Retry</button> : <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm font-medium text-slate-700">Creator name
        <input required maxLength={60} value={displayName} onChange={(e) => { setDisplayName(e.target.value); if (!slugEdited.current) setSlugInput(normalizeSlug(e.target.value).slice(0, 30)); }} autoComplete="nickname" aria-describedby="name-hint" className={`${authInputClass} mt-2`} />
      </label>
      <p id="name-hint" className="text-xs text-slate-500">The name viewers see. {displayName.length}/60</p>
      <label className="block text-sm font-medium text-slate-700">MabarQueue handle
        <input required maxLength={30} autoCapitalize="none" spellCheck={false} value={slugInput} onChange={(e) => { slugEdited.current = true; setSlugInput(e.target.value); }} aria-invalid={Boolean(slugInput) && !check.ok} aria-describedby="slug-hint" className={`${authInputClass} mt-2`} />
      </label>
      <p id="slug-hint" className={`text-xs break-all ${slugInput && !check.ok ? 'text-amber-700' : 'text-slate-500'}`}>{slugInput && !check.ok ? check.message : '3–30 characters. Letters, numbers and hyphens; normalized to lowercase.'}</p>
      {check.ok && <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-3 text-sm text-blue-700 break-all">Your page: /streamer/{check.slug}</p>}
      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Main game</legend>
        <p className="mt-1 text-xs text-slate-500">Your dashboard modules and player fields follow this game.</p>
        <div className="mt-3 space-y-2">
          {Object.values(GAMES).map((game) => {
            const available = game.availability === 'available';
            return (
              <label key={game.id} className={`flex items-center gap-3 rounded-lg border p-3 ${available ? 'cursor-pointer border-slate-200 hover:border-blue-300' : 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60'}`}>
                <input type="radio" name="activeGame" value={game.id} checked={activeGame === game.id} disabled={!available} onChange={() => setActiveGame(game.id)} className="accent-blue-600" />
                <span className="flex-1"><span className="block text-sm font-medium text-slate-800">{game.label}</span><span className="mt-0.5 block text-xs text-slate-500">Mabar Queue · Donate{game.capabilities.commentAlbum ? ' · Comment Album' : ''}</span></span>
                {!available && <span className="rounded-full bg-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600">Coming soon</span>}
              </label>
            );
          })}
        </div>
      </fieldset>
      <button disabled={submitting || !check.ok || !displayName.trim()} className={authButtonClass}>{submitting ? 'Preparing your channel…' : 'Open my dashboard'}</button>
      <p className="text-xs text-slate-500">Starter game packages are included. You can connect payments from your dashboard when you’re ready.</p>
    </form>}
  </AuthCard>;
}
