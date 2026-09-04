'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../../lib/auth';
import { apiFetch, ApiError } from '../../../../lib/api-client';
import {
  statusCopy,
  type StripeAccountStatus,
} from '../../../../lib/domain/stripe-account-status';

interface StatusResponse {
  status: StripeAccountStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

/**
 * Landing page for Stripe's onboarding `return_url`.
 *
 * Reaching this page proves only that the browser was redirected here — it is
 * not evidence that onboarding succeeded. So the page immediately asks the
 * server to re-read the account from Stripe and reports whatever Stripe says,
 * which may well be "still incomplete".
 */
export default function OnboardingReturnPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [result, setResult] = useState<StatusResponse | null>(null);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await apiFetch<StatusResponse>('/api/stripe/connect/status');
        if (!cancelled) setResult(res);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not check your Stripe status.');
        }
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  if (authLoading || syncing) {
    return (
      <div className="min-h-screen bg-[#07070f] flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Checking your Stripe account...</p>
      </div>
    );
  }

  const copy = result ? statusCopy(result.status, result.payoutsEnabled) : null;
  const done = result?.status === 'active';

  return (
    <div className="min-h-screen bg-[#07070f] text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-[#0f0f1a] border border-white/5 rounded-2xl p-6 text-center">
        {error ? (
          <>
            <h1 className="text-lg font-bold">Couldn&apos;t confirm your status</h1>
            <p className="text-gray-500 text-sm mt-2">{error}</p>
          </>
        ) : (
          <>
            <div
              className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-xl font-black ${
                done ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
              }`}
            >
              {done ? '✓' : '!'}
            </div>
            <h1 className="text-lg font-bold mt-4">{copy?.label}</h1>
            <p className="text-gray-500 text-sm mt-2">{copy?.detail}</p>

            {result && (
              <div className="mt-5 pt-5 border-t border-white/5 space-y-2 text-sm text-left">
                {([
                  ['Details submitted', result.detailsSubmitted],
                  ['Payments', result.chargesEnabled],
                  ['Payouts', result.payoutsEnabled],
                ] as const).map(([label, on]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-gray-500">{label}</span>
                    <span className={on ? 'text-emerald-400 font-semibold' : 'text-gray-400'}>
                      {on ? 'Enabled' : 'Pending'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <Link
          href="/dashboard/payments?synced=1"
          className="inline-block w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-3 rounded-xl transition-colors text-sm mt-6"
        >
          Back to payments
        </Link>
      </div>
    </div>
  );
}
