"use client"; // Required for Framer Motion

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';

const features = [
  { icon: '⚡', title: 'Auto Donation Queue', desc: 'Viewers donate via Sociabuzz and are automatically added to the game queue. No manual work.' },
  { icon: '🔴', title: 'Realtime Updates', desc: 'Firestore onSnapshot keeps the queue live across all viewers, dashboard, and overlay simultaneously.' },
  { icon: '🖥', title: 'OBS Overlay', desc: 'Transparent browser source overlay with glow styling. Shows current player and queue live.' },
  { icon: '🎮', title: 'Streamer Dashboard', desc: 'Full control panel — finish games, skip players, add manually, and view donation history.' },
];

const steps = [
  { num: '01', title: 'Viewer Donates', desc: 'Viewer donates on Sociabuzz and puts their IGN in the donation message.' },
  { num: '02', title: 'Joins Queue', desc: 'Webhook triggers automatically — IGN is extracted and games are calculated from the amount.' },
  { num: '03', title: 'Streamer Plays', desc: 'Streamer sees the queue on dashboard and plays with the current player.' },
  { num: '04', title: 'Queue Advances', desc: 'Hit Finish Game — gamesLeft decrements and when it hits 0 the next player auto-promotes.' },
];

const tiers = [
  { amount: 'RM4', games: '1 game' },
  { amount: 'RM10', games: '3 games' },
  { amount: 'RM20', games: '6 games' },
  { amount: 'RM30', games: '10 games' },
];

// Animation Variants
const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#08080e] text-white overflow-x-hidden">
      {/* ── Navbar ── */}
      <nav className="border-b border-white/5 backdrop-blur-md bg-[#08080e]/80 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2"
          >
            <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center text-sm font-black shadow-lg shadow-violet-600/20">
              M
            </div>
            <span className="font-bold text-white tracking-tight">MabarQueue</span>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <Link
              href="/login"
              className="bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-all hover:shadow-lg hover:shadow-violet-500/40 active:scale-95"
            >
              Get Started
            </Link>
          </motion.div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        <Image
          src="/bannerlandingpage.png"
          alt="MabarQueue Preview"
          fill
          className="absolute inset-0 object-cover object-center opacity-40"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#08080e]/20 via-[#08080e]/80 to-[#08080e]" />

        <div className="relative z-10 max-w-4xl mx-auto text-center pt-20 pb-20 px-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-full px-4 py-1.5 text-sm text-violet-400 mb-8"
          >
            <span className="w-2 h-2 bg-violet-400 rounded-full animate-pulse" />
            Real-time Queue Management for Streamers
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-5xl md:text-8xl font-black text-white mb-6 leading-[0.9] tracking-tight"
          >
            Play With Your<br />
            Viewers{' '}
            <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent">
              Without Chaos
            </span>
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 1 }}
            className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            MabarQueue automatically manages your queue using Sociabuzz triggers.
            Viewers donate, system queues — you just focus on the gameplay.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <Link
              href="/login"
              className="group relative bg-violet-600 hover:bg-violet-500 text-white font-bold px-10 py-4 rounded-xl transition-all text-lg hover:scale-105 shadow-xl shadow-violet-600/20"
            >
              Start Streaming
            </Link>
            <Link
              href="/queue"
              className="border border-white/10 hover:border-violet-500/40 hover:bg-violet-500/5 text-gray-300 hover:text-white font-semibold px-10 py-4 rounded-xl transition-all text-lg"
            >
              View Live Queue
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-24 px-4">
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
          className="max-w-5xl mx-auto"
        >
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black text-white mb-4 italic">Everything for <span className="text-violet-500">Mabar</span></h2>
            <p className="text-gray-500">Pro tools for the next generation of Mobile Legends creators.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((f) => (
              <motion.div
                key={f.title}
                variants={fadeInUp}
                whileHover={{ y: -5, borderColor: 'rgba(139, 92, 246, 0.4)' }}
                className="bg-[#0f0f1a] border border-white/5 rounded-2xl p-8 transition-colors group"
              >
                <div className="text-4xl mb-6 group-hover:scale-110 transition-transform duration-300 inline-block">{f.icon}</div>
                <h3 className="text-xl font-bold text-white mb-3 group-hover:text-violet-300 transition-colors">
                  {f.title}
                </h3>
                <p className="text-gray-500 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-24 px-4 bg-violet-600/5 relative">
        <div className="max-w-6xl mx-auto">
          <motion.div 
            initial={{ opacity: 0 }} 
            whileInView={{ opacity: 1 }} 
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4 uppercase tracking-widest">The Workflow</h2>
          </motion.div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <motion.div 
                key={step.num}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.2 }}
                viewport={{ once: true }}
                className="relative bg-[#08080e] border border-white/5 p-6 rounded-2xl hover:bg-violet-600/[0.02] transition-colors"
              >
                <span className="text-4xl font-black text-violet-600/20 absolute top-4 right-6 uppercase">{step.num}</span>
                <h3 className="font-bold text-white mb-3 text-lg relative z-10">{step.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed relative z-10">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Donation Tiers ── */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <motion.div 
             initial={{ opacity: 0, y: 20 }}
             whileInView={{ opacity: 1, y: 0 }}
             className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">Donation Tiers</h2>
            <p className="text-gray-500">Automated conversion logic based on IDR/MYR value.</p>
          </motion.div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {tiers.map((tier, i) => (
              <motion.div
                key={tier.amount}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.05, boxShadow: "0 20px 40px -10px rgba(139, 92, 246, 0.3)" }}
                transition={{ delay: i * 0.1 }}
                className="cursor-default rounded-2xl p-6 text-center border transition-all"
                style={{
                  borderColor: `rgba(139, 92, 246, ${0.2 + i * 0.1})`,
                  background: `linear-gradient(180deg, rgba(139, 92, 246, ${0.05 + i * 0.02}) 0%, transparent 100%)`,
                }}
              >
                <p className="text-3xl font-black text-white">{tier.amount}</p>
                <p className="text-violet-400 font-bold mt-2 uppercase text-xs tracking-tighter">{tier.games}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <motion.section 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        className="py-32 px-4 text-center relative overflow-hidden"
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-violet-600/20 blur-[120px] rounded-full -z-10" />
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl md:text-6xl font-black text-white mb-6">Ready to dominate?</h2>
          <p className="text-gray-400 text-lg mb-10">Join 100+ streamers using MabarQueue to monetize their gameplay.</p>
          <Link
            href="/login"
            className="inline-block bg-white text-black hover:bg-violet-100 font-black px-12 py-5 rounded-2xl transition-all text-xl shadow-2xl active:scale-95"
          >
            Start Free Trial
          </Link>
        </div>
      </motion.section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-12 px-4 bg-[#05050a]">
        <div className="max-w-6xl mx-auto flex flex-col md:row items-center justify-between gap-8">
          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-violet-600 rounded flex items-center justify-center text-[10px] font-black">M</div>
              <span className="text-white font-bold text-sm tracking-widest uppercase">MabarQueue</span>
            </div>
            <p className="text-gray-600 text-xs">© 2024 Built for the community.</p>
          </div>
          <div className="flex gap-8">
            {['Queue', 'Dashboard', 'Overlay'].map((item) => (
              <Link key={item} href={`/${item.toLowerCase()}`} className="text-gray-500 hover:text-violet-400 text-sm font-medium transition-colors">
                {item}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}