'use client';

import type { GamePlayer } from '../lib/queue';
import { MAX_GAME_SLOTS } from '../lib/queue';

interface Props {
  players: GamePlayer[];
  loading: boolean;
  onFinishGame: () => void;
  onSkip: (id: string) => void;
  onMoveToQueue: (id: string) => void;
  onRemove: (id: string) => void;
  onIncrease: (id: string) => void;
  onDecrease: (id: string) => void;
}

export default function CurrentPlayerPanel({
  players,
  loading,
  onFinishGame,
  onSkip,
  onMoveToQueue,
  onRemove,
  onIncrease,
  onDecrease,
}: Props) {
  const emptySlots = MAX_GAME_SLOTS - players.length;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <h2 className="text-xs font-bold text-gray-700 uppercase tracking-widest">In Game</h2>
        </div>
        <span className="text-xs text-gray-400 font-mono">
          {players.length}/{MAX_GAME_SLOTS} viewers
        </span>
      </div>

      {/* Player slots */}
      <div className="space-y-2">
        {players.map((player) => (
          <div
            key={player.id}
            className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 animate-fade-slide-in"
          >
            {/* Top row: IGN + adjust */}
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-sm truncate">{player.ign}</p>
                <p className="text-xs text-emerald-600 font-medium">
                  {player.gamesLeft} game{player.gamesLeft !== 1 ? 's' : ''} left
                  {player.orderDate && (
                    <span className="text-gray-400 font-normal ml-1.5">· {player.orderDate}</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => onIncrease(player.id)}
                disabled={loading}
                title="Add 1 game"
                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-emerald-600 hover:bg-emerald-100 rounded-lg transition-all text-sm font-bold disabled:opacity-30"
              >+</button>
              <button
                onClick={() => onDecrease(player.id)}
                disabled={loading}
                title="Remove 1 game"
                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-amber-600 hover:bg-amber-100 rounded-lg transition-all text-sm font-bold disabled:opacity-30"
              >−</button>
              <button
                onClick={() => onRemove(player.id)}
                disabled={loading}
                title="Remove player"
                className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all text-lg disabled:opacity-30"
              >×</button>
            </div>

            {/* Bottom row: action buttons */}
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-emerald-100">
              <button
                onClick={() => onSkip(player.id)}
                disabled={loading}
                title="Hutang — player goes to Hutang list, no game deducted"
                className="flex-1 text-xs bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-700 font-semibold py-1.5 rounded-lg transition-all disabled:opacity-30"
              >
                Hutang
              </button>
              <button
                onClick={() => onMoveToQueue(player.id)}
                disabled={loading}
                title="Queue — move player back to Waiting Queue"
                className="flex-1 text-xs bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-600 font-semibold py-1.5 rounded-lg transition-all disabled:opacity-30"
              >
                Queue
              </button>
            </div>
          </div>
        ))}

        {/* Empty slots */}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="flex items-center justify-center bg-gray-50 border border-dashed border-gray-200 rounded-xl px-3 py-3"
          >
            <p className="text-xs text-gray-300 italic">Empty slot</p>
          </div>
        ))}
      </div>

      {/* Finish Game */}
      <button
        onClick={onFinishGame}
        disabled={players.length === 0 || loading}
        className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-sm transition-all"
      >
        {loading ? 'Processing…' : `✓ Finish Game  (−1 from all ${players.length} viewer${players.length !== 1 ? 's' : ''})`}
      </button>

      <p className="text-center text-[11px] text-gray-400">
        <span className="text-amber-600 font-semibold">Hutang</span> = no deduction, kena bayar balik ·{' '}
        <span className="text-indigo-600 font-semibold">Queue</span> = balik waiting list ·{' '}
        <span className="text-indigo-700 font-semibold">Finish</span> = −1 semua
      </p>
    </div>
  );
}
