'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
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
import Navbar from '../../components/Navbar';
import CurrentPlayerPanel from '../../components/CurrentPlayerPanel';
import QueueList from '../../components/QueueList';
import AddPlayerForm from '../../components/AddPlayerForm';
import DonationFeed, { type Donation } from '../../components/DonationFeed';
import LivePreview from '../../components/LivePreview';
import WebhookSettings from '../../components/WebhookSettings';
import HutangGamePanel from '../../components/HutangGamePanel';
import CommentAlbumFeed, { type AlbumEntry } from '../../components/CommentAlbumFeed';

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
  const [debugJson, setDebugJson] = useState('{\n  "id": "test-001",\n  "amount": 1,\n  "supporter": "TestDonor",\n  "message": "43149159 Luqieyyy",\n  "level": { "title": "PACKAGE MABAR 1 GAME" }\n}');
  const [debugResponse, setDebugResponse] = useState('');
  const [debugLoading, setDebugLoading] = useState(false);
  const [firestoreError, setFirestoreError] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user || !username) return;
    const uid = username;
    const queueRef = collection(db, 'users', uid, 'queue');

    const onErr = (err: Error) => {
      console.error('[Firestore]', err.message);
      if (err.message.includes('index')) {
        setFirestoreError('Firestore index missing. Run: firebase deploy --only firestore:indexes');
      } else {
        setFirestoreError(err.message);
      }
    };

    // Unified queue — 3 filtered listeners by status
    const unsubPlaying = onSnapshot(
      query(queueRef, where('status', '==', 'playing'), orderBy('timestamp', 'asc')),
      (snap) => { setCurrentPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GamePlayer)); setFirestoreError(''); },
      onErr,
    );
    const unsubWaiting = onSnapshot(
      query(queueRef, where('status', '==', 'waiting'), orderBy('timestamp', 'asc')),
      (snap) => setWaitingPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GamePlayer)),
      onErr,
    );
    const unsubSkipped = onSnapshot(
      query(queueRef, where('status', '==', 'skipped'), orderBy('timestamp', 'asc')),
      (snap) => setHutangPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GamePlayer)),
      onErr,
    );
    const unsubDonations = onSnapshot(
      query(collection(db, 'users', uid, 'donations'), orderBy('timestamp', 'desc'), limit(20)),
      (snap) => setDonations(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Donation)),
    );
    const unsubAlbum = onSnapshot(
      query(collection(db, 'users', uid, 'comment_album'), orderBy('timestamp', 'desc'), limit(30)),
      (snap) => setAlbumEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AlbumEntry)),
    );

    return () => {
      unsubPlaying(); unsubWaiting(); unsubSkipped(); unsubDonations(); unsubAlbum();
    };
  }, [user, username]);

  async function sendDebugWebhook() {
    if (!user) return;
    setDebugLoading(true);
    setDebugResponse('');
    try {
      const parsed = JSON.parse(debugJson);
      const res = await fetch(`/api/sociabuzz/${uid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      setDebugResponse(JSON.stringify(data, null, 2));
    } catch (err) {
      setDebugResponse(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDebugLoading(false);
    }
  }

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

  const uid = username; // Firestore doc ID = email prefix (e.g. "luqmanbahrin2004")
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

      <div className="bg-white border-b border-gray-200 px-5 py-2.5 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center gap-6 flex-wrap">
          {[
            { label: 'Total Players', value: totalPlayers, color: 'text-indigo-600' },
            { label: 'Games Left', value: totalGames, color: 'text-emerald-600' },
            { label: 'In Queue', value: waitingPlayers.length, color: 'text-amber-600' },
            { label: 'Hutang', value: hutangPlayers.length, color: 'text-red-500' },
            { label: 'Album', value: albumEntries.length, color: 'text-purple-600' },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{s.label}</span>
              <span className={`text-sm font-bold ${s.color}`}>{s.value}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {[
              { label: 'Queue', href: `/queue?uid=${uid}` },
              { label: 'Overlay', href: `/overlay?uid=${uid}` },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-full transition-colors"
              >
                {link.label} ↗
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CurrentPlayerPanel
            players={currentPlayers}
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

        <CommentAlbumFeed entries={albumEntries} />
        <LivePreview currentPlayers={currentPlayers} queue={waitingPlayers} albumEntries={albumEntries} />

        {/* DEBUG */}
        <div className="bg-yellow-50 border border-yellow-300 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-yellow-700 uppercase tracking-widest">Debug — Webhook Tester</span>
            <span className="text-xs text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full">Sementara je</span>
          </div>
          <p className="text-[11px] text-yellow-700 font-mono">POST /api/sociabuzz/<span className="font-bold">{uid}</span></p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs text-yellow-700 font-medium">JSON Payload</label>
              <textarea value={debugJson} onChange={(e) => setDebugJson(e.target.value)} rows={8} className="w-full font-mono text-xs bg-white border border-yellow-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none" spellCheck={false} />
              <button onClick={sendDebugWebhook} disabled={debugLoading} className="w-full bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition-colors">
                {debugLoading ? 'Sending...' : `Send to /api/sociabuzz/${uid}`}
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-yellow-700 font-medium">Response</label>
              <pre className="w-full h-[calc(100%-2rem)] min-h-[8rem] font-mono text-xs bg-white border border-yellow-200 rounded-lg p-3 overflow-auto whitespace-pre-wrap break-all text-gray-700">
                {debugResponse || '— tekan Send untuk tengok response —'}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
