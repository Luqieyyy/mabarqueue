'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { publicFetch } from '../../../lib/api-client';

const GAME_DURATION_MIN = 15;
const POLL_MS = 5000;

interface PublicQueueEntry {
  entryId: string;
  ign: string;
  totalGames: number;
  gamesLeft: number;
  status: string;
  orderDate: string | null;
  seq: number;
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
  packages: unknown[];
  playing: PublicQueueEntry[];
  waiting: PublicQueueEntry[];
  hutang: PublicQueueEntry[];
}

const CARD_STYLE = {
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid rgba(255,255,255,0.07)',
} as const;

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initial = (name || '?')[0].toUpperCase();
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center font-black text-white shrink-0`}
      style={{
        background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
        boxShadow: '0 0 10px rgba(124,58,237,0.35)',
      }}
    >
      {initial}
    </div>
  );
}

function formatMins(mins: number): string {
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function PublicQueuePage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === 'string' ? params.slug : '';

  const [data, setData] = useState<PublicPageData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await publicFetch<PublicPageData>(`/api/public/${encodeURIComponent(slug)}`);
      setData(res);
      setNotFound(false);
    } catch {
      // Keep the last good snapshot on a transient poll failure.
      setData((prev) => {
        if (!prev) setNotFound(true);
        return prev;
      });
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

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
        <p className="text-xl font-black text-white">Queue not found</p>
        <p className="text-sm text-gray-500">
          No streamer at <span className="font-mono text-gray-400">/{slug}</span>.
        </p>
      </div>
    );
  }

  const { streamer, game, playing, waiting, hutang } = data;
  const slots = game.slotCount;
  const upNext = waiting.slice(0, slots);
  const rest = waiting.slice(slots);
  const nothingQueued = playing.length === 0 && waiting.length === 0 && hutang.length === 0;

  // Position in the waiting list divided by how many players a round seats,
  // times the length of a round.
  const waitFor = (position: number) => Math.ceil(position / slots) * GAME_DURATION_MIN;

  return (
    <div className="min-h-screen text-white" style={{ background: '#08080e' }}>
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <header
        className="relative z-10 flex items-center justify-between px-6 py-4 border-b flex-wrap gap-3"
        style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black"
            style={{ background: '#7c3aed', boxShadow: '0 0 16px rgba(124,58,237,0.5)' }}
          >
            M
          </div>
          <span className="text-sm font-black tracking-widest text-white uppercase">{streamer.displayName}</span>
          <span className="text-[10px] font-bold text-violet-300 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full uppercase tracking-widest">
            {game.label}
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 font-bold text-emerald-400">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            LIVE
          </span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-400">{playing.length}<span className="text-gray-700">/{slots}</span> playing</span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-400">{waiting.length} waiting</span>
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-4 py-6 space-y-4">

        {nothingQueued ? (
          <div className="rounded-2xl px-5 py-16 text-center" style={CARD_STYLE}>
            <p className="text-sm font-bold text-gray-400">Queue is empty</p>
            <p className="text-[11px] text-gray-600 mt-1">Be the first to join — grab a package on the payment page.</p>
          </div>
        ) : (
          <>
            {/* ── IN GAME ────────────────────────────────────────────────── */}
            <section className="rounded-2xl p-4" style={CARD_STYLE}>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-black tracking-widest text-emerald-400 uppercase">In Game</span>
              </div>

              {playing.length === 0 ? (
                <p className="text-sm text-gray-700">No one in game right now.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {playing.map((p) => {
                    const pct = p.totalGames > 0 ? (p.gamesLeft / p.totalGames) * 100 : 0;
                    return (
                      <div
                        key={p.entryId}
                        className="rounded-xl p-3 flex flex-col items-center gap-2"
                        style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.22)' }}
                      >
                        <Avatar name={p.ign} />
                        <p className="text-sm font-bold text-white text-center w-full truncate">{p.ign}</p>
                        <span
                          className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid rgba(16,185,129,0.25)' }}
                        >
                          {p.gamesLeft} left
                        </span>
                        <div className="w-full h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#10b981,#06b6d4)' }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── UP NEXT ────────────────────────────────────────────────── */}
            <section className="rounded-2xl p-4" style={CARD_STYLE}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-black tracking-widest text-violet-400 uppercase">Up Next</span>
                <span className="text-[10px] text-gray-600 font-mono">{upNext.length} players</span>
              </div>

              {upNext.length === 0 ? (
                <p className="text-sm text-gray-700">No one waiting.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {upNext.map((p, i) => (
                    <div
                      key={p.entryId}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                      style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)' }}
                    >
                      <span className="text-[11px] font-black text-gray-500 w-4 shrink-0 text-center">{i + 1}</span>
                      <Avatar name={p.ign} size="sm" />
                      <p className="text-sm font-semibold text-white flex-1 truncate">{p.ign}</p>
                      <span
                        className="text-[11px] font-black px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: 'rgba(124,58,237,0.2)', color: '#a78bfa' }}
                      >
                        {p.gamesLeft}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── QUEUE ──────────────────────────────────────────────────── */}
            <section className="rounded-2xl p-4" style={CARD_STYLE}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-black tracking-widest text-amber-400 uppercase">Queue</span>
                {rest.length > 0 && (
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }}
                  >
                    ~{formatMins(waitFor(waiting.length))} for the last spot
                  </span>
                )}
              </div>

              {rest.length === 0 ? (
                <p className="text-sm text-gray-700">
                  {waiting.length === 0 ? 'No one waiting.' : 'Everyone waiting is shown in Up Next.'}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {rest.map((p, i) => {
                    const position = slots + i + 1;
                    return (
                      <div
                        key={p.entryId}
                        className="flex items-center gap-3 rounded-lg px-3 py-2"
                        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
                      >
                        <span className="text-[11px] font-mono text-gray-600 w-6 shrink-0">{position}.</span>
                        <p className="text-sm text-gray-300 flex-1 truncate">{p.ign}</p>
                        <span className="text-[11px] text-gray-600 shrink-0">~{formatMins(waitFor(position))}</span>
                        <span className="text-[11px] text-gray-500 shrink-0 w-16 text-right">
                          {p.gamesLeft} {p.gamesLeft === 1 ? 'game' : 'games'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── HUTANG GAME ────────────────────────────────────────────── */}
            {hutang.length > 0 && (
              <section className="rounded-2xl p-4" style={CARD_STYLE}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-black tracking-widest text-cyan-400 uppercase">Hutang Game</span>
                  <span className="text-[10px] text-gray-600 font-mono">{hutang.length} set aside</span>
                </div>
                <p className="text-[11px] text-gray-600 mb-3">
                  Set aside for later — their remaining game credits are kept and will be played another session.
                </p>
                <div className="space-y-1.5">
                  {hutang.map((p) => (
                    <div
                      key={p.entryId}
                      className="flex items-center justify-between rounded-lg px-3 py-2"
                      style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.18)' }}
                    >
                      <p className="text-sm text-gray-300 truncate">{p.ign}</p>
                      <span className="text-[11px] text-cyan-400 font-bold shrink-0">{p.gamesLeft} owed</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

      </main>
    </div>
  );
}
