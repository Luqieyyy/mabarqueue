'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import { apiFetch, ApiError } from '../../lib/api-client';

interface MoneySummary {
  grossSen: number;
  platformFeeSen: number;
  netBeforeProcessingSen: number;
  paymentCount: number;
  grossFormatted: string;
  platformFeeFormatted: string;
  netBeforeProcessingFormatted: string;
}

interface AdminUserRow {
  userId: string;
  authUid: string | null;
  email: string | null;
  role: string;
  plan: string | null;
  accountStatus: string | null;
  streamerName: string;
  slug: string | null;
  createdAt: string | null;
  workspaceId: string | null;
  sales: MoneySummary;
}

interface SaleRecord {
  id: string;
  source: 'legacy' | 'workspace';
  ownerId: string;
  streamerId: string | null;
  donorName: string;
  packageTitle: string | null;
  status: string;
  grossFormatted: string;
  createdAt: string | null;
}

interface AdminOverview {
  summary: MoneySummary & {
    totalAuthUsers: number;
    totalUserDocs: number;
    totalStreamers: number;
    failedPayments: number;
  };
  users: AdminUserRow[];
  recentSales: SaleRecord[];
  roles: string[];
}

function formatDate(value: string | null) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function AdminPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, router, user]);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await apiFetch<AdminOverview>('/api/admin/overview');
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load admin overview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [load, user]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !data) return data?.users ?? [];
    return data.users.filter((row) => [
      row.userId,
      row.authUid ?? '',
      row.email ?? '',
      row.role,
      row.streamerName,
      row.slug ?? '',
      row.workspaceId ?? '',
    ].some((value) => value.toLowerCase().includes(q)));
  }, [data, query]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center">
          <p className="text-xs font-black tracking-widest text-red-300 uppercase">Admin access</p>
          <h1 className="text-2xl font-black mt-2">Cannot open admin dashboard</h1>
          <p className="text-sm text-red-100/70 mt-3">{error}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/dashboard" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/15 transition-colors">
              Dashboard
            </Link>
            <button
              onClick={() => void signOut(auth).then(() => router.push('/login'))}
              className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-400 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const summary = data!.summary;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="border-b border-white/10 bg-slate-950/90 sticky top-0 z-40 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/mabarqueue.png" alt="" width={36} height={36} className="w-9 h-9 rounded-lg object-cover" />
            <div>
              <p className="text-sm font-black leading-none">MabarQueue Admin</p>
              <p className="text-xs text-slate-500 mt-1">Platform overview and sales monitoring</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="hidden sm:inline-flex rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:text-white hover:bg-white/5 transition-colors">
              Streamer Dashboard
            </Link>
            <button
              onClick={() => void load()}
              className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/15 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Total sales" value={summary.grossFormatted} sub={`${summary.paymentCount} successful payments`} tone="violet" />
          <Metric label="Platform fee" value={summary.platformFeeFormatted} sub="Estimated before processor fees" tone="emerald" />
          <Metric label="Streamers" value={String(summary.totalStreamers)} sub={`${summary.totalAuthUsers} auth users`} tone="sky" />
          <Metric label="Failed payments" value={String(summary.failedPayments)} sub={`${summary.totalUserDocs} Firestore user docs`} tone="amber" />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
            <div className="p-5 border-b border-white/10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-xl font-black">Users and streamer accounts</h1>
                <p className="text-sm text-slate-500 mt-1">Auth UID, legacy user ID, role, public slug and sales per account.</p>
              </div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search user id, email, slug..."
                className="w-full lg:w-80 rounded-xl bg-slate-900 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-500"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-slate-900/80 text-slate-500">
                  <tr>
                    <Th>User ID</Th>
                    <Th>Auth UID</Th>
                    <Th>Role</Th>
                    <Th>Streamer</Th>
                    <Th>Status</Th>
                    <Th align="right">Sales</Th>
                    <Th align="right">Payments</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((row) => (
                    <tr key={`${row.authUid ?? row.userId}:${row.userId}`} className="border-t border-white/5 hover:bg-white/[0.025]">
                      <Td>
                        <p className="font-mono text-xs text-slate-200">{row.userId}</p>
                        <p className="text-xs text-slate-600 mt-1">{row.email ?? 'No email'}</p>
                      </Td>
                      <Td>
                        <p className="font-mono text-xs text-slate-400 max-w-[220px] truncate">{row.authUid ?? 'Not linked'}</p>
                        <p className="text-xs text-slate-600 mt-1">{row.workspaceId ? `workspace ${row.workspaceId}` : 'legacy workspace'}</p>
                      </Td>
                      <Td>
                        <span className={`rounded-full px-2 py-1 text-[11px] font-black uppercase ${roleClass(row.role)}`}>
                          {row.role}
                        </span>
                      </Td>
                      <Td>
                        <p className="font-bold text-slate-100">{row.streamerName}</p>
                        {row.slug ? (
                          <Link href={`/streamer/${row.slug}`} className="text-xs text-violet-400 hover:text-violet-300">
                            /streamer/{row.slug}
                          </Link>
                        ) : (
                          <p className="text-xs text-slate-600">No public slug</p>
                        )}
                      </Td>
                      <Td>
                        <p className="text-slate-300">{row.accountStatus ?? 'unknown'}</p>
                        <p className="text-xs text-slate-600 mt-1">{formatDate(row.createdAt)}</p>
                      </Td>
                      <Td align="right">
                        <p className="font-black text-slate-100">{row.sales.grossFormatted}</p>
                        <p className="text-xs text-slate-600 mt-1">fee {row.sales.platformFeeFormatted}</p>
                      </Td>
                      <Td align="right">
                        <p className="font-mono text-slate-300">{row.sales.paymentCount}</p>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="font-black">Recent sales</h2>
                <p className="text-xs text-slate-500 mt-1">Successful payments only</p>
              </div>
              <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-bold text-slate-400">
                {data!.recentSales.length} rows
              </span>
            </div>
            <div className="space-y-3">
              {data!.recentSales.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-500">
                  No successful sales recorded yet.
                </div>
              )}
              {data!.recentSales.map((sale) => (
                <div key={`${sale.source}:${sale.id}`} className="rounded-xl bg-slate-900/80 border border-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-100 truncate">{sale.donorName || 'Viewer'}</p>
                      <p className="text-xs text-slate-500 mt-1 truncate">{sale.packageTitle ?? 'No package title'}</p>
                    </div>
                    <p className="font-black text-emerald-300">{sale.grossFormatted}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-600">
                    <span className="uppercase font-bold">{sale.source}</span>
                    <span>{formatDate(sale.createdAt)}</span>
                  </div>
                  <p className="font-mono text-[11px] text-slate-600 mt-2 truncate">owner {sale.ownerId}</p>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: 'violet' | 'emerald' | 'sky' | 'amber' }) {
  const tones = {
    violet: 'from-violet-500/20 text-violet-300',
    emerald: 'from-emerald-500/20 text-emerald-300',
    sky: 'from-sky-500/20 text-sky-300',
    amber: 'from-amber-500/20 text-amber-300',
  };

  return (
    <div className={`rounded-2xl border border-white/10 bg-gradient-to-br ${tones[tone]} to-white/[0.03] p-5`}>
      <p className="text-xs font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className="text-2xl font-black text-white mt-3">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{sub}</p>
    </div>
  );
}

function roleClass(role: string) {
  if (role === 'admin') return 'bg-red-500/15 text-red-300 border border-red-500/20';
  if (role === 'streamer') return 'bg-violet-500/15 text-violet-300 border border-violet-500/20';
  return 'bg-slate-500/15 text-slate-300 border border-slate-500/20';
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-4 py-3 ${align === 'right' ? 'text-right' : 'text-left'} text-[11px] font-black uppercase tracking-widest`}>
      {children}
    </th>
  );
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <td className={`px-4 py-4 align-top ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</td>;
}
