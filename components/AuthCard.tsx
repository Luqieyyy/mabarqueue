import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';

export const authInputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';
export const authButtonClass = 'w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2';

export default function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return <main className="min-h-screen bg-slate-50 text-slate-950 flex items-center justify-center px-4 py-12">
    <div className="w-full max-w-md">
      <header className="text-center mb-8">
        <Link href="/" aria-label="MabarQueue home" className="inline-flex items-center gap-3 mb-6 font-bold">
          <Image src="/mabarqueue.png" alt="" width={40} height={40} className="w-10 h-10 rounded-xl object-cover" />MabarQueue
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-slate-500 text-sm mt-2">{subtitle}</p>
      </header>
      <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_12px_35px_rgba(15,23,42,0.07)]">{children}</section>
      {footer && <div className="text-center text-sm text-slate-500 mt-6">{footer}</div>}
    </div>
  </main>;
}
