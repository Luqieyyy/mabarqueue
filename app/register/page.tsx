'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, validatePassword } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import { authErrorMessage } from '../../lib/auth-errors';
import AuthCard, { authButtonClass, authInputClass } from '../../components/AuthCard';

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const busy = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const mismatch = confirm.length > 0 && password !== confirm;

  useEffect(() => {
    if (user && !busy.current) router.replace('/onboarding');
  }, [user, router]);

  async function submit(google = false) {
    if (busy.current) return;
    busy.current = true; setSubmitting(true); setError('');
    try {
      if (google) {
        await signInWithPopup(auth, new GoogleAuthProvider());
      } else {
        if (password.length < 8 || password !== confirm) {
          setError('Use at least 8 characters and make sure both passwords match.'); return;
        }
        const policy = await validatePassword(auth, password);
        if (!policy.isValid) { setError('Use a password that meets the configured security policy (length, uppercase, lowercase, number and symbol requirements).'); return; }
        await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
        setPassword(''); setConfirm('');
      }
      router.replace('/onboarding');
    } catch (err) { setError(authErrorMessage(err)); }
    finally { busy.current = false; setSubmitting(false); }
  }

  return <AuthCard title="Create your creator account" subtitle="Step 1 of 3 · Account details" footer={<>Already registered? <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">Sign in</Link></>}>
    {error && <p role="alert" className="text-red-300 text-sm mb-4">{error}</p>}
    <button type="button" disabled={loading || submitting || Boolean(user)} onClick={() => submit(true)} className="w-full rounded-lg border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50">Continue with Google</button>
    <div className="flex items-center gap-3 my-5 text-slate-400 text-xs"><span className="h-px bg-slate-200 flex-1" />or use email<span className="h-px bg-slate-200 flex-1" /></div>
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
      <label className="block text-sm font-medium text-slate-700">Email<input type="email" required autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} className={`${authInputClass} mt-2`} /></label>
      <label className="block text-sm font-medium text-slate-700">Password<input type={visible ? 'text' : 'password'} required minLength={8} autoComplete="new-password" aria-describedby="password-hint" value={password} onChange={(e) => setPassword(e.target.value)} className={`${authInputClass} mt-2`} /></label>
      <p id="password-hint" className="text-xs text-slate-500">Use at least 8 characters. A longer, unique password is best.</p>
      <label className="block text-sm font-medium text-slate-700">Confirm password<input type={visible ? 'text' : 'password'} required minLength={8} autoComplete="new-password" aria-invalid={mismatch} aria-describedby={mismatch ? 'password-mismatch' : undefined} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={`${authInputClass} mt-2`} /></label>
      {mismatch && <p id="password-mismatch" className="text-sm text-amber-300">Passwords do not match yet.</p>}
      <label className="flex items-center gap-2 text-sm text-slate-500"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="accent-blue-600" />Show passwords</label>
      <button disabled={loading || submitting || Boolean(user) || mismatch} className={authButtonClass}>{submitting ? 'Creating account…' : 'Create creator account'}</button>
    </form>
    <p className="text-xs text-slate-500 mt-5">Next, confirm your email and choose the name viewers will see.</p>
  </AuthCard>;
}
