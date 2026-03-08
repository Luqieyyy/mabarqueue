'use client';

import { useState } from 'react';
import type { GamePlayer } from '../lib/queue';

interface Props {
  currentPlayers: GamePlayer[];
  queue: GamePlayer[];
}

export default function OverlayPreview({ currentPlayers, queue }: Props) {
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    const url =
      typeof window !== 'undefined' ? `${window.location.origin}/overlay` : '/overlay';
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-widest">
          OBS Overlay Preview
        </h2>
        <button
          onClick={copyLink}
          className="text-xs bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-600 font-semibold px-3 py-1.5 rounded-lg transition-all"
        >
          {copied ? '✓ Copied!' : 'Copy OBS Link'}
        </button>
      </div>

      {/* Mini preview */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 overflow-hidden text-xs">
        {currentPlayers.length === 0 && queue.length === 0 ? (
          <p className="text-gray-400 text-center py-4 text-[11px] italic">
            Queue empty — overlay hidden
          </p>
        ) : (
          <div className="space-y-2">
            {/* IN GAME */}
            {currentPlayers.length > 0 && (
              <div>
                <div className="bg-green-500 text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-sm mb-1 inline-block">
                  IN GAME
                </div>
                {currentPlayers.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 py-0.5 px-2 bg-green-50 border-l-2 border-green-400 mb-0.5">
                    <span className="font-bold text-gray-800 text-[11px] flex-1 truncate">{p.ign}</span>
                    <span className="text-gray-500 text-[10px]">{p.totalGames}</span>
                    <span className="text-gray-400 text-[10px]">{p.orderDate || '—'}</span>
                    <span className="text-green-600 font-mono font-bold text-[10px]">{p.gamesLeft}</span>
                  </div>
                ))}
              </div>
            )}

            {/* NEXT TURN */}
            {queue.length > 0 && (
              <div>
                <div className="bg-orange-500 text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-sm mb-1 inline-block">
                  NEXT TURN
                </div>
                {queue.slice(0, 2).map((p) => (
                  <div key={p.id} className="flex items-center gap-2 py-0.5 px-2 bg-orange-50 border-l-2 border-orange-400 mb-0.5">
                    <span className="font-semibold text-gray-700 text-[11px] flex-1 truncate">{p.ign}</span>
                    <span className="text-orange-600 font-mono font-bold text-[10px]">{p.gamesLeft}</span>
                  </div>
                ))}
                {queue.length > 2 && (
                  <p className="text-gray-400 text-[9px] pl-2">+{queue.length - 2} more in queue</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-gray-400 text-[11px] mt-2.5">
        OBS → Browser Source · Width: <strong className="text-gray-600">500</strong> · Height:{' '}
        <strong className="text-gray-600">600</strong> · Allow transparency: ✓
      </p>
    </div>
  );
}
