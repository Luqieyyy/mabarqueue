'use client';

import { useState } from 'react';

interface Props {
  onAdd: (ign: string, games: number) => Promise<void>;
  loading: boolean;
}

export default function AddPlayerForm({ onAdd, loading }: Props) {
  const [ign, setIgn] = useState('');
  const [games, setGames] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = ign.trim();
    const num = parseInt(games, 10);
    if (!trimmed || !num || num < 1) return;
    await onAdd(trimmed, num);
    setIgn('');
    setGames('');
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
      <h2 className="text-sm font-bold text-gray-700 uppercase tracking-widest mb-4">
        Manual Add Player
      </h2>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          placeholder="Player IGN"
          value={ign}
          onChange={(e) => setIgn(e.target.value)}
          className="w-full bg-gray-50 border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 rounded-xl px-3 py-2.5 text-gray-900 placeholder-gray-400 text-sm outline-none transition-all"
        />
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Games"
            value={games}
            onChange={(e) => setGames(e.target.value)}
            min="1"
            max="99"
            className="flex-1 bg-gray-50 border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 rounded-xl px-3 py-2.5 text-gray-900 placeholder-gray-400 text-sm outline-none transition-all"
          />
          <button
            type="submit"
            disabled={loading || !ign.trim() || !games}
            className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all shadow-sm hover:shadow-md hover:shadow-indigo-200"
          >
            Add
          </button>
        </div>
      </form>
    </div>
  );
}
