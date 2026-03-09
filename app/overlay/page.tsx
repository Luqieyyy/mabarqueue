'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { GamePlayer } from '../../lib/queue';

const MAX_QUEUE_ROWS = 8;

function OverlayContent() {
  const searchParams = useSearchParams();
  const uid = searchParams.get('uid');
  const [currentPlayers, setCurrentPlayers] = useState<GamePlayer[]>([]);
  const [queue, setQueue] = useState<GamePlayer[]>([]);

  useEffect(() => {
    if (!uid) return;
    const queueRef = collection(db, 'users', uid, 'queue');
    const unsubGame = onSnapshot(
      query(queueRef, where('status', '==', 'playing'), orderBy('timestamp', 'asc')),
      (snap) => setCurrentPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GamePlayer)),
    );
    const unsubQueue = onSnapshot(
      query(queueRef, where('status', '==', 'waiting'), orderBy('timestamp', 'asc')),
      (snap) => setQueue(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GamePlayer)),
    );
    return () => { unsubGame(); unsubQueue(); };
  }, [uid]);

  if (!uid) return (
    <div style={{ color: '#888', fontFamily: 'monospace', padding: '20px', fontSize: '12px' }}>
      Missing ?uid= parameter. Use the overlay URL from your dashboard.
    </div>
  );

  // Hide overlay when nothing is queued
  if (currentPlayers.length === 0 && queue.length === 0) return null;

  const nextTurn = queue.slice(0, 4);
  const remaining = queue.slice(4, 4 + MAX_QUEUE_ROWS);

  return (
    <div
      style={{
        background: 'transparent',
        fontFamily: "'Segoe UI', 'Arial', sans-serif",
        width: '100%',
        maxWidth: '500px',
        userSelect: 'none',
      }}
    >
      {/* ── Table container ── */}
      <div
        style={{
          background: '#ffffff',
          border: '2px solid #cccccc',
          borderRadius: '4px',
          overflow: 'hidden',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        }}
      >
        {/* Title bar */}
        <div
          style={{
            background: '#e8e8e8',
            borderBottom: '2px solid #aaaaaa',
            padding: '5px 10px',
            textAlign: 'center',
          }}
        >
          <span style={{ fontWeight: 900, fontSize: '13px', letterSpacing: '0.12em', color: '#333333', textTransform: 'uppercase' }}>
            Waiting List
          </span>
        </div>

        {/* Column headers */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '70px 1fr 60px 80px 60px',
            background: '#d0d0d0',
            borderBottom: '2px solid #aaaaaa',
            padding: '4px 0',
          }}
        >
          {['', 'Nickname', 'Jumlah Game', 'Waktu Order', 'Baki Game'].map((h, i) => (
            <div
              key={i}
              style={{
                textAlign: i === 0 ? 'center' : i >= 2 ? 'center' : 'left',
                fontSize: '9px',
                fontWeight: 800,
                color: '#444444',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                padding: '0 6px',
              }}
            >
              {h}
            </div>
          ))}
        </div>

        {/* ── IN GAME section ── */}
        {currentPlayers.length > 0 && (
          <>
            <SectionDivider label="IN GAME" color="#22c55e" />
            {currentPlayers.map((player, i) => (
              <PlayerRow
                key={player.id}
                index={i + 1}
                player={player}
                rowBg={i % 2 === 0 ? '#f0fdf4' : '#dcfce7'}
                statusBg="#22c55e"
                statusText="white"
                labelCol={i === 0 ? 'IN GAME' : ''}
                isFirst={i === 0}
              />
            ))}
          </>
        )}

        {/* ── NEXT TURN section ── */}
        {nextTurn.length > 0 && (
          <>
            <SectionDivider label="NEXT TURN" color="#f97316" />
            {nextTurn.map((player, i) => (
              <PlayerRow
                key={player.id}
                index={i + 1}
                player={player}
                rowBg={i % 2 === 0 ? '#fff7ed' : '#ffedd5'}
                statusBg="#f97316"
                statusText="white"
                labelCol={i === 0 ? 'NEXT TURN' : ''}
                isFirst={i === 0}
              />
            ))}
          </>
        )}

        {/* ── Additional Queue sections ── */}
        {remaining.length > 0 && (
          <>
            <SectionDivider label="QUE" color="#6366f1" />
            {remaining.map((player, i) => (
              <PlayerRow
                key={player.id}
                index={i + 1}
                player={player}
                rowBg={i % 2 === 0 ? '#f5f3ff' : '#ede9fe'}
                statusBg="#6366f1"
                statusText="white"
                labelCol={i === 0 ? 'QUE' : ''}
                isFirst={i === 0}
              />
            ))}
          </>
        )}

        {/* More indicator */}
        {queue.length > 4 + MAX_QUEUE_ROWS && (
          <div
            style={{
              background: '#f8f8f8',
              borderTop: '1px solid #e0e0e0',
              padding: '4px 10px',
              textAlign: 'center',
              fontSize: '10px',
              color: '#888888',
            }}
          >
            +{queue.length - 4 - MAX_QUEUE_ROWS} more in queue
          </div>
        )}
      </div>
    </div>
  );
}

export default function OverlayPage() {
  return (
    <Suspense>
      <OverlayContent />
    </Suspense>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionDivider({ label, color }: { label: string; color: string }) {
  return (
    <div
      style={{
        background: color,
        padding: '3px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}
    >
      <span
        style={{
          fontSize: '9px',
          fontWeight: 900,
          color: '#ffffff',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
        }}
      >
        ── {label} ──
      </span>
    </div>
  );
}

interface RowProps {
  index: number;
  player: GamePlayer;
  rowBg: string;
  statusBg: string;
  statusText: string;
  labelCol: string;
  isFirst: boolean;
}

function PlayerRow({ index, player, rowBg, statusBg, statusText, labelCol, isFirst }: RowProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '70px 1fr 60px 80px 60px',
        background: rowBg,
        borderBottom: '1px solid #e5e5e5',
        alignItems: 'center',
        minHeight: '30px',
      }}
    >
      {/* Section label / position */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px 4px',
        }}
      >
        {labelCol ? (
          <span
            style={{
              background: statusBg,
              color: statusText,
              fontSize: '8px',
              fontWeight: 900,
              padding: '2px 5px',
              borderRadius: '3px',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {labelCol}
          </span>
        ) : (
          <span style={{ color: '#999999', fontSize: '10px' }}></span>
        )}
      </div>

      {/* Nickname */}
      <div style={{ padding: '4px 6px', overflow: 'hidden' }}>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 700,
            color: '#111111',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: 'block',
          }}
        >
          {player.ign}
        </span>
      </div>

      {/* Jumlah Game */}
      <div style={{ padding: '4px 6px', textAlign: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#333333' }}>
          {player.totalGames}
        </span>
      </div>

      {/* Waktu Order */}
      <div style={{ padding: '4px 6px', textAlign: 'center' }}>
        {player.orderDate ? (
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              color: '#92400e',
              background: '#fef3c7',
              padding: '1px 5px',
              borderRadius: '3px',
              whiteSpace: 'nowrap',
            }}
          >
            {player.orderDate}
          </span>
        ) : (
          <span style={{ color: '#cccccc', fontSize: '11px' }}>—</span>
        )}
      </div>

      {/* Baki Game */}
      <div style={{ padding: '4px 6px', textAlign: 'center' }}>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 900,
            color: player.gamesLeft <= 1 ? '#ef4444' : player.gamesLeft <= 3 ? '#f97316' : '#16a34a',
          }}
        >
          {player.gamesLeft}
        </span>
      </div>
    </div>
  );
}
