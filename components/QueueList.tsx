'use client';

import type { GamePlayer } from '../lib/queue';
import { MAX_GAME_SLOTS } from '../lib/queue';

interface Props {
  players: GamePlayer[];
  currentCount: number; // number of players currently in-game (to know if slot is free)
  onIncrease?: (id: string) => void;
  onDecrease?: (id: string) => void;
  onRemove?: (id: string) => void;
  onSkip?: (id: string) => void;
  onPromote?: (id: string) => void;
}

export default function QueueList({
  players,
  currentCount,
  onIncrease,
  onDecrease,
  onRemove,
  onSkip,
  onPromote,
}: Props) {
  const isFull = currentCount >= MAX_GAME_SLOTS;
  const isDashboard = !!(onIncrease || onDecrease || onRemove || onSkip || onPromote);

  if (players.length === 0) {
    return (
      <div className="flex items-center justify-center py-10">
        <p className="text-sm text-gray-400 italic">Queue is empty</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {players.map((player, index) => (
        <div
          key={player.id}
          className="bg-gray-50 border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 rounded-xl px-3 py-2.5 transition-colors animate-fade-slide-in"
        >
          {/* Top row: position + IGN + date + baki */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-gray-400 w-5 shrink-0">{index + 1}.</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">{player.ign}</p>
              {player.username !== player.ign && (
                <p className="text-[11px] text-gray-400 truncate">{player.username}</p>
              )}
            </div>
            {player.orderDate && (
              <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                {player.orderDate}
              </span>
            )}
            <span
              className={`text-base font-bold tabular-nums w-5 text-right shrink-0 ${
                player.gamesLeft <= 1
                  ? 'text-red-500'
                  : player.gamesLeft <= 3
                  ? 'text-amber-500'
                  : 'text-indigo-600'
              }`}
            >
              {player.gamesLeft}
            </span>
          </div>

          {/* Bottom row: actions (dashboard only) */}
          {isDashboard && (
            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
              {/* Adjust games */}
              {onIncrease && (
                <button
                  onClick={() => onIncrease(player.id)}
                  title="Add 1 game"
                  className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all text-sm font-bold"
                >+</button>
              )}
              {onDecrease && (
                <button
                  onClick={() => onDecrease(player.id)}
                  title="Remove 1 game"
                  className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all text-sm font-bold"
                >−</button>
              )}

              <div className="flex-1" />

              {/* Hutang */}
              {onSkip && (
                <button
                  onClick={() => onSkip(player.id)}
                  title="Move to Hutang"
                  className="text-[11px] bg-amber-100 hover:bg-amber-200 border border-amber-200 text-amber-700 font-semibold px-2.5 py-1 rounded-lg transition-all whitespace-nowrap"
                >
                  Hutang
                </button>
              )}

              {/* Promote to In Game */}
              {onPromote && (
                <button
                  onClick={() => !isFull && onPromote(player.id)}
                  title={isFull ? 'Slot penuh — siapkan game dulu' : 'Promote to In Game'}
                  disabled={isFull}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-all whitespace-nowrap border ${
                    isFull
                      ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-emerald-100 hover:bg-emerald-200 border-emerald-200 text-emerald-700'
                  }`}
                >
                  {isFull ? 'Full' : 'In Game →'}
                </button>
              )}

              {/* Remove */}
              {onRemove && (
                <button
                  onClick={() => onRemove(player.id)}
                  title="Remove player"
                  className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all text-lg"
                >×</button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
