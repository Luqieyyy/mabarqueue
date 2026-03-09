'use client';

import type { Timestamp } from 'firebase/firestore';

export interface AlbumEntry {
  id: string;
  donorName: string;
  gameId: string;
  ign: string;
  amount: number;
  message?: string;
  timestamp: Timestamp | null;
}

function timeAgo(ts: Timestamp | null): string {
  if (!ts) return '';
  const secs = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

interface Props {
  entries: AlbumEntry[];
}

export default function CommentAlbumFeed({ entries }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xs font-bold text-gray-700 uppercase tracking-widest">Comment Album</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">Komen gambar dari penyokong</p>
        </div>
        <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
          {entries.length} komen
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <p className="text-sm text-gray-400 italic">Tiada komen album lagi</p>
          <p className="text-[11px] text-gray-300">Format: ALBUM: [GameID] [IGN]</p>
        </div>
      ) : (
        <div className="space-y-2 overflow-y-auto max-h-64">
          {entries.map((e) => (
            <div
              key={e.id}
              className="flex items-start justify-between bg-purple-50 border border-purple-100 rounded-xl px-3 py-2.5 animate-fade-slide-in"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900 truncate">{e.donorName}</p>
                  <span className="text-purple-600 text-xs font-bold shrink-0 bg-purple-100 border border-purple-200 px-1.5 py-0.5 rounded-full">
                    +RM{e.amount}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-[11px] text-gray-500">
                    Game ID: <span className="font-mono font-bold text-purple-700">{e.gameId}</span>
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="text-[11px] text-gray-500">
                    IGN: <span className="font-semibold text-purple-600">{e.ign}</span>
                  </span>
                </div>
              </div>
              <span className="text-gray-400 text-[11px] shrink-0 ml-2 mt-0.5">{timeAgo(e.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
