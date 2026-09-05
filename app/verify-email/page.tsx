'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { reload, sendEmailVerification, signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import { authErrorMessage } from '../../lib/auth-errors';
import AuthCard, { authButtonClass } from '../../components/AuthCard';

export default function VerifyEmailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const started = useRef(false);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function send() {
    if (!user || busy.current) return;
    busy.current = true; setPending(true); setError('');
    try {
      await sendEmailVerification(user, { url: `${window.location.origin}/verify-email` });
      try { sessionStorage.setItem(`verification:${user.uid}`, String(Date.now())); } catch { /* Storage may be unavailable. */ }
      setCooldown(60);
      setMessage('Verification email sent. Open the link in your inbox, then continue below.');
    } catch (err) { setError(authErrorMessage(err)); }
    finally { busy.current = false; setPending(false); }
  }

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.emailVerified) { router.replace('/onboarding'); return; }
    if (started.current) return;
    started.current = true;
    let lastSent = 0;
    try { lastSent = Number(sessionStorage.getItem(`verification:${user.uid}`) || 0); } catch { /* No persisted cooldown. */ }
    const remaining = Math.max(0, Math.ceil((lastSent + 60000 - Date.now()) / 1000));
    if (remaining) { setCooldown(remaining); setMessage('Open the verification link from your latest email, then continue below.'); }
    else { void send(); }
    // Sending is intentionally once per visit; explicit retries are available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, router]);

  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function check() {
    if (!user || busy.current) return;
    busy.current = true; setPending(true); setError('');
    try {
      await reload(user);
      if (!user.emailVerified) { setError('Your email is not verified yet. Open the link in the email first.'); return; }
      await user.getIdToken(true);
      router.replace('/onboarding');
    } catch (err) { setError(authErrorMessage(err)); }
    finally { busy.current = false; setPending(false); }
  }

  return <AuthCard title="Confirm your email" subtitle="Step 2 of 3 · Verify your account">
    <p className="text-sm text-slate-500">Your account email</p>
    <p className="font-semibold break-all mt-1 mb-5">{user?.email || 'Loading…'}</p>
    {message && <p role="status" className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700 mb-4">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-300 mb-4">{error}</p>}
    <p className="text-sm text-slate-500 mb-6">If the message hasn’t arrived, check your spam folder. If you opened it on another device, sign in here and continue.</p>
    <button disabled={pending || !user} onClick={check} className={authButtonClass}>{pending ? 'Please wait…' : 'I’ve verified my email'}</button>
    <button disabled={pending || !user || cooldown > 0} onClick={send} className="w-full py-3 mt-3 text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50">{cooldown ? `Resend in ${cooldown}s` : 'Resend verification email'}</button>
    <button disabled={pending} onClick={async () => { try { await signOut(auth); router.replace('/register'); } catch (err) { setError(authErrorMessage(err)); } }} className="w-full mt-3 text-sm text-slate-500 underline">Use a different account</button>
  </AuthCard>;
}
