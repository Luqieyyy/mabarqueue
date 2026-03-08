'use client';

import type { GamePlayer } from '../lib/queue';

interface Props {
  players: GamePlayer[];
  onIncrease?: (id: string) => void;
  onDecrease?: (id: string) => void;
  onRemove?: (id: string) => void;
  onSkip?: (id: string) => void;
}

export default function QueueList({ players, onIncrease, onDecrease, onRemove, onSkip }: Props) {
  const isDashboard = !!(onIncrease || onDecrease || onRemove || onSkip);

  if (players.length === 0) {
    return (
      <div className="flex items-center justify-center py-10">
        <p className="text-sm text-gray-400 italic">Queue is empty</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-gray-200">
            <th className="text-left text-[10px] font-extrabold text-gray-400 uppercase tracking-wider pb-2 pr-3 w-7">#</th>
            <th className="text-left text-[10px] font-extrabold text-gray-400 uppercase tracking-wider pb-2 pr-3">Nickname</th>
            <th className="text-center text-[10px] font-extrabold text-gray-400 uppercase tracking-wider pb-2 pr-3 whitespace-nowrap">Jumlah Game</th>
            <th className="text-center text-[10px] font-extrabold text-gray-400 uppercase tracking-wider pb-2 pr-3 whitespace-nowrap">Waktu Order</th>
            <th className="text-center text-[10px] font-extrabold text-gray-400 uppercase tracking-wider pb-2 pr-3 whitespace-nowrap">Baki Game</th>
            {isDashboard && (
              <th className="text-right text-[10px] font-extrabold text-gray-400 uppercase tracking-wider pb-2 whitespace-nowrap">Actions</th>
            )}
          </tr>
        </thead>
        <tbody>
          {players.map((player, index) => (
            <tr
              key={player.id}
              className="border-b border-gray-100 hover:bg-indigo-50/40 transition-colors animate-fade-slide-in group"
            >
              <td className="py-2.5 pr-3 text-gray-400 font-mono text-xs">{index + 1}.</td>

              <td className="py-2.5 pr-3">
                <p className="font-semibold text-gray-900 truncate max-w-[150px]">{player.ign}</p>
                {player.username !== player.ign && (
                  <p className="text-[11px] text-gray-400 truncate max-w-[150px]">{player.username}</p>
                )}
              </td>

              <td className="py-2.5 pr-3 text-center">
                <span className="font-bold text-gray-700">{player.totalGames}</span>
              </td>

              <td className="py-2.5 pr-3 text-center">
                {player.orderDate ? (
                  <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                    {player.orderDate}
                  </span>
                ) : (
                  <span className="text-gray-300 text-xs">—</span>
                )}
              </td>

              <td className="py-2.5 pr-3 text-center">
                <span
                  className={`font-bold text-base tabular-nums ${
                    player.gamesLeft <= 1
                      ? 'text-red-500'
                      : player.gamesLeft <= 3
                      ? 'text-amber-500'
                      : 'text-indigo-600'
                  }`}
                >
                  {player.gamesLeft}
                </span>
              </td>

              {isDashboard && (
                <td className="py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {onIncrease && (
                      <button
                        onClick={() => onIncrease(player.id)}
                        title="Add 1 game"
                        className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all text-sm font-bold"
                      >
                        +
                      </button>
                    )}
                    {onDecrease && (
                      <button
                        onClick={() => onDecrease(player.id)}
                        title="Remove 1 game"
                        className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all text-sm font-bold"
                      >
                        −
                      </button>
                    )}
                    {onSkip && (
                      <button
                        onClick={() => onSkip(player.id)}
                        title="Move to Hutang Game"
                        className="text-[11px] bg-amber-100 hover:bg-amber-200 border border-amber-200 text-amber-700 font-semibold px-2 py-0.5 rounded-lg transition-all whitespace-nowrap"
                      >
                        Hutang
                      </button>
                    )}
                    {onRemove && (
                      <button
                        onClick={() => onRemove(player.id)}
                        title="Remove player"
                        className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all text-lg"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
