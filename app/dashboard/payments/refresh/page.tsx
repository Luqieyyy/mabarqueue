'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../../lib/auth';
import { apiFetch, ApiError } from '../../../../lib/api-client';

/**
 * Landing page for Stripe's onboarding `refresh_url`.
 *
 * Stripe sends the streamer here when an Account Link has expired or is
 * revisited — Account Links are single-use and short-lived, so without this
 * an expired link would be a dead end.
 *
 * This is a page rather than an API route because Stripe opens the refresh
 * URL as an ordinary browser navigation, which carries no `Authorization`
 * header. Running it client-side lets the browser's existing Firebase session
 * mint an ID token, so the request that actually creates the new link is
 * still authenticated and workspace-scoped server-side.
 *
 * Minting a new link reuses the existing connected account, so bouncing
 * through here repeatedly never creates duplicate Stripe accounts.
 */
export default function OnboardingRefreshPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await apiFetch<{ url: string }>('/api/stripe/connect/onboard', {
          method: 'POST',
        });
        if (!cancelled) window.location.href = res.url;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not restart Stripe onboarding.');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#07070f] text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-[#0f0f1a] border border-white/5 rounded-2xl p-6 text-center">
          <h1 className="text-lg font-bold">Couldn&apos;t restart onboarding</h1>
          <p className="text-gray-500 text-sm mt-2">{error}</p>
          <Link
            href="/dashboard/payments"
            className="inline-block w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-3 rounded-xl transition-colors text-sm mt-6"
          >
            Back to payments
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07070f] flex flex-col items-center justify-center gap-4">
      <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-gray-500 text-sm">Reopening Stripe onboarding...</p>
    </div>
  );
}
