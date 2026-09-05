'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth';
import { apiFetch, ApiError } from '../../../lib/api-client';
import { formatSen, toSen } from '../../../lib/domain/money';
import Navbar from '../../../components/Navbar';

interface Streamer {
  streamerId: string;
  displayName: string;
  slug: string;
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
  earnedFormatted: string;
  totalChargedFormatted: string;
  platformFeeFormatted: string;
  paymentCount: number;
}

interface Balance {
  availableFormatted: string;
  totalEarnedFormatted: string;
  paidOutFormatted: string;
}

interface Earnings {
  feeRate: string;
  today: EarningsBucket;
  month: EarningsBucket;
  allTime: EarningsBucket;
  balance: Balance;
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

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
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
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  const balance = earnings?.balance ?? null;
  const publicUrl = streamer ? `/streamer/${streamer.slug}` : '';
  const inputClass = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Navbar userName={user?.email?.split('@')[0]} active="payments" />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6 md:py-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold text-indigo-600">Monetisation</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">Payments &amp; packages</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Connect payouts, review your earnings, and control the Mabar packages viewers can purchase.</p>
          </div>
          <Link href={publicUrl} target="_blank" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            View public page <span aria-hidden="true">↗</span>
          </Link>
        </div>

        {toast && (
          <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {toast}
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
          <div className="flex flex-col justify-between gap-5 p-5 sm:flex-row sm:items-start md:p-6">
            <div className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/></svg>
              </div>
              <div>
                <h2 className="font-semibold text-slate-950">Accepting payments</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                  Your page can take payments right now — you don&apos;t need your own payment
                  account. Viewers are charged your listed price plus a {earnings?.feeRate ?? ''} service
                  fee, and you keep your full listed price.
                </p>
              </div>
            </div>
            <span className="w-fit shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              Live
            </span>
          </div>

          {balance && (
            <div className="grid gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:grid-cols-3 md:px-6">
              {([
                ['Available', balance.availableFormatted],
                ['Total earned', balance.totalEarnedFormatted],
                ['Paid out', balance.paidOutFormatted],
              ] as const).map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs font-medium text-slate-500">{label}</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
                </div>
              ))}
            </div>
          )}

          <p className="mx-5 mb-5 rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800 md:mx-6">
            Withdrawals aren&apos;t open yet — your balance keeps accruing in the meantime. Payout
            setup arrives once bank transfers are enabled.
          </p>
        </section>

        {earnings && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-semibold text-slate-950">Earnings overview</h2><p className="mt-1 text-sm text-slate-500">What you earned. Viewers pay the service fee on top of your prices.</p></div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">Platform fee {earnings.feeRate}</span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {([
                ['Today', earnings.today],
                ['This month', earnings.month],
                ['All time', earnings.allTime],
              ] as const).map(([label, bucket]) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{bucket.earnedFormatted}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {bucket.paymentCount} payment{bucket.paymentCount === 1 ? '' : 's'}
                  </p>
                  <div className="mt-4 space-y-2 border-t border-slate-200 pt-3 text-xs">
                    <div className="flex justify-between text-slate-500">
                      <span>Service fee (paid by viewer)</span><span>+{bucket.platformFeeFormatted}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-slate-800">
                      <span>Viewers charged</span><span>{bucket.totalChargedFormatted}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-4 text-xs leading-5 text-slate-500">
              You keep your full listed price on every sale — the service fee is added on top and
              paid by the viewer, never deducted from you.
            </p>
          </section>
        )}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.75fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 md:p-6">
            <div><h2 className="font-semibold text-slate-950">Mabar packages</h2><p className="mt-1 text-sm text-slate-500">Packages currently shown on your public page.</p></div>
          <div className="mt-5 space-y-3">
            {packages.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                No packages yet — add one below so viewers have something to buy.
              </div>
            )}
            {packages.map((pkg) => (
              <div
                key={pkg.packageId}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-slate-900">{pkg.title}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${pkg.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{pkg.enabled ? 'Active' : 'Hidden'}</span></div>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatSen(toSen(pkg.priceSen))} · {pkg.games} game{pkg.games === 1 ? '' : 's'}
                  </p>
                  {pkg.description && <p className="mt-2 text-sm leading-5 text-slate-600">{pkg.description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => togglePackage(pkg)}
                  className="min-h-9 shrink-0 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  {pkg.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  onClick={() => removePackage(pkg.packageId)}
                  className="min-h-9 shrink-0 rounded-lg px-3 text-xs font-semibold text-red-600 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  Remove
                </button>
                </div>
              </div>
            ))}
          </div>
          </div>

          <form onSubmit={addPackage} className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 md:p-6">
            <div><h2 className="font-semibold text-slate-950">Add a package</h2><p className="mt-1 text-sm leading-5 text-slate-500">Create a clear offer for viewers who want to join your game.</p></div>
            <div>
              <label htmlFor="package-title" className="mb-1.5 block text-sm font-medium text-slate-700">Package name</label>
              <input
                id="package-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Example: 3 Games"
                maxLength={100}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label htmlFor="package-price" className="mb-1.5 block text-sm font-medium text-slate-700">Price (RM)</label>
              <input
                id="package-price"
                value={priceRm}
                onChange={(e) => setPriceRm(e.target.value)}
                placeholder="10.00"
                type="number"
                min="1"
                step="0.01"
                className={inputClass}
              />
              </div><div><label htmlFor="package-games" className="mb-1.5 block text-sm font-medium text-slate-700">Number of games</label>
              <input
                id="package-games"
                value={games}
                onChange={(e) => setGames(e.target.value)}
                placeholder="3"
                type="number"
                min="1"
                step="1"
                className={inputClass}
              />
              </div></div>
            <div><label htmlFor="package-description" className="mb-1.5 block text-sm font-medium text-slate-700">Description <span className="font-normal text-slate-400">(optional)</span></label>
            <input
              id="package-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is included in this package?"
              maxLength={500}
              className={inputClass}
            />
            </div>
            <button
              type="submit"
              disabled={busy === 'package'}
              className="min-h-11 w-full rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              {busy === 'package' ? 'Adding...' : 'Add package'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      }
    >
      <PaymentsContent />
    </Suspense>
  );
}
