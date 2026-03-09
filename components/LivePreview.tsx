'use client';

import type { GamePlayer } from '../lib/queue';
import type { AlbumEntry } from './CommentAlbumFeed';

interface Props {
  currentPlayers: GamePlayer[];
  queue: GamePlayer[];
  albumEntries: AlbumEntry[];
}

export default function LivePreview({ currentPlayers, queue, albumEntries }: Props) {
  const isEmpty = currentPlayers.length === 0 && queue.length === 0;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <h2 className="text-xs font-bold text-gray-700 uppercase tracking-widest">Live Preview</h2>
          <span className="text-[11px] text-gray-400">— tampilan semasa</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-400 font-mono">
          <span>{currentPlayers.length} in game</span>
          <span>·</span>
          <span>{queue.length} waiting</span>
          {albumEntries.length > 0 && (
            <>
              <span>·</span>
              <span>{albumEntries.length} album</span>
            </>
          )}
        </div>
      </div>

      {isEmpty ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-gray-300 italic">Tiada pemain — queue kosong</p>
        </div>
      ) : (
        <div className="p-5">
          {/* Main grid: IN GAME + QUEUE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* IN GAME */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
                  In Game
                </span>
                <span className="text-[11px] text-gray-400">{currentPlayers.length}/4 slots</span>
              </div>
              <div className="space-y-2">
                {currentPlayers.length === 0 ? (
                  <p className="text-xs text-gray-300 italic py-2">Tiada pemain</p>
                ) : (
                  currentPlayers.map((p, i) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3"
                    >
                      <span className="w-6 h-6 rounded-full bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 text-sm truncate">{p.ign}</p>
                        {p.username !== p.ign && (
                          <p className="text-[11px] text-gray-400 truncate">{p.username}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-black text-emerald-600 tabular-nums leading-none">{p.gamesLeft}</p>
                        <p className="text-[10px] text-gray-400">baki</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* WAITING QUEUE */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="bg-indigo-500 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
                  Waiting
                </span>
                <span className="text-[11px] text-gray-400">{queue.length} orang</span>
              </div>
              {queue.length === 0 ? (
                <p className="text-xs text-gray-300 italic py-2">Queue kosong</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {queue.map((p, i) => (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${
                        i === 0
                          ? 'bg-orange-50 border-orange-200'
                          : 'bg-gray-50 border-gray-100'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
                        i === 0 ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{p.ign}</p>
                      </div>
                      {p.orderDate && (
                        <span className="text-[10px] text-gray-400 shrink-0">{p.orderDate}</span>
                      )}
                      <span className={`text-sm font-bold tabular-nums shrink-0 ${
                        i === 0 ? 'text-orange-500' : 'text-indigo-500'
                      }`}>
                        {p.gamesLeft}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Comment Album section */}
          {albumEntries.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <span className="bg-purple-500 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
                  Comment Album
                </span>
                <span className="text-[11px] text-gray-400">{albumEntries.length} komen terkini</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {albumEntries.slice(0, 8).map((e) => (
                  <div
                    key={e.id}
                    className="bg-purple-50 border border-purple-100 rounded-xl px-3 py-2.5"
                  >
                    <p className="font-mono font-bold text-purple-700 text-xs">{e.gameId}</p>
                    <p className="font-semibold text-gray-800 text-sm truncate">{e.ign}</p>
                    <p className="text-[11px] text-gray-400 truncate">{e.donorName}</p>
                  </div>
                ))}
                {albumEntries.length > 8 && (
                  <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 flex items-center justify-center">
                    <p className="text-xs text-gray-400">+{albumEntries.length - 8} lagi</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
