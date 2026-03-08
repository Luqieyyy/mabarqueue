'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import {
  addPlayerToQueue,
  decreasePlayerGames,
  finishGame,
  increasePlayerGames,
  removeFromQueue,
  skipQueuePlayer,
  skipCurrentPlayer,
  removeCurrentPlayer,
  increaseCurrentGames,
  decreaseCurrentGames,
  settleHutang,
  removeHutang,
  increaseHutangGames,
  decreaseHutangGames,
} from '../../lib/queue';
import type { GamePlayer } from '../../lib/queue';
import Navbar from '../../components/Navbar';
import CurrentPlayerPanel from '../../components/CurrentPlayerPanel';
import QueueList from '../../components/QueueList';
import AddPlayerForm from '../../components/AddPlayerForm';
import DonationFeed, { type Donation } from '../../components/DonationFeed';
import OverlayPreview from '../../components/OverlayPreview';
import WebhookSettings from '../../components/WebhookSettings';
import HutangGamePanel from '../../components/HutangGamePanel';

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [currentPlayers, setCurrentPlayers] = useState<GamePlayer[]>([]);
  const [queue, setQueue] = useState<GamePlayer[]>([]);
  const [hutang, setHutang] = useState<GamePlayer[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [showWebhookSettings, setShowWebhookSettings] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;

    const unsubGame = onSnapshot(
      query(collection(db, 'current_game'), orderBy('timestamp', 'asc')),
      (snap) => setCurrentPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GamePlayer)),
    );

    const unsubQueue = onSnapshot(
      query(collection(db, 'queue'), orderBy('timestamp', 'asc')),
      (snap) => setQueue(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GamePlayer)),
    );

    const unsubHutang = onSnapshot(
      query(collection(db, 'hutang_game'), orderBy('timestamp', 'asc')),
      (snap) => setHutang(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GamePlayer)),
    );

    const unsubDonations = onSnapshot(
      query(collection(db, 'donations'), orderBy('timestamp', 'desc'), limit(20)),
      (snap) => setDonations(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Donation)),
    );

    return () => {
      unsubGame();
      unsubQueue();
      unsubHutang();
      unsubDonations();
    };
  }, [user]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function run(action: () => Promise<void>, msg: string) {
    setLoading(true);
    try {
      await action();
      showToast(msg);
    } catch (err) {
      console.error(err);
      showToast('Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalPlayers = queue.length + currentPlayers.length;
  const totalGames =
    queue.reduce((s, p) => s + p.gamesLeft, 0) +
    currentPlayers.reduce((s, p) => s + p.gamesLeft, 0);

  return (
    <div className="min-h-screen bg-slate-100 text-gray-900">
      <Navbar
        userName={user.email?.split('@')[0]}
        onSettings={() => setShowWebhookSettings(true)}
      />
      <WebhookSettings
        isOpen={showWebhookSettings}
        onClose={() => setShowWebhookSettings(false)}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-5 py-2.5 rounded-full shadow-xl animate-fade-slide-in">
          {toast}
        </div>
      )}

      {/* Stats bar */}
      <div className="bg-white border-b border-gray-200 px-5 py-2.5 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center gap-6 flex-wrap">
          {[
            { label: 'Total Players', value: totalPlayers, color: 'text-indigo-600' },
            { label: 'Games Left', value: totalGames, color: 'text-emerald-600' },
            { label: 'In Queue', value: queue.length, color: 'text-amber-600' },
            { label: 'Hutang', value: hutang.length, color: 'text-red-500' },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{s.label}</span>
              <span className={`text-sm font-bold ${s.color}`}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main layout */}
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">

        {/* Row 1: Current Game (left) + Queue Table (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Left: Current Game + Add Player */}
          <div className="flex flex-col gap-4">
            <CurrentPlayerPanel
              players={currentPlayers}
              loading={loading}
              onFinishGame={() => run(finishGame, 'Game finished — all viewers −1')}
              onSkip={(id) => run(() => skipCurrentPlayer(id), 'Player moved to Hutang')}
              onRemove={(id) => run(() => removeCurrentPlayer(id), 'Player removed')}
              onIncrease={(id) => run(() => increaseCurrentGames(id), 'Game added')}
              onDecrease={(id) => run(() => decreaseCurrentGames(id), 'Game removed')}
            />
            <AddPlayerForm
              onAdd={(ign, games) =>
                run(() => addPlayerToQueue(ign, ign, games), `${ign} added`)
              }
              loading={loading}
            />
          </div>

          {/* Right: Queue Table */}
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-widest">
                  Waiting Queue
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Columns: Nickname · Jumlah Game · Waktu Order · Baki Game
                </p>
              </div>
              <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
                {queue.length} waiting
              </span>
            </div>
            <div className="max-h-[480px] overflow-y-auto pr-1">
              <QueueList
                players={queue}
                onIncrease={(id) => run(() => increasePlayerGames(id), 'Games +1')}
                onDecrease={(id) => run(() => decreasePlayerGames(id), 'Games −1')}
                onSkip={(id) => run(() => skipQueuePlayer(id), 'Moved to Hutang')}
                onRemove={(id) => run(() => removeFromQueue(id), 'Player removed')}
              />
            </div>
          </div>
        </div>

        {/* Row 2: Hutang Game + Donation Feed + OBS Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <HutangGamePanel
            players={hutang}
            loading={loading}
            onSettle={(id) => run(() => settleHutang(id), 'Moved back to queue')}
            onRemove={(id) => run(() => removeHutang(id), 'Removed from hutang')}
            onIncrease={(id) => run(() => increaseHutangGames(id), 'Games +1')}
            onDecrease={(id) => run(() => decreaseHutangGames(id), 'Games −1')}
          />
          <DonationFeed donations={donations} />
          <OverlayPreview currentPlayers={currentPlayers} queue={queue} />
        </div>

      </div>
    </div>
  );
}
