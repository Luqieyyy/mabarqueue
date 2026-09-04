'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { publicFetch, ApiError } from '../../../lib/api-client';
import { formatSen, toSen } from '../../../lib/domain/money';

interface PublicQueueEntry {
  entryId: string;
  ign: string;
  totalGames: number;
  gamesLeft: number;
  status: string;
  orderDate: string | null;
  seq: number;
}

interface PublicPackage {
  packageId: string;
  title: string;
  description: string;
  priceSen: number;
  games: number;
}

interface PublicPageData {
  success: true;
  streamer: {
    streamerId: string;
    displayName: string;
    slug: string;
    avatarUrl: string | null;
    bio: string | null;
    activeGame: string;
    acceptingPayments: boolean;
  };
  game: { id: string; label: string; idLabel: string; slotCount: number };
  packages: PublicPackage[];
  playing: PublicQueueEntry[];
  waiting: PublicQueueEntry[];
  hutang: PublicQueueEntry[];
}

interface CheckoutResponse {
  success: true;
  url: string;
}

const CARD_STYLE = {
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid rgba(255,255,255,0.07)',
} as const;

function StreamerContent() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === 'string' ? params.slug : '';
  const searchParams = useSearchParams();
  const paid = searchParams.get('paid') === '1';
  const cancelled = searchParams.get('cancelled') === '1';

  const [data, setData] = useState<PublicPageData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  const [ign, setIgn] = useState('');
  const [donorName, setDonorName] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await publicFetch<PublicPageData>(`/api/public/${encodeURIComponent(slug)}`);
      setData(res);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handlePay() {
    if (!data || !selected) return;
    if (!ign.trim()) {
      setError(`Please enter your ${data.game.idLabel}.`);
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = await publicFetch<CheckoutResponse>('/api/payments/create', {
        method: 'POST',
        body: {
          slug,
          packageId: selected,
          ign: ign.trim(),
          ...(donorName.trim() ? { donorName: donorName.trim() } : {}),
        },
      });
      window.location.href = res.url;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start checkout. Please try again.');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#07070f' }}>
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 px-6 text-center" style={{ background: '#07070f' }}>
        <p className="text-xl font-black text-white">Streamer not found</p>
        <p className="text-sm text-gray-500">
          No one is using <span className="font-mono text-gray-400">/{slug}</span> yet.
        </p>
      </div>
    );
  }

  const { streamer, game, packages, playing, waiting } = data;
  const initial = (streamer.displayName || '?')[0].toUpperCase();

  return (
    <div className="min-h-screen text-white" style={{ background: '#07070f' }}>
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <main className="relative z-10 max-w-2xl mx-auto px-4 py-10 space-y-4">

        {paid && (
          <div
            className="rounded-2xl px-5 py-4"
            style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}
          >
            <p className="text-[11px] font-black tracking-widest text-emerald-400 uppercase mb-1">Payment received</p>
            <p className="text-sm text-gray-400">You&apos;ll appear in the queue shortly.</p>
          </div>
        )}

        {cancelled && (
          <div className="rounded-2xl px-5 py-4" style={CARD_STYLE}>
            <p className="text-[11px] font-black tracking-widest text-gray-400 uppercase mb-1">Payment cancelled</p>
            <p className="text-sm text-gray-500">Nothing was charged. Pick a package to try again.</p>
          </div>
        )}

        {/* ── Profile ────────────────────────────────────────────────────── */}
        <div className="rounded-2xl p-5 flex items-center gap-4" style={CARD_STYLE}>
          {streamer.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={streamer.avatarUrl}
              alt={streamer.displayName}
              className="w-14 h-14 rounded-full object-cover shrink-0"
            />
          ) : (
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-black text-white shrink-0"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 0 14px rgba(124,58,237,0.35)' }}
            >
              {initial}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-black text-white truncate">{streamer.displayName}</h1>
              <span className="text-[10px] font-bold text-violet-300 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full uppercase tracking-widest">
                {game.label}
              </span>
            </div>
            {streamer.bio && <p className="text-sm text-gray-500 mt-1">{streamer.bio}</p>}
          </div>
        </div>

        {!streamer.acceptingPayments && (
          <div
            className="rounded-2xl px-5 py-4"
            style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.22)' }}
          >
            <p className="text-[11px] font-black tracking-widest text-amber-400 uppercase mb-1">Not accepting payments yet</p>
            <p className="text-sm text-gray-500">
              {streamer.displayName} hasn&apos;t finished setting up payouts. Check back soon.
            </p>
          </div>
        )}

        {/* ── Purchase form ──────────────────────────────────────────────── */}
        <div className="rounded-2xl p-5 space-y-4" style={CARD_STYLE}>
          <span className="text-[11px] font-black tracking-widest text-violet-400 uppercase">Join the queue</span>

          <div className="space-y-1.5">
            <label htmlFor="ign" className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
              {game.idLabel}
            </label>
            <input
              id="ign"
              value={ign}
              onChange={(e) => { setIgn(e.target.value); setError(''); }}
              disabled={!streamer.acceptingPayments}
              placeholder="43149159 YourName"
              className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 outline-none focus:border-violet-500 disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}
            />
            <p className="text-[11px] text-gray-600">Paste your ID and nickname exactly as they appear in game.</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="donorName" className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
              Display name <span className="text-gray-600 font-normal">(optional)</span>
            </label>
            <input
              id="donorName"
              value={donorName}
              onChange={(e) => setDonorName(e.target.value)}
              disabled={!streamer.acceptingPayments}
              placeholder="How you're shouted out on stream"
              className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 outline-none focus:border-violet-500 disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}
            />
          </div>

          {packages.length === 0 ? (
            <p className="text-sm text-gray-600">No packages available right now.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {packages.map((p) => {
                const active = selected === p.packageId;
                return (
                  <button
                    key={p.packageId}
                    type="button"
                    disabled={!streamer.acceptingPayments}
                    onClick={() => { setSelected(p.packageId); setError(''); }}
                    className="rounded-xl p-4 text-left transition-colors disabled:opacity-50"
                    style={{
                      background: active ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${active ? 'rgba(124,58,237,0.45)' : 'rgba(255,255,255,0.06)'}`,
                    }}
                  >
                    <p className="text-sm font-bold text-white">{p.title}</p>
                    {p.description && <p className="text-[11px] text-gray-500 mt-0.5">{p.description}</p>}
                    <p className="text-base font-black text-violet-300 mt-2">{formatSen(toSen(p.priceSen))}</p>
                    <p className="text-[11px] text-gray-500">{p.games} {p.games === 1 ? 'game' : 'games'}</p>
                  </button>
                );
              })}
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="button"
            onClick={() => void handlePay()}
            disabled={!streamer.acceptingPayments || !selected || submitting}
            className="w-full rounded-xl py-3 text-sm font-black uppercase tracking-widest text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:hover:bg-violet-600 transition-colors"
          >
            {submitting ? 'Redirecting…' : 'Pay & join queue'}
          </button>
        </div>

        {/* ── Live queue preview ─────────────────────────────────────────── */}
        <div className="rounded-2xl p-5" style={CARD_STYLE}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-black tracking-widest text-emerald-400 uppercase">Now playing</span>
            <span className="text-[10px] text-gray-600 font-mono">{waiting.length} waiting</span>
          </div>

          {playing.length === 0 ? (
            <p className="text-sm text-gray-700">No one in game right now.</p>
          ) : (
            <div className="space-y-1.5">
              {playing.map((e) => (
                <div
                  key={e.entryId}
                  className="flex items-center justify-between rounded-lg px-3 py-2"
                  style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)' }}
                >
                  <p className="text-sm font-semibold text-white truncate">{e.ign}</p>
                  <span className="text-[11px] text-emerald-400 font-bold shrink-0">{e.gamesLeft} left</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}

export default function StreamerPage() {
  return (
    <Suspense>
      <StreamerContent />
    </Suspense>
  );
}
