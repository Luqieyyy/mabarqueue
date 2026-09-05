'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
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
  moveCurrentToQueue,
  promoteQueuePlayerToGame,
} from '../../lib/queue';
import type { GamePlayer } from '../../lib/queue';
import { getGameDefinition, DEFAULT_GAME, type GameId } from '../../lib/games';
import { apiFetch, ApiError } from '../../lib/api-client';
import Navbar from '../../components/Navbar';
import CurrentPlayerPanel from '../../components/CurrentPlayerPanel';
import QueueList from '../../components/QueueList';
import AddPlayerForm from '../../components/AddPlayerForm';
import DonationFeed, { type Donation } from '../../components/DonationFeed';
import LivePreview from '../../components/LivePreview';
import WebhookSettings from '../../components/WebhookSettings';
import HutangGamePanel from '../../components/HutangGamePanel';
import CommentAlbumFeed, { type AlbumEntry } from '../../components/CommentAlbumFeed';
import { DEFAULT_FEATURES, type FeatureSettings } from '../../lib/settings';

export default function DashboardPage() {
  const router = useRouter();
  const { user, username, loading: authLoading } = useAuth();

  const [currentPlayers, setCurrentPlayers] = useState<GamePlayer[]>([]);
  const [waitingPlayers, setWaitingPlayers] = useState<GamePlayer[]>([]);
  const [hutangPlayers, setHutangPlayers] = useState<GamePlayer[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [albumEntries, setAlbumEntries] = useState<AlbumEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [showWebhookSettings, setShowWebhookSettings] = useState(false);
  const [firestoreError, setFirestoreError] = useState('');
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [dashboardKey, setDashboardKey] = useState('');
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [activeGame, setActiveGame] = useState<GameId>(DEFAULT_GAME);
  const [features, setFeatures] = useState<FeatureSettings>(DEFAULT_FEATURES);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setWorkspaceReady(false); setWorkspaceError('');
    apiFetch<{ streamer: { legacyUsername: string | null; status: string } }>('/api/streamers')
      .then(({ streamer }) => {
        if (cancelled) return;
        if (streamer.status === 'suspended') { setWorkspaceError('This workspace is suspended.'); return; }
        setDashboardKey(streamer.legacyUsername || username);
        setWorkspaceReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) router.replace('/onboarding');
        else setWorkspaceError(err instanceof Error ? err.message : 'Could not load your workspace.');
      });
    return () => { cancelled = true; };
  }, [user, username, router, bootstrapAttempt]);

  // Active game setting — determines which game's queue/donations show below
  useEffect(() => {
    if (!user || !dashboardKey || !workspaceReady) return;
    const unsub = onSnapshot(doc(db, 'users', dashboardKey, 'settings', 'game'), (snap) => {
      const game = (snap.exists() ? (snap.data().activeGame as GameId | undefined) : undefined) ?? DEFAULT_GAME;
      setActiveGame(game);
    });
    return () => unsub();
  }, [user, dashboardKey, workspaceReady]);

  useEffect(() => {
    if (!user || !dashboardKey || !workspaceReady) return;
    return onSnapshot(doc(db, 'users', dashboardKey, 'settings', 'features'), (snap) => {
      setFeatures(snap.exists() ? { ...DEFAULT_FEATURES, ...snap.data() } : DEFAULT_FEATURES);
    });
  }, [user, dashboardKey, workspaceReady]);

  useEffect(() => {
    if (!user || !dashboardKey || !workspaceReady) return;
    const uid = dashboardKey;
    const queueRef = collection(db, 'users', uid, 'queue');

    const onErr = (err: Error) => {
      console.error('[Firestore]', err.message);
      if (err.message.includes('index')) {
        setFirestoreError('Firestore index missing. Run: firebase deploy --only firestore:indexes');
      } else {
        setFirestoreError(err.message);
      }
    };

    // Unified queue — 3 filtered listeners by status, scoped to the active game
    const unsubPlaying = onSnapshot(
      query(queueRef, where('status', '==', 'playing'), where('game', '==', activeGame), orderBy('timestamp', 'asc')),
      (snap) => { setCurrentPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GamePlayer)); setFirestoreError(''); },
      onErr,
    );
    const unsubWaiting = onSnapshot(
      query(queueRef, where('status', '==', 'waiting'), where('game', '==', activeGame), orderBy('timestamp', 'asc')),
      (snap) => setWaitingPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GamePlayer)),
      onErr,
    );
    const unsubSkipped = onSnapshot(
      query(queueRef, where('status', '==', 'skipped'), where('game', '==', activeGame), orderBy('timestamp', 'asc')),
      (snap) => setHutangPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GamePlayer)),
      onErr,
    );
    const unsubDonations = onSnapshot(
      query(collection(db, 'users', uid, 'donations'), where('game', '==', activeGame), orderBy('timestamp', 'desc'), limit(20)),
      (snap) => setDonations(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Donation)),
    );
    const albumEnabled = getGameDefinition(activeGame).capabilities.commentAlbum && features.commentAlbum;
    if (!albumEnabled) setAlbumEntries([]);
    const unsubAlbum = albumEnabled
      ? onSnapshot(
        query(collection(db, 'users', uid, 'comment_album'), orderBy('timestamp', 'desc'), limit(30)),
        (snap) => setAlbumEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AlbumEntry)),
      )
      : () => {};

    return () => {
      unsubPlaying(); unsubWaiting(); unsubSkipped(); unsubDonations(); unsubAlbum();
    };
  }, [user, dashboardKey, workspaceReady, activeGame, features.commentAlbum]);

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

  if (workspaceError) return <main className="min-h-screen bg-slate-100 text-gray-900 p-8"><p role="alert">{workspaceError}</p><button onClick={() => setBootstrapAttempt((n) => n + 1)} className="mt-4 underline">Retry</button></main>;

  if (authLoading || !user || !workspaceReady) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const uid = dashboardKey; // Server-provisioned dashboard data path.
  const gameDefinition = getGameDefinition(activeGame);
  const maxSlots = gameDefinition.slotCount;
  const albumEnabled = gameDefinition.capabilities.commentAlbum && features.commentAlbum;
  const totalPlayers = waitingPlayers.length + currentPlayers.length;
  const totalGames =
    waitingPlayers.reduce((s, p) => s + p.gamesLeft, 0) +
    currentPlayers.reduce((s, p) => s + p.gamesLeft, 0);

  return (
    <div className="min-h-screen bg-slate-100 text-gray-900">
      <Navbar
        userName={user.email?.split('@')[0]}
        onSettings={() => setShowWebhookSettings(true)}
      />
      <WebhookSettings
        uid={uid}
        isOpen={showWebhookSettings}
        onClose={() => setShowWebhookSettings(false)}
      />

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-5 py-2.5 rounded-full shadow-xl animate-fade-slide-in">
          {toast}
        </div>
      )}

      {firestoreError && (
        <div className="bg-red-50 border-b border-red-200 px-5 py-2.5 text-red-700 text-xs flex items-center gap-2">
          <span className="font-bold">Firestore Error:</span>
          <span className="font-mono">{firestoreError}</span>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6 md:px-6 md:py-8 space-y-6">
        <section aria-labelledby="dashboard-title" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><h1 id="dashboard-title" className="text-2xl font-bold tracking-tight text-slate-900">{gameDefinition.label} workspace</h1><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">ACTIVE GAME</span></div>
            <p className="mt-1 text-sm text-slate-500">Manage mabar sessions, donations{albumEnabled ? ', and album comments' : ''} from one place.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { label: 'View public queue', href: `/queue?uid=${encodeURIComponent(uid)}` },
              { label: 'Open overlay', href: `/overlay?uid=${encodeURIComponent(uid)}` },
            ].map((link) => (
              <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer"
                aria-label={`${link.label} (opens in a new tab)`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                {link.label}
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5 shrink-0"><path d="M6 14 14 6M6 6h8v8" /></svg>
              </a>
            ))}
          </div>
        </section>

        <section aria-label="Queue overview" className="rounded-2xl border border-slate-200 bg-white p-2">
          <dl className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: 'Total players', value: totalPlayers, color: 'text-slate-900' },
              { label: 'Games remaining', value: totalGames, color: 'text-indigo-600' },
              { label: 'Waiting', value: waitingPlayers.length, color: 'text-amber-600' },
              { label: 'Hutang', value: hutangPlayers.length, color: 'text-rose-600' },
              ...(albumEnabled ? [{ label: 'Album comments', value: albumEntries.length, color: 'text-slate-600' }] : []),
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl px-3 py-3 md:px-4">
                <dt className="text-xs font-medium text-slate-500">{stat.label}</dt>
                <dd className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${stat.color}`}>{stat.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CurrentPlayerPanel
            players={currentPlayers}
            maxSlots={maxSlots}
            loading={loading}
            onFinishGame={() => run(() => finishGame(uid), 'Game finished — all viewers −1')}
            onSkip={(id) => run(() => skipCurrentPlayer(uid, id), 'Player moved to Hutang')}
            onMoveToQueue={(id) => run(() => moveCurrentToQueue(uid, id), 'Player moved to Queue')}
            onRemove={(id) => run(() => removeCurrentPlayer(uid, id), 'Player removed')}
            onIncrease={(id) => run(() => increaseCurrentGames(uid, id), 'Game added')}
            onDecrease={(id) => run(() => decreaseCurrentGames(uid, id), 'Game removed')}
          />
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xs font-bold text-gray-700 uppercase tracking-widest">Waiting Queue</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">IGN · Tarikh · Baki Game</p>
              </div>
              <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
                {waitingPlayers.length} waiting
              </span>
            </div>
            <div className="max-h-[420px] overflow-y-auto pr-1">
              <QueueList
                players={waitingPlayers}
                currentCount={currentPlayers.length}
                maxSlots={maxSlots}
                onIncrease={(id) => run(() => increasePlayerGames(uid, id), 'Games +1')}
                onDecrease={(id) => run(() => decreasePlayerGames(uid, id), 'Games −1')}
                onSkip={(id) => run(() => skipQueuePlayer(uid, id), 'Moved to Hutang')}
                onRemove={(id) => run(() => removeFromQueue(uid, id), 'Player removed')}
                onPromote={(id) => run(() => promoteQueuePlayerToGame(uid, id), 'Player promoted to In Game')}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <AddPlayerForm
            onAdd={(ign, games) => run(() => addPlayerToQueue(uid, ign, ign, games), `${ign} added`)}
            loading={loading}
          />
          <HutangGamePanel
            players={hutangPlayers}
            loading={loading}
            onSettle={(id) => run(() => settleHutang(uid, id), 'Moved back to queue')}
            onRemove={(id) => run(() => removeHutang(uid, id), 'Removed from hutang')}
            onIncrease={(id) => run(() => increaseHutangGames(uid, id), 'Games +1')}
            onDecrease={(id) => run(() => decreaseHutangGames(uid, id), 'Games −1')}
          />
          <DonationFeed donations={donations} />
        </div>

        {albumEnabled && <CommentAlbumFeed entries={albumEntries} />}
        <LivePreview currentPlayers={currentPlayers} queue={waitingPlayers} albumEntries={albumEnabled ? albumEntries : []} maxSlots={maxSlots} />
      </main>
    </div>
  );
}
