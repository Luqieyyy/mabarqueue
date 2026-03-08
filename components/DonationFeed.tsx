'use client';

import type { Timestamp } from 'firebase/firestore';

export interface Donation {
  id: string;
  donorName: string;
  amount: number;
  ign: string;
  gamesAdded: number;
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
  donations: Donation[];
}

export default function DonationFeed({ donations }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 flex flex-col">
      <h2 className="text-sm font-bold text-gray-700 uppercase tracking-widest mb-4">
        Recent Donations
      </h2>

      {donations.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-8">
          <p className="text-gray-400 text-sm italic">No donations yet</p>
        </div>
      ) : (
        <div className="space-y-2 overflow-y-auto max-h-64">
          {donations.map((d) => (
            <div
              key={d.id}
              className="flex items-start justify-between bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 animate-fade-slide-in"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-gray-900 text-sm font-semibold truncate">{d.donorName}</p>
                  <span className="text-emerald-600 text-xs font-bold shrink-0 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                    +RM{d.amount}
                  </span>
                </div>
                <p className="text-gray-500 text-xs mt-0.5">
                  IGN: <span className="text-indigo-600 font-semibold">{d.ign}</span>
                  <span className="text-gray-300 mx-1">·</span>
                  {d.gamesAdded} game{d.gamesAdded !== 1 ? 's' : ''} added
                </p>
              </div>
              <span className="text-gray-400 text-xs shrink-0 ml-2 mt-0.5">{timeAgo(d.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
