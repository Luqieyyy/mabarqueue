'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { publicFetch } from '../../../lib/api-client';

const MAX_QUEUE_ROWS = 8;
const POLL_MS = 3000;

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
  game: { id: string; label: string; idLabel: string; slotCount: number };
  playing: PublicQueueEntry[];
  waiting: PublicQueueEntry[];
  hutang: PublicQueueEntry[];
  donationAlert: { id: string; donorName: string; amountSen: number; message: string | null; createdAtMs: number } | null;
}

const GRID_COLUMNS = '70px 1fr 60px 80px 60px';

export default function OverlaySlugPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === 'string' ? params.slug : '';
  const [data, setData] = useState<PublicPageData | null>(null);
  const [visibleAlert, setVisibleAlert] = useState<PublicPageData['donationAlert']>(null);
  const lastAlertId = useRef<string | null>(null);
  const initialized = useRef(false);

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await publicFetch<PublicPageData>(`/api/public/${encodeURIComponent(slug)}`);
      setData(res);
      if (!initialized.current) {
        initialized.current = true;
        lastAlertId.current = res.donationAlert?.id ?? null;
      } else if (res.donationAlert && res.donationAlert.id !== lastAlertId.current) {
        lastAlertId.current = res.donationAlert.id;
        setVisibleAlert(res.donationAlert);
        window.setTimeout(() => setVisibleAlert((current) => current?.id === res.donationAlert?.id ? null : current), 8000);
      }
    } catch {
      // Keep the last good frame rather than flashing an error on stream.
    }
  }, [slug]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  if (!data) return null;

  const { playing, waiting, game } = data;
  if (playing.length === 0 && waiting.length === 0 && !visibleAlert) return null;

  const maxSlots = game.slotCount;
  const nextTurn = waiting.slice(0, maxSlots);
  const remaining = waiting.slice(maxSlots, maxSlots + MAX_QUEUE_ROWS);

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
      {visibleAlert && (
        <div style={{ marginBottom: '12px', borderRadius: '14px', border: '1px solid rgba(37,99,235,.28)', background: 'rgba(255,255,255,.97)', padding: '16px 18px', boxShadow: '0 12px 35px rgba(15,23,42,.18)', animation: 'fadeSlideIn .22s ease-out' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: '#2563eb', letterSpacing: '.12em', textTransform: 'uppercase' }}>New donation</div>
          <div style={{ marginTop: '5px', fontSize: '19px', fontWeight: 800, color: '#0f172a' }}>{visibleAlert.donorName} · RM{(visibleAlert.amountSen / 100).toFixed(2)}</div>
          {visibleAlert.message && <div style={{ marginTop: '5px', fontSize: '13px', lineHeight: 1.45, color: '#475569' }}>{visibleAlert.message}</div>}
        </div>
      )}
      {(playing.length > 0 || waiting.length > 0) && <div
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
            gridTemplateColumns: GRID_COLUMNS,
            background: '#d0d0d0',
            borderBottom: '2px solid #aaaaaa',
            padding: '4px 0',
          }}
        >
          {['', 'Nickname', 'Jumlah Game', 'Waktu Order', 'Baki Game'].map((h, i) => (
            <div
              key={i}
              style={{
                textAlign: i === 0 || i >= 2 ? 'center' : 'left',
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

        {playing.length > 0 && (
          <>
            <SectionDivider label="IN GAME" color="#22c55e" />
            {playing.map((entry, i) => (
              <PlayerRow
                key={entry.entryId}
                entry={entry}
                rowBg={i % 2 === 0 ? '#f0fdf4' : '#dcfce7'}
                statusBg="#22c55e"
                labelCol={i === 0 ? 'IN GAME' : ''}
              />
            ))}
          </>
        )}

        {nextTurn.length > 0 && (
          <>
            <SectionDivider label="NEXT TURN" color="#f97316" />
            {nextTurn.map((entry, i) => (
              <PlayerRow
                key={entry.entryId}
                entry={entry}
                rowBg={i % 2 === 0 ? '#fff7ed' : '#ffedd5'}
                statusBg="#f97316"
                labelCol={i === 0 ? 'NEXT TURN' : ''}
              />
            ))}
          </>
        )}

        {remaining.length > 0 && (
          <>
            <SectionDivider label="QUE" color="#6366f1" />
            {remaining.map((entry, i) => (
              <PlayerRow
                key={entry.entryId}
                entry={entry}
                rowBg={i % 2 === 0 ? '#f5f3ff' : '#ede9fe'}
                statusBg="#6366f1"
                labelCol={i === 0 ? 'QUE' : ''}
              />
            ))}
          </>
        )}

        {waiting.length > maxSlots + MAX_QUEUE_ROWS && (
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
            +{waiting.length - maxSlots - MAX_QUEUE_ROWS} more in queue
          </div>
        )}
      </div>}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionDivider({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ background: color, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
  entry: PublicQueueEntry;
  rowBg: string;
  statusBg: string;
  labelCol: string;
}

function PlayerRow({ entry, rowBg, statusBg, labelCol }: RowProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: GRID_COLUMNS,
        background: rowBg,
        borderBottom: '1px solid #e5e5e5',
        alignItems: 'center',
        minHeight: '30px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}>
        {labelCol && (
          <span
            style={{
              background: statusBg,
              color: '#ffffff',
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
        )}
      </div>

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
          {entry.ign}
        </span>
      </div>

      <div style={{ padding: '4px 6px', textAlign: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#333333' }}>{entry.totalGames}</span>
      </div>

      <div style={{ padding: '4px 6px', textAlign: 'center' }}>
        {entry.orderDate ? (
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
            {entry.orderDate}
          </span>
        ) : (
          <span style={{ color: '#cccccc', fontSize: '11px' }}>—</span>
        )}
      </div>

      <div style={{ padding: '4px 6px', textAlign: 'center' }}>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 900,
            color: entry.gamesLeft <= 1 ? '#ef4444' : entry.gamesLeft <= 3 ? '#f97316' : '#16a34a',
          }}
        >
          {entry.gamesLeft}
        </span>
      </div>
    </div>
  );
}
