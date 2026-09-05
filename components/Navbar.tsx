'use client';

import { useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { auth } from '../lib/firebase';

interface Props {
  userName?: string;
  onSettings?: () => void;
  active?: 'dashboard' | 'payments';
}

export default function Navbar({ userName, onSettings, active = 'dashboard' }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');

  // Explicit state + a document listener, rather than <details>/onBlur:
  // Safari doesn't focus a <button> on click (only Chrome/Firefox do), so a
  // blur-based close race would fire before the button's own onClick ran,
  // silently swallowing every click inside the menu. mousedown + a real
  // "did the click land outside" check has no such race, in any browser.
  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true); setError('');
    try { await signOut(auth); router.push('/login'); }
    catch { setError('Could not sign out. Please try again.'); setSigningOut(false); }
  }

  const linkClass = 'rounded-lg px-2 py-2.5 text-xs sm:px-3 sm:text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <nav aria-label="Dashboard navigation" className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-2 px-4 md:px-6">
        <Link href="/" aria-label="MabarQueue home" className="flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
          <Image src="/mabarqueue.png" alt="" width={36} height={36} className="h-9 w-9 rounded-xl object-cover" />
          <span className="hidden text-sm font-bold tracking-tight text-slate-900 sm:block">MabarQueue</span>
        </Link>

        <div className="flex items-center gap-1 sm:ml-6 sm:mr-auto">
          <Link
            href="/dashboard"
            aria-current={active === 'dashboard' ? 'page' : undefined}
            className={`${linkClass} ${active === 'dashboard' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/payments"
            aria-current={active === 'payments' ? 'page' : undefined}
            className={`${linkClass} ${active === 'payments' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
          >
            Payments
          </Link>
        </div>

        <div ref={containerRef} className="relative shrink-0">
          <button
            type="button"
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-2 text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{userName?.charAt(0).toUpperCase() || 'M'}</span>
            <span className="hidden max-w-32 truncate text-sm font-medium md:block">{userName || 'My account'}</span>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="hidden h-4 w-4 sm:block"><path d="m6 8 4 4 4-4" /></svg>
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-full mt-2 w-60 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
              <div className="border-b border-slate-100 px-3 py-3">
                <p className="text-xs text-slate-400">Creator account</p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-900">{userName || 'My account'}</p>
              </div>
              {onSettings && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onSettings(); }}
                  className="mt-1 w-full rounded-lg px-3 py-3 text-left text-sm text-slate-600 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  Webhook settings
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); handleLogout(); }}
                disabled={signingOut}
                className="w-full rounded-lg px-3 py-3 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
              {error && <p role="alert" className="px-3 py-2 text-xs text-red-600">{error}</p>}
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
