'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { GamePlayer } from '../../lib/queue';
import type { AlbumEntry } from '../../components/CommentAlbumFeed';

const GAME_DURATION_MIN = 15;

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initial = (name || '?')[0].toUpperCase();
  const sz =
    size === 'lg' ? 'w-12 h-12 text-base' :
    size === 'sm' ? 'w-7 h-7 text-xs' :
    'w-9 h-9 text-sm';
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

function QueueContent() {
  const searchParams = useSearchParams();
  const uid = searchParams.get('uid');
  const [currentPlayers, setCurrentPlayers] = useState<GamePlayer[]>([]);
  const [queue, setQueue] = useState<GamePlayer[]>([]);
  const [albumEntries, setAlbumEntries] = useState<AlbumEntry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!uid) { setReady(true); return; }
    const queueRef = collection(db, 'users', uid, 'queue');
    const unsubGame = onSnapshot(
      query(queueRef, where('status', '==', 'playing'), orderBy('timestamp', 'asc')),
      (snap) => {
        setCurrentPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GamePlayer));
        setReady(true);
      },
      (err) => { console.error(err); setReady(true); },
    );
    const unsubQueue = onSnapshot(
      query(queueRef, where('status', '==', 'waiting'), orderBy('timestamp', 'asc')),
      (snap) => setQueue(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GamePlayer)),
    );
    const unsubAlbum = onSnapshot(
      query(collection(db, 'users', uid, 'comment_album'), orderBy('timestamp', 'desc'), limit(10)),
      (snap) => setAlbumEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AlbumEntry)),
    );
    return () => { unsubGame(); unsubQueue(); unsubAlbum(); };
  }, [uid]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#07070f' }}>
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!uid) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#07070f' }}>
        <p className="text-gray-500 font-mono text-sm">Missing ?uid= parameter.</p>
      </div>
    );
  }

  const upNext = queue.slice(0, 4);
  const remaining = queue.slice(4);
  const totalWaitMins = currentPlayers.reduce((s, p) => s + p.gamesLeft, 0) * GAME_DURATION_MIN;

  return (
    <div className="min-h-screen text-white" style={{ background: '#07070f' }}>

      {/* Subtle grid texture */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        className="relative z-10 flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black"
            style={{ background: '#7c3aed', boxShadow: '0 0 16px rgba(124,58,237,0.5)' }}
          >
            M
          </div>
          <span className="text-sm font-black tracking-widest text-white uppercase">Mabar Queue</span>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 font-bold text-emerald-400">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            LIVE
          </span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-400">{currentPlayers.length}<span className="text-gray-700">/4</span> playing</span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-400">{queue.length} waiting</span>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main className="relative z-10 max-w-6xl mx-auto px-4 py-6 space-y-4">

        {/* Row 1: NOW PLAYING + UP NEXT */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* NOW PLAYING */}
          <div
            className="lg:col-span-2 rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-black tracking-widest text-emerald-400 uppercase">Now Playing</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Player cards */}
              {currentPlayers.map((p) => {
                const pct = p.totalGames > 0 ? (p.gamesLeft / p.totalGames) * 100 : 0;
                return (
                  <div
                    key={p.id}
                    className="rounded-xl p-3 flex flex-col items-center gap-2 relative overflow-hidden"
                    style={{
                      background: 'rgba(16,185,129,0.05)',
                      border: '1px solid rgba(16,185,129,0.22)',
                      boxShadow: '0 0 18px rgba(16,185,129,0.06) inset',
                    }}
                  >
                    <Avatar name={p.ign} size="md" />
                    <p className="text-sm font-bold text-white text-center w-full truncate">{p.ign}</p>
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        background: 'rgba(16,185,129,0.12)',
                        color: '#34d399',
                        border: '1px solid rgba(16,185,129,0.25)',
                      }}
                    >
                      {p.gamesLeft} {p.gamesLeft === 1 ? 'game' : 'games'}
                    </span>
                    {/* Progress bar */}
                    <div className="w-full h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#10b981,#06b6d4)' }}
                      />
                    </div>
                  </div>
                );
              })}

              {/* Empty slots */}
              {Array.from({ length: Math.max(0, 4 - currentPlayers.length) }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="rounded-xl p-3 flex flex-col items-center justify-center gap-2 h-28"
                  style={{ border: '1px dashed rgba(255,255,255,0.05)' }}
                >
                  <div className="w-9 h-9 rounded-full" style={{ border: '1px dashed rgba(255,255,255,0.08)' }} />
                  <p className="text-[11px] text-gray-700">empty slot</p>
                </div>
              ))}
            </div>
          </div>

          {/* UP NEXT */}
          <div
            className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-black tracking-widest text-violet-400 uppercase">Up Next</span>
              <span className="text-[10px] text-gray-600 font-mono">{upNext.length} players</span>
            </div>

            {upNext.length === 0 ? (
              <div className="flex items-center justify-center h-24">
                <p className="text-gray-700 text-sm">Queue empty</p>
              </div>
            ) : (
              <div className="space-y-2">
                {upNext.map((p, i) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                    style={{
                      background: 'rgba(124,58,237,0.08)',
                      border: '1px solid rgba(124,58,237,0.18)',
                    }}
                  >
                    <span className="text-[11px] font-black text-gray-600 w-4 shrink-0 text-center">{i + 1}</span>
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
          </div>
        </div>

        {/* Row 2: WAITING + COMMENT ALBUM */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* WAITING QUEUE */}
          <div
            className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-black tracking-widest text-amber-400 uppercase">Waiting Queue</span>
              {totalWaitMins > 0 && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: 'rgba(245,158,11,0.1)',
                    color: '#fbbf24',
                    border: '1px solid rgba(245,158,11,0.2)',
                  }}
                >
                  ~{totalWaitMins < 60 ? `${totalWaitMins} min` : `${Math.floor(totalWaitMins / 60)}h ${totalWaitMins % 60}m`} wait
                </span>
              )}
            </div>

            {remaining.length === 0 ? (
              <div className="flex items-center justify-center h-16">
                <p className="text-gray-700 text-sm">
                  {queue.length === 0 ? 'No one waiting' : 'All players shown in Up Next'}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {remaining.map((p, i) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.04)',
                    }}
                  >
                    <span className="text-[11px] font-mono text-gray-600 w-5 shrink-0">{i + 5}.</span>
                    <p className="text-sm text-gray-300 flex-1 truncate">{p.ign}</p>
                    <span className="text-[11px] text-gray-500 shrink-0">
                      {p.gamesLeft} {p.gamesLeft === 1 ? 'match' : 'matches'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* COMMENT ALBUM */}
          <div
            className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-black tracking-widest text-cyan-400 uppercase">Comment Album</span>
              <span className="text-[10px] text-gray-600 font-mono">{albumEntries.length} comments</span>
            </div>

            {albumEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-16 gap-1">
                <p className="text-gray-700 text-sm">No comments yet</p>
                <p className="text-gray-700 text-[11px] font-mono">ALBUM: [GameID] [IGN]</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {albumEntries.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5"
                    style={{
                      background: 'rgba(6,182,212,0.06)',
                      border: '1px solid rgba(6,182,212,0.18)',
                    }}
                  >
                    <span className="font-mono text-sm font-bold text-cyan-400">{e.gameId}</span>
                    <span className="text-sm font-semibold text-white">{e.ign}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Join banner */}
        <div
          className="rounded-2xl px-5 py-4 text-center"
          style={{
            background: 'rgba(124,58,237,0.07)',
            border: '1px solid rgba(124,58,237,0.18)',
          }}
        >
          <p className="text-[11px] font-black tracking-widest text-violet-400 uppercase mb-1">
            Nak join? Donate via Sociabuzz
          </p>
          <p className="text-sm text-gray-500">
            Sertakan <span className="font-mono font-bold text-white">ID: [ML_ID] [IGN]</span> dalam message
          </p>
          <div className="flex justify-center gap-4 mt-2 flex-wrap text-xs text-gray-600">
            <span>RM4 = 1 game</span>
            <span className="text-gray-800">·</span>
            <span>RM10 = 3 games</span>
            <span className="text-gray-800">·</span>
            <span>RM20 = 6 games</span>
            <span className="text-gray-800">·</span>
            <span>RM30 = 10 games</span>
          </div>
        </div>

      </main>
    </div>
  );
}

export default function QueuePage() {
  return (
    <Suspense>
      <QueueContent />
    </Suspense>
  );
}
