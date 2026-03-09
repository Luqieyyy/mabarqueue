'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { GamePlayer } from '../../lib/queue';

const GAME_DURATION_MIN = 15;

export default function QueuePage() {
  const searchParams = useSearchParams();
  const uid = searchParams.get('uid');
  const [currentPlayers, setCurrentPlayers] = useState<GamePlayer[]>([]);
  const [queue, setQueue] = useState<GamePlayer[]>([]);
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
      (err) => { console.error('Firestore error:', err); setReady(true); },
    );
    const unsubQueue = onSnapshot(
      query(queueRef, where('status', '==', 'waiting'), orderBy('timestamp', 'asc')),
      (snap) => setQueue(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GamePlayer)),
    );
    return () => { unsubGame(); unsubQueue(); };
  }, [uid]);

  const estimatedWait = (position: number): string => {
    const currentGames = currentPlayers.reduce((s, p) => s + p.gamesLeft, 0);
    const gamesAhead = currentGames + queue.slice(0, position - 1).reduce((s, p) => s + p.gamesLeft, 0);
    const mins = gamesAhead * GAME_DURATION_MIN;
    if (mins === 0) return 'Next up';
    if (mins < 60) return `~${mins} min`;
    return `~${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const totalPlayers = queue.length + currentPlayers.length;

  return (
    <div className="min-h-screen bg-slate-100 text-gray-900">
      {/* Navbar */}
      <nav className="h-14 border-b border-gray-200 bg-white shadow-sm flex items-center justify-between px-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-xs font-black text-white">
            M
          </div>
          <span className="font-bold text-sm text-gray-900">MabarQueue</span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 font-medium">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          Live · {totalPlayers} players
        </span>
      </nav>

      <main className="max-w-lg mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-gray-900">Mabar Queue</h1>
          <p className="text-gray-500 text-sm mt-1">Updates in real-time</p>
        </div>

        {!ready ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* IN GAME */}
            <section className="mb-6">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                In Game ({currentPlayers.length}/4 slots)
              </p>
              {currentPlayers.length > 0 ? (
                <div className="space-y-2">
                  {currentPlayers.map((player) => (
                    <div
                      key={player.id}
                      className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-3 animate-pulse-glow flex items-center justify-between"
                    >
                      <div>
                        <p className="text-xs text-emerald-600 font-bold uppercase tracking-widest mb-0.5">
                          In Game
                        </p>
                        <p className="text-xl font-black text-gray-900">{player.ign}</p>
                        <p className="text-emerald-600 text-sm mt-0.5">
                          {player.gamesLeft} game{player.gamesLeft !== 1 ? 's' : ''} remaining
                        </p>
                      </div>
                      {player.orderDate && (
                        <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
                          {player.orderDate}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 text-center">
                  <p className="text-gray-500 text-sm">No current players</p>
                  <p className="text-gray-400 text-xs mt-1">Queue is empty</p>
                </div>
              )}
            </section>

            {/* Waiting Queue */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                  Waiting
                </p>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{queue.length} in queue</span>
              </div>

              {queue.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center">
                  <p className="text-gray-500 text-sm">No one waiting</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {queue.map((player, index) => (
                    <div
                      key={player.id}
                      className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors"
                    >
                      <span className="text-gray-400 font-mono text-sm w-5 shrink-0">
                        {index + 1}.
                      </span>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 text-sm">{player.ign}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-gray-500">
                            {player.gamesLeft} game{player.gamesLeft !== 1 ? 's' : ''}
                          </p>
                          {player.orderDate && (
                            <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0 rounded-full">
                              {player.orderDate}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">
                        {estimatedWait(index + 1)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Donation info */}
            <div className="mt-8 bg-indigo-50 border border-indigo-200 rounded-2xl p-4 text-center">
              <p className="text-xs font-bold text-indigo-700 uppercase tracking-widest mb-1">
                Join the Queue
              </p>
              <p className="text-sm text-indigo-600">
                Donate via Sociabuzz · Include <span className="font-bold font-mono">IGN: YourIGN</span> in message
              </p>
              <div className="flex justify-center gap-3 mt-2 flex-wrap text-xs text-indigo-500">
                <span>RM4 = 1 game</span>
                <span>·</span>
                <span>RM10 = 3 games</span>
                <span>·</span>
                <span>RM20 = 6 games</span>
                <span>·</span>
                <span>RM30 = 10 games</span>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
