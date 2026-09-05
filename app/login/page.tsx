'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleAuthProvider, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, type User } from 'firebase/auth';
import Link from 'next/link';
import { auth } from '../../lib/firebase';
import { apiFetch, ApiError } from '../../lib/api-client';
import { authErrorMessage } from '../../lib/auth-errors';
import AuthCard, { authButtonClass, authInputClass } from '../../components/AuthCard';

async function routeAfterLogin(user: User, push: (path: string) => void) {
  const token = await user.getIdTokenResult(true);
  if (token.claims.admin === true || token.claims.role === 'admin') {
    push('/admin');
    return;
  }
  try {
    await apiFetch('/api/streamers');
    push('/dashboard');
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err;
    push(user.emailVerified ? '/onboarding' : '/verify-email');
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading || googleLoading) return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);
      await routeAfterLogin(result.user, router.push);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    if (loading || googleLoading) return;
    setGoogleLoading(true);
    setError('');
    setNotice('');
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      await routeAfterLogin(result.user, router.push);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : authErrorMessage(err));
    } finally {
      setGoogleLoading(false);
    }
  }

  async function resetPassword() {
    if (loading || googleLoading) return;
    if (!/^[^s@]+@[^s@]+.[^s@]+$/.test(email.trim())) {
      setError('Enter your account email above to reset your password.');
      return;
    }
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setNotice('If this email has an account, password reset instructions are on their way.');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your creator workspace"
      footer={<>New to MabarQueue? <Link href="/register" className="font-medium text-blue-600 hover:text-blue-700">Create an account</Link></>}
    >
      {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm text-blue-700">{notice}</p>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          Email
          <input id="email" autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required className={`${authInputClass} mt-2`} />
        </label>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">
          Password
          <input id="password" autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required className={`${authInputClass} mt-2`} />
        </label>
        <div className="flex justify-end">
          <button type="button" disabled={loading || googleLoading} onClick={resetPassword} className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50">Forgot password?</button>
        </div>
        <button type="submit" disabled={loading || googleLoading} className={authButtonClass}>{loading ? 'Signing in…' : 'Sign in'}</button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" /></div>
      <button type="button" onClick={handleGoogle} disabled={loading || googleLoading} className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50">
        {googleLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" /> : <GoogleIcon />}
        {googleLoading ? 'Connecting…' : 'Continue with Google'}
      </button>
    </AuthCard>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09A6.5 6.5 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1C7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
