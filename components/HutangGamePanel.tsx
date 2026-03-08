'use client';

import type { GamePlayer } from '../lib/queue';

interface Props {
  players: GamePlayer[];
  loading: boolean;
  onSettle: (id: string) => void;    // move back to queue
  onRemove: (id: string) => void;    // delete completely
  onIncrease: (id: string) => void;
  onDecrease: (id: string) => void;
}

export default function HutangGamePanel({
  players,
  loading,
  onSettle,
  onRemove,
  onIncrease,
  onDecrease,
}: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-amber-400 rounded-full" />
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-widest">
            Hutang Game
          </h2>
        </div>
        <span className="text-xs text-gray-400 font-mono">{players.length} pending</span>
      </div>

      {players.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <p className="text-sm text-gray-400 italic">No hutang — clear queue!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {players.map((player) => (
            <div
              key={player.id}
              className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 animate-fade-slide-in"
            >
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-sm truncate">{player.ign}</p>
                <p className="text-xs text-amber-600 font-medium">
                  {player.gamesLeft} game{player.gamesLeft !== 1 ? 's' : ''} owed
                  {player.orderDate && (
                    <span className="text-gray-400 font-normal ml-1.5">· {player.orderDate}</span>
                  )}
                </p>
              </div>

              {/* Adjust games */}
              <button
                onClick={() => onIncrease(player.id)}
                disabled={loading}
                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all text-sm font-bold disabled:opacity-30"
              >
                +
              </button>
              <button
                onClick={() => onDecrease(player.id)}
                disabled={loading}
                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-amber-600 hover:bg-amber-100 rounded-lg transition-all text-sm font-bold disabled:opacity-30"
              >
                −
              </button>

              {/* Back to queue */}
              <button
                onClick={() => onSettle(player.id)}
                disabled={loading}
                title="Move back to queue"
                className="text-xs bg-indigo-100 hover:bg-indigo-200 border border-indigo-200 text-indigo-700 font-semibold px-2.5 py-1 rounded-lg transition-all disabled:opacity-30 shrink-0 whitespace-nowrap"
              >
                Queue
              </button>

              {/* Remove */}
              <button
                onClick={() => onRemove(player.id)}
                disabled={loading}
                title="Remove from hutang"
                className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all text-lg disabled:opacity-30 shrink-0"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {players.length > 0 && (
        <p className="text-[11px] text-gray-400 mt-3 text-center leading-relaxed">
          Viewers skipped without game deduction.{' '}
          <strong className="text-indigo-600">Queue</strong> = masuk semula ke waiting list.
        </p>
      )}
    </div>
  );
}
