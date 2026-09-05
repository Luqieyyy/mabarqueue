import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';

export const authInputClass = 'w-full bg-[#1a1a2a] border border-white/10 focus:border-violet-400 rounded-xl px-3 py-3 text-white placeholder-gray-500 text-sm outline-none focus:ring-2 focus:ring-violet-500/30';
export const authButtonClass = 'w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors text-sm';

export default function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return <main className="min-h-screen bg-[#08080e] text-white flex items-center justify-center px-4 py-12">
    <div className="w-full max-w-md">
      <header className="text-center mb-8">
        <Link href="/" aria-label="MabarQueue home" className="inline-flex items-center gap-3 mb-6 font-bold">
          <Image src="/mabarqueue.png" alt="" width={40} height={40} className="w-10 h-10 rounded-xl object-cover" />MabarQueue
        </Link>
        <h1 className="text-2xl font-black">{title}</h1>
        <p className="text-gray-400 text-sm mt-2">{subtitle}</p>
      </header>
      <section className="bg-[#0f0f1a] border border-white/10 rounded-2xl p-6 shadow-2xl">{children}</section>
      {footer && <div className="text-center text-sm text-gray-400 mt-6">{footer}</div>}
    </div>
  </main>;
}
