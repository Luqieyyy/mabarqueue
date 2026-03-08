'use client';

import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '../lib/firebase';

interface Props {
  userName?: string;
  onSettings?: () => void;
}

export default function Navbar({ userName, onSettings }: Props) {
  const router = useRouter();

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  return (
    <nav className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-5 sticky top-0 z-30 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-xs font-black text-white glow-indigo">
          S
        </div>
        <span className="font-bold text-gray-900 text-sm">SynoQueue</span>
        {userName && (
          <>
            <span className="text-gray-300 text-sm">·</span>
            <span className="text-gray-500 text-sm">{userName}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Link
          href="/queue"
          target="_blank"
          className="text-xs text-gray-500 hover:text-indigo-600 transition-colors hidden sm:block mr-1 font-medium"
        >
          Public Queue ↗
        </Link>

        {onSettings && (
          <button
            onClick={onSettings}
            title="Webhook Settings"
            className="flex items-center gap-1.5 text-xs bg-gray-100 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 text-gray-600 hover:text-indigo-600 px-3 py-1.5 rounded-lg transition-all font-medium"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="hidden sm:block">Webhook</span>
          </button>
        )}

        <button
          onClick={handleLogout}
          className="text-xs bg-gray-100 hover:bg-red-50 hover:border-red-200 border border-gray-200 text-gray-600 hover:text-red-600 px-3 py-1.5 rounded-lg transition-all font-medium"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
