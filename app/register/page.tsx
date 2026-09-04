'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { emailToUsername } from '../../lib/auth';
import { apiFetch, ApiError } from '../../lib/api-client';
import { DEFAULT_GAME } from '../../lib/games';
import { DEFAULT_TIERS } from '../../lib/settings';
import { normalizeSlug, validateSlug } from '../../lib/domain/ids';

const platforms = ['TikTok Live', 'YouTube Live', 'Twitch', 'Facebook Gaming', 'Other'];
const countries = ['Malaysia', 'Singapore', 'Indonesia', 'Brunei', 'Other'];
const businessTypes = ['Sole proprietorship', 'Company', 'Individual creator'];

const defaultPackages = [
  { title: 'PACKAGE MABAR 1 GAME', price: 4, description: '1 game queue credit', matchCount: 1 },
  { title: 'PACKAGE MABAR 3 GAME', price: 10, description: '3 game queue credits', matchCount: 3 },
  { title: 'PACKAGE MABAR 6 GAME', price: 20, description: '6 game queue credits', matchCount: 6 },
  { title: 'PACKAGE MABAR 10 GAME', price: 30, description: '10 game queue credits', matchCount: 10 },
];

function passwordScore(password: string) {
  return [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
}

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [streamerName, setStreamerName] = useState('');
  const [slugInput, setSlugInput] = useState('');
  const [primaryPlatform, setPrimaryPlatform] = useState(platforms[0]);
  const [channelUrl, setChannelUrl] = useState('');
  const [country, setCountry] = useState(countries[0]);
  const [timezone, setTimezone] = useState('Asia/Kuala_Lumpur');
  const [language, setLanguage] = useState('English / Malay');
  const [businessName, setBusinessName] = useState('LUQIEYYYDEV IT SOLUTION');
  const [businessType, setBusinessType] = useState(businessTypes[0]);
  const [supportEmail, setSupportEmail] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [refundAccepted, setRefundAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const normalizedSlug = normalizeSlug(slugInput || streamerName);
  const slugCheck = validateSlug(normalizedSlug);
  const strength = passwordScore(password);

  const checklist = useMemo(() => ([
    { label: 'Verified creator identity', done: Boolean(fullName.trim() && streamerName.trim()) },
    { label: 'Public queue workspace', done: slugCheck.ok },
    { label: 'Business and support details', done: Boolean(businessName.trim() && supportEmail.trim()) },
    { label: 'Policy acknowledgements', done: termsAccepted && privacyAccepted && refundAccepted },
  ]), [businessName, fullName, privacyAccepted, refundAccepted, slugCheck.ok, streamerName, supportEmail, termsAccepted]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!email.trim()) { setError('Enter your account email.'); return; }
    if (strength < 3) { setError('Use a stronger password with at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (!fullName.trim()) { setError('Enter the account owner name.'); return; }
    if (!streamerName.trim()) { setError('Enter your public streamer name.'); return; }
    if (!slugCheck.ok) { setError(slugCheck.message); return; }
    if (!channelUrl.trim()) { setError('Enter your livestream channel URL.'); return; }
    if (!supportEmail.trim()) { setError('Enter a customer support email.'); return; }
    if (!termsAccepted || !privacyAccepted || !refundAccepted) {
      setError('Accept the required policies before creating the account.');
      return;
    }

    setSubmitting(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const username = emailToUsername(cleanEmail);
      const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const { user } = credential;
      const now = serverTimestamp();

      await updateProfile(user, { displayName: streamerName.trim() });

      await setDoc(doc(db, 'users', username), {
        uid: user.uid,
        authUid: user.uid,
        email: cleanEmail,
        username,
        slug: slugCheck.slug,
        role: 'creator',
        plan: 'creator',
        accountStatus: 'active',
        onboardingStatus: 'registered',
        name: streamerName.trim(),
        displayName: fullName.trim(),
        streamerName: streamerName.trim(),
        supportEmail: supportEmail.trim().toLowerCase(),
        creator: {
          displayName: streamerName.trim(),
          slug: slugCheck.slug,
          primaryPlatform,
          channelUrl: channelUrl.trim(),
          country,
          timezone,
          language,
          activeGame: DEFAULT_GAME,
          queueStatus: 'closed',
          maxQueueSize: 50,
          overlayTheme: 'violet',
          autoAdvanceEnabled: true,
        },
        business: {
          legalName: businessName.trim(),
          type: businessType,
          industry: 'Software as a service',
          website: 'https://mabarqueue.vercel.app',
          productDescription:
            'MabarQueue is a software-as-a-service platform for livestream creators to manage paid play-together gaming sessions and viewer queues.',
        },
        payments: {
          currency: 'MYR',
          provider: 'stripe',
          serviceFeePercent: 5,
          payoutEnabled: false,
          chargesEnabled: false,
          stripeCustomerId: null,
          stripeAccountId: null,
        },
        compliance: {
          termsAcceptedAt: now,
          privacyAcceptedAt: now,
          refundPolicyAcceptedAt: now,
          acceptedVersion: '2026-09-04',
        },
        createdAt: now,
        updatedAt: now,
      });

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        authUid: user.uid,
        email: cleanEmail,
        displayName: fullName.trim(),
        photoURL: user.photoURL ?? null,
        legacyUsername: username,
        primaryStreamerId: null,
        createdAt: now,
        updatedAt: now,
      }, { merge: true });

      await Promise.all([
        setDoc(doc(db, 'users', username, 'settings', 'game'), {
          activeGame: DEFAULT_GAME,
          queueStatus: 'closed',
          maxQueueSize: 50,
          updatedAt: now,
        }, { merge: true }),
        setDoc(doc(db, 'users', username, 'settings', 'rates'), {
          tiers: DEFAULT_TIERS,
          currency: 'MYR',
          updatedAt: now,
        }, { merge: true }),
        setDoc(doc(db, 'users', username, 'settings', 'features'), {
          commentAlbum: false,
          autoAdvance: true,
          viewerCheckout: true,
          updatedAt: now,
        }, { merge: true }),
        ...defaultPackages.map((pkg, index) => setDoc(doc(db, 'users', username, 'packages', pkg.title), {
          ...pkg,
          isActive: true,
          sortOrder: index + 1,
          createdAt: now,
          updatedAt: now,
        }, { merge: true })),
      ]);

      try {
        await apiFetch('/api/streamers', {
          method: 'POST',
          body: { displayName: streamerName.trim(), slug: slugCheck.slug },
        });
      } catch (err) {
        if (err instanceof ApiError && err.status !== 409) throw err;
      }

      router.push('/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create the account.';
      setError(message.replace('Firebase: ', '').replace(/\s*\(auth\/.*\)\.?$/, '.'));
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#08080e] text-white px-4 py-10">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-violet-600/20 to-transparent" />
      </div>

      <main className="relative z-10 max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 bg-violet-600 rounded-lg flex items-center justify-center text-sm font-black shadow-lg shadow-violet-600/20">
              M
            </div>
            <span className="font-bold tracking-tight">MabarQueue</span>
          </Link>
          <Link href="/login" className="text-sm text-gray-400 hover:text-white transition-colors">
            Sign in
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr] items-start">
          <aside className="bg-[#0f0f1a] border border-white/5 rounded-2xl p-6 lg:sticky lg:top-6">
            <p className="text-xs font-black text-violet-400 uppercase tracking-widest mb-3">Creator onboarding</p>
            <h1 className="text-3xl md:text-5xl font-black leading-tight">
              Create your MabarQueue account.
            </h1>
            <p className="text-gray-500 text-sm leading-relaxed mt-4">
              Set up identity, workspace, support details, default packages and policy acceptance in one controlled flow.
            </p>

            <div className="mt-8 space-y-3">
              {checklist.map((item) => (
                <div key={item.label} className="flex items-center gap-3 text-sm">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                    item.done ? 'bg-emerald-500 text-black' : 'bg-white/5 text-gray-500 border border-white/10'
                  }`}>
                    {item.done ? 'OK' : ''}
                  </span>
                  <span className={item.done ? 'text-gray-200' : 'text-gray-500'}>{item.label}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-xl border border-violet-500/20 bg-violet-500/10 p-4">
              <p className="text-xs font-bold text-violet-300 uppercase tracking-widest">Default setup</p>
              <p className="text-sm text-gray-400 mt-2">
                MYR payments, Mobile Legends queue, four package tiers, Stripe-ready business metadata and closed queue by default.
              </p>
            </div>
          </aside>

          <section className="bg-[#0f0f1a] border border-white/5 rounded-2xl p-5 md:p-7 shadow-2xl">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-300 text-sm mb-6">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
              <div>
                <SectionTitle eyebrow="Account security" title="Owner identity" />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Account owner name">
                    <input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Luqman Bahrin"
                      maxLength={80}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        const nextEmail = e.target.value;
                        setEmail(nextEmail);
                        if (!supportEmail || supportEmail === email) setSupportEmail(nextEmail);
                      }}
                      placeholder="you@example.com"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Password" hint={`${strength}/5 strength`}>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Confirm password">
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      className={inputClass}
                    />
                  </Field>
                </div>
              </div>

              <div>
                <SectionTitle eyebrow="Workspace" title="Public creator profile" />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Streamer name">
                    <input
                      value={streamerName}
                      onChange={(e) => {
                        setStreamerName(e.target.value);
                        if (!slugInput) setSlugInput(normalizeSlug(e.target.value));
                      }}
                      placeholder="Luqieyyy"
                      maxLength={60}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Public URL" hint={slugCheck.ok ? `/streamer/${slugCheck.slug}` : slugCheck.message}>
                    <div className="flex items-center rounded-xl bg-[#171724] border border-white/10 focus-within:border-violet-500/60 px-3 transition-colors">
                      <span className="text-gray-600 text-sm shrink-0">mabarqueue.vercel.app/streamer/</span>
                      <input
                        value={slugInput}
                        onChange={(e) => setSlugInput(e.target.value)}
                        placeholder="luqieyyy"
                        maxLength={30}
                        className="min-w-0 flex-1 bg-transparent py-3 text-sm text-white placeholder-gray-600 outline-none"
                      />
                    </div>
                  </Field>
                  <Field label="Primary platform">
                    <select value={primaryPlatform} onChange={(e) => setPrimaryPlatform(e.target.value)} className={inputClass}>
                      {platforms.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </Field>
                  <Field label="Channel URL">
                    <input
                      value={channelUrl}
                      onChange={(e) => setChannelUrl(e.target.value)}
                      placeholder="https://www.tiktok.com/@yourchannel"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Country">
                    <select value={country} onChange={(e) => setCountry(e.target.value)} className={inputClass}>
                      {countries.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </Field>
                  <Field label="Timezone">
                    <input value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Language">
                    <input value={language} onChange={(e) => setLanguage(e.target.value)} className={inputClass} />
                  </Field>
                </div>
              </div>

              <div>
                <SectionTitle eyebrow="Business profile" title="Compliance and billing metadata" />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Business legal name">
                    <input
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="LUQIEYYYDEV IT SOLUTION"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Business type">
                    <select value={businessType} onChange={(e) => setBusinessType(e.target.value)} className={inputClass}>
                      {businessTypes.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </Field>
                  <Field label="Support email">
                    <input
                      type="email"
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      placeholder="support@example.com"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Currency">
                    <input value="MYR" disabled className={`${inputClass} disabled:text-gray-500 disabled:cursor-not-allowed`} />
                  </Field>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                <Checkbox checked={termsAccepted} onChange={setTermsAccepted}>
                  I agree to the MabarQueue Terms of Service.
                </Checkbox>
                <Checkbox checked={privacyAccepted} onChange={setPrivacyAccepted}>
                  I agree to the Privacy Policy and consent to account data processing.
                </Checkbox>
                <Checkbox checked={refundAccepted} onChange={setRefundAccepted}>
                  I understand the Refund Policy for paid play-together gaming sessions.
                </Checkbox>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <p className="text-xs text-gray-600">
                  Account creates dashboard access, default packages and queue settings.
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black px-8 py-3 rounded-xl transition-all text-sm shadow-lg shadow-violet-600/20"
                >
                  {submitting ? 'Creating account...' : 'Create Account'}
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}

const inputClass =
  'w-full bg-[#171724] border border-white/10 focus:border-violet-500/60 rounded-xl px-3 py-3 text-white placeholder-gray-600 text-sm outline-none transition-colors';

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-black text-violet-400 uppercase tracking-widest">{eyebrow}</p>
      <h2 className="text-lg font-black text-white mt-1">{title}</h2>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{label}</span>
        {hint && <span className="text-[11px] text-gray-600 truncate">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 text-sm text-gray-400">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-white/20 bg-[#171724] accent-violet-500"
      />
      <span>{children}</span>
    </label>
  );
}
