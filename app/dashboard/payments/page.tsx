'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth';
import { apiFetch, ApiError } from '../../../lib/api-client';
import { formatSen, toSen } from '../../../lib/domain/money';

interface Streamer {
  streamerId: string;
  displayName: string;
  slug: string;
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
}

interface GamePackage {
  packageId: string;
  title: string;
  description: string;
  priceSen: number;
  games: number;
  enabled: boolean;
  sortOrder: number;
}

interface EarningsBucket {
  grossFormatted: string;
  platformFeeFormatted: string;
  netBeforeProcessingFormatted: string;
  paymentCount: number;
}

interface Earnings {
  feeRate: string;
  today: EarningsBucket;
  month: EarningsBucket;
  allTime: EarningsBucket;
}

function PaymentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const [streamer, setStreamer] = useState<Streamer | null>(null);
  const [packages, setPackages] = useState<GamePackage[]>([]);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // New-package form. Price is entered in ringgit for humans, converted to
  // integer sen before it ever leaves the browser.
  const [title, setTitle] = useState('');
  const [priceRm, setPriceRm] = useState('');
  const [games, setGames] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ streamer: Streamer }>('/api/streamers');
      setStreamer(res.streamer);

      const [pkgRes, earnRes] = await Promise.all([
        apiFetch<{ packages: GamePackage[] }>('/api/packages'),
        apiFetch<Earnings>('/api/earnings'),
      ]);
      setPackages(pkgRes.packages);
      setEarnings(earnRes);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        router.push('/onboarding');
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Could not load your workspace.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Returning from Stripe onboarding — re-read capabilities from Stripe
  // rather than trusting the redirect itself.
  useEffect(() => {
    if (!user || searchParams.get('onboarding') !== 'complete') return;
    (async () => {
      try {
        await apiFetch('/api/stripe/connect/status');
        await load();
        setToast('Stripe account refreshed.');
      } catch {
        /* the banner below already reflects whatever state Stripe reports */
      }
    })();
  }, [user, searchParams, load]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const connectStripe = async () => {
    setBusy('stripe');
    setError('');
    try {
      const res = await apiFetch<{ url: string }>('/api/stripe/connect/onboard', { method: 'POST' });
      window.location.href = res.url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start Stripe onboarding.');
      setBusy('');
    }
  };

  const openStripeDashboard = async () => {
    setBusy('dashboard');
    try {
      const res = await apiFetch<{ url: string }>('/api/stripe/connect/dashboard', { method: 'POST' });
      window.open(res.url, '_blank', 'noopener');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open Stripe.');
    } finally {
      setBusy('');
    }
  };

  const addPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const rm = Number(priceRm);
    const gamesNum = Number(games);
    if (!title.trim()) { setError('Package title is required.'); return; }
    if (!Number.isFinite(rm) || rm <= 0) { setError('Enter a valid price in RM.'); return; }
    if (!Number.isInteger(gamesNum) || gamesNum < 1) { setError('Enter a whole number of games.'); return; }

    setBusy('package');
    try {
      await apiFetch('/api/packages', {
        method: 'POST',
        body: {
          title: title.trim(),
          description: description.trim(),
          priceSen: Math.round(rm * 100),
          games: gamesNum,
          enabled: true,
          sortOrder: packages.length,
        },
      });
      setTitle(''); setPriceRm(''); setGames(''); setDescription('');
      await load();
      showToast('Package added.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the package.');
    } finally {
      setBusy('');
    }
  };

  const togglePackage = async (pkg: GamePackage) => {
    try {
      await apiFetch(`/api/packages/${pkg.packageId}`, {
        method: 'PATCH',
        body: { ...pkg, enabled: !pkg.enabled },
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the package.');
    }
  };

  const removePackage = async (packageId: string) => {
    try {
      await apiFetch(`/api/packages/${packageId}`, { method: 'DELETE' });
      await load();
      showToast('Package removed.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove the package.');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#07070f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const connected = Boolean(streamer?.stripeAccountId);
  const live = Boolean(streamer?.stripeChargesEnabled);
  const publicUrl = streamer ? `/streamer/${streamer.slug}` : '';

  return (
    <div className="min-h-screen bg-[#07070f] text-white">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-black">Payments</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {streamer?.displayName} · <Link href={publicUrl} className="text-violet-400 hover:text-violet-300">{publicUrl}</Link>
            </p>
          </div>
          <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors">
            ← Dashboard
          </Link>
        </div>

        {toast && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2.5 text-emerald-400 text-sm">
            {toast}
          </div>
        )}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* ── Stripe Connect ── */}
        <section className="bg-[#0f0f1a] border border-white/5 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-bold">Stripe account</h2>
              <p className="text-gray-500 text-sm mt-1 max-w-lg">
                Viewers pay you directly. Stripe handles your bank details and pays out on its own
                schedule — MabarQueue never holds your money.
              </p>
            </div>
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${
                live
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : connected
                    ? 'bg-amber-500/15 text-amber-400'
                    : 'bg-white/5 text-gray-400'
              }`}
            >
              {live ? 'Accepting payments' : connected ? 'Setup incomplete' : 'Not connected'}
            </span>
          </div>

          {connected && !live && (
            <p className="text-amber-400/80 text-xs mt-3">
              Stripe still needs more information before you can accept payments. To use FPX
              (Malaysian online banking), Stripe requires a Business Registration Number.
            </p>
          )}

          <div className="flex gap-3 mt-4 flex-wrap">
            <button
              onClick={connectStripe}
              disabled={busy === 'stripe'}
              className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-colors"
            >
              {busy === 'stripe' ? 'Opening Stripe...' : connected ? 'Continue setup' : 'Connect payments'}
            </button>
            {connected && (
              <button
                onClick={openStripeDashboard}
                disabled={busy === 'dashboard'}
                className="bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-50 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors"
              >
                Open Stripe dashboard
              </button>
            )}
          </div>
        </section>

        {/* ── Earnings ── */}
        {earnings && (
          <section className="bg-[#0f0f1a] border border-white/5 rounded-2xl p-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-bold">Earnings</h2>
              <span className="text-xs text-gray-500">Platform fee {earnings.feeRate}</span>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 mt-4">
              {([
                ['Today', earnings.today],
                ['This month', earnings.month],
                ['All time', earnings.allTime],
              ] as const).map(([label, bucket]) => (
                <div key={label} className="bg-[#1a1a2a] rounded-xl p-4">
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">{label}</p>
                  <p className="text-xl font-black mt-1.5">{bucket.grossFormatted}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {bucket.paymentCount} payment{bucket.paymentCount === 1 ? '' : 's'}
                  </p>
                  <div className="mt-3 pt-3 border-t border-white/5 space-y-1 text-xs">
                    <div className="flex justify-between text-gray-500">
                      <span>Platform fee</span><span>−{bucket.platformFeeFormatted}</span>
                    </div>
                    <div className="flex justify-between text-gray-300 font-semibold">
                      <span>Your share</span><span>{bucket.netBeforeProcessingFormatted}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-gray-600 text-xs mt-4">
              Before Stripe&apos;s processing fee, which Stripe deducts separately. Your Stripe
              dashboard is the source of truth for settled amounts and payouts.
            </p>
          </section>
        )}

        {/* ── Packages ── */}
        <section className="bg-[#0f0f1a] border border-white/5 rounded-2xl p-6">
          <h2 className="font-bold">Packages</h2>
          <p className="text-gray-500 text-sm mt-1">What viewers can buy on your page.</p>

          <div className="mt-4 space-y-2">
            {packages.length === 0 && (
              <p className="text-gray-600 text-sm py-4 text-center">
                No packages yet — add one below so viewers have something to buy.
              </p>
            )}
            {packages.map((pkg) => (
              <div
                key={pkg.packageId}
                className={`flex items-center gap-3 bg-[#1a1a2a] rounded-xl px-4 py-3 ${pkg.enabled ? '' : 'opacity-50'}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{pkg.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatSen(toSen(pkg.priceSen))} · {pkg.games} game{pkg.games === 1 ? '' : 's'}
                  </p>
                </div>
                <button
                  onClick={() => togglePackage(pkg)}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors shrink-0"
                >
                  {pkg.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  onClick={() => removePackage(pkg.packageId)}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={addPackage} className="mt-5 pt-5 border-t border-white/5 space-y-3">
            <div className="grid sm:grid-cols-3 gap-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="3 Games"
                maxLength={100}
                className="sm:col-span-1 bg-[#1a1a2a] border border-white/5 focus:border-violet-500/50 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors placeholder-gray-600"
              />
              <input
                value={priceRm}
                onChange={(e) => setPriceRm(e.target.value)}
                placeholder="Price (RM)"
                type="number"
                min="1"
                step="0.01"
                className="bg-[#1a1a2a] border border-white/5 focus:border-violet-500/50 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors placeholder-gray-600"
              />
              <input
                value={games}
                onChange={(e) => setGames(e.target.value)}
                placeholder="Games"
                type="number"
                min="1"
                step="1"
                className="bg-[#1a1a2a] border border-white/5 focus:border-violet-500/50 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors placeholder-gray-600"
              />
            </div>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              maxLength={500}
              className="w-full bg-[#1a1a2a] border border-white/5 focus:border-violet-500/50 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors placeholder-gray-600"
            />
            <button
              type="submit"
              disabled={busy === 'package'}
              className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-colors"
            >
              {busy === 'package' ? 'Adding...' : 'Add package'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#07070f] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <PaymentsContent />
    </Suspense>
  );
}
