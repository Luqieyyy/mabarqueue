import Link from 'next/link';

const features = [
  {
    icon: '⚡',
    title: 'Auto Donation Queue',
    desc: 'Viewers donate via Sociabuzz and are automatically added to the game queue. No manual work.',
  },
  {
    icon: '🔴',
    title: 'Realtime Updates',
    desc: 'Firestore onSnapshot keeps the queue live across all viewers, dashboard, and overlay simultaneously.',
  },
  {
    icon: '🖥',
    title: 'OBS Overlay',
    desc: 'Transparent browser source overlay with glow styling. Shows current player and queue live.',
  },
  {
    icon: '🎮',
    title: 'Streamer Dashboard',
    desc: 'Full control panel — finish games, skip players, add manually, and view donation history.',
  },
];

const steps = [
  {
    num: '01',
    title: 'Viewer Donates',
    desc: 'Viewer donates on Sociabuzz and puts their IGN in the donation message.',
  },
  {
    num: '02',
    title: 'Joins Queue',
    desc: 'Webhook triggers automatically — IGN is extracted and games are calculated from the amount.',
  },
  {
    num: '03',
    title: 'Streamer Plays',
    desc: 'Streamer sees the queue on dashboard and plays with the current player.',
  },
  {
    num: '04',
    title: 'Queue Advances',
    desc: 'Hit Finish Game — gamesLeft decrements and when it hits 0 the next player auto-promotes.',
  },
];

const tiers = [
  { amount: 'RM4', games: '1 game' },
  { amount: 'RM10', games: '3 games' },
  { amount: 'RM20', games: '6 games' },
  { amount: 'RM30', games: '10 games' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#08080e] text-white">
      {/* ── Navbar ── */}
      <nav className="border-b border-white/5 backdrop-blur-sm bg-[#08080e]/80 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center text-sm font-black">
              S
            </div>
            <span className="font-bold text-white">SynoQueue</span>
          </div>
          <Link
            href="/login"
            className="bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold px-4 py-2 rounded-lg transition-all hover:shadow-lg hover:shadow-violet-500/25"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden pt-24 pb-20 px-4">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-violet-700/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 right-1/4 w-[300px] h-[300px] bg-purple-800/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-full px-4 py-1.5 text-sm text-violet-400 mb-8">
            <span className="w-2 h-2 bg-violet-400 rounded-full animate-pulse" />
            Real-time Queue Management for Streamers
          </div>

          <h1 className="text-5xl md:text-7xl font-black text-white mb-6 leading-none tracking-tight">
            Play With Your<br />
            Viewers{' '}
            <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent">
              Without Chaos
            </span>
          </h1>

          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            SynoQueue automatically manages your mabar queue using Sociabuzz donation triggers.
            Viewers donate, system queues them — you just play.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/login"
              className="bg-violet-600 hover:bg-violet-500 text-white font-bold px-8 py-4 rounded-xl transition-all text-lg hover:scale-105 hover:shadow-xl hover:shadow-violet-500/30"
            >
              Start Streaming
            </Link>
            <Link
              href="/queue"
              className="border border-white/10 hover:border-violet-500/40 hover:bg-violet-500/5 text-gray-300 hover:text-white font-semibold px-8 py-4 rounded-xl transition-all text-lg"
            >
              View Live Queue
            </Link>
          </div>

          <div className="flex flex-wrap justify-center gap-8 mt-16 pt-8 border-t border-white/5">
            {[
              { label: 'Realtime', sub: 'Firestore onSnapshot' },
              { label: 'Auto Queue', sub: 'Donation triggered' },
              { label: 'OBS Ready', sub: 'Browser source overlay' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-base font-bold text-violet-400">{s.label}</p>
                <p className="text-xs text-gray-600">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">
              Everything for{' '}
              <span className="text-violet-400">mabar sessions</span>
            </h2>
            <p className="text-gray-500 max-w-lg mx-auto">
              Built specifically for Mobile Legends streamers who run daily mabar with viewers.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-[#0f0f1a] border border-white/5 hover:border-violet-500/20 rounded-2xl p-6 transition-all hover:bg-[#131320] group"
              >
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="text-base font-bold text-white mb-2 group-hover:text-violet-300 transition-colors">
                  {f.title}
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-20 px-4 bg-gradient-to-b from-transparent via-violet-950/5 to-transparent">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">How It Works</h2>
            <p className="text-gray-500">From donation to playing in under 5 seconds.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {steps.map((step, i) => (
              <div key={step.num} className="relative">
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-[65%] w-full h-px bg-gradient-to-r from-violet-500/40 to-transparent z-10" />
                )}
                <div className="relative z-20 bg-[#0f0f1a] border border-white/5 rounded-2xl p-5">
                  <div className="text-xs font-black text-violet-500 mb-3 font-mono">{step.num}</div>
                  <h3 className="font-bold text-white mb-2 text-sm">{step.title}</h3>
                  <p className="text-gray-600 text-xs leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Donation Tiers ── */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-black text-white mb-4">Donation Tiers</h2>
          <p className="text-gray-500 mb-10">
            Amount is automatically converted to games when viewer donates.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {tiers.map((tier, i) => (
              <div
                key={tier.amount}
                className="border rounded-2xl p-5 transition-all hover:scale-105"
                style={{
                  borderColor: `rgba(139, 92, 246, ${0.2 + i * 0.1})`,
                  background: `rgba(139, 92, 246, ${0.03 + i * 0.02})`,
                }}
              >
                <p className="text-2xl font-black text-white">{tier.amount}</p>
                <p className="text-violet-400 text-sm mt-1">{tier.games}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-4 text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-4xl font-black text-white mb-4">Ready to run your first mabar?</h2>
          <p className="text-gray-500 mb-8">
            Set up in minutes. Manage your entire viewer queue hands-free.
          </p>
          <Link
            href="/login"
            className="inline-block bg-violet-600 hover:bg-violet-500 text-white font-bold px-10 py-4 rounded-xl transition-all text-lg hover:scale-105 hover:shadow-xl hover:shadow-violet-500/30"
          >
            Start Streaming Free
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-violet-600 rounded-md flex items-center justify-center text-xs font-black">
              S
            </div>
            <span className="text-gray-500 text-sm">SynoQueue</span>
          </div>
          <div className="flex gap-6">
            <Link href="/queue" className="text-gray-600 hover:text-gray-400 text-sm transition-colors">
              Live Queue
            </Link>
            <Link href="/dashboard" className="text-gray-600 hover:text-gray-400 text-sm transition-colors">
              Dashboard
            </Link>
            <Link href="/overlay" className="text-gray-600 hover:text-gray-400 text-sm transition-colors">
              OBS Overlay
            </Link>
          </div>
          <p className="text-gray-700 text-xs">Built for Syno · synoplays_</p>
        </div>
      </footer>
    </div>
  );
}
