'use client';

import type { GamePlayer } from '../lib/queue';

interface Props {
  player: GamePlayer | null;
}

export default function CurrentPlayer({ player }: Props) {
  if (!player) {
    return (
      <div className="bg-gray-100 border border-gray-200 rounded-lg p-6 text-center">
        <p className="text-gray-500 text-sm uppercase tracking-wide">No current player</p>
        <p className="text-gray-400 text-xs mt-1">Queue is empty</p>
      </div>
    );
  }

  return (
    <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-6">
      <p className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-2">
        Now Playing
      </p>
      <p className="text-3xl font-bold text-gray-900">{player.ign}</p>
      <p className="text-emerald-600 mt-2 text-sm">
        {player.gamesLeft} game{player.gamesLeft !== 1 ? 's' : ''} remaining
      </p>
    </div>
  );
}
