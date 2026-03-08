'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function WebhookSettings({ isOpen, onClose }: Props) {
  const [token, setToken] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWebhookUrl(`${window.location.origin}/api/sociabuzz`);
    }
    getDoc(doc(db, 'settings', 'webhook')).then((snap) => {
      if (snap.exists()) setToken(snap.data().token ?? '');
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'webhook'), { token: token.trim() }, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  if (!isOpen) return null;

  const testCurl = `curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\${token ? `\n  -H "X-Callback-Token: ${token}" \\` : ''}
  -d '{"donor_name":"TestUser","amount":10,"message":"IGN: TestIGN"}'`;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Sidebar */}
      <aside className="fixed right-0 top-0 h-full w-full max-w-sm bg-white border-l border-gray-200 z-50 overflow-y-auto shadow-2xl">
        <div className="p-5">

          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-gray-900">Webhook Settings</h2>
              <p className="text-xs text-gray-500 mt-0.5">Sociabuzz integration config</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all text-lg mt-0.5"
            >
              ×
            </button>
          </div>

          {/* Status badge */}
          <div
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl mb-5 ${
              token
                ? 'bg-emerald-50 border border-emerald-200'
                : 'bg-amber-50 border border-amber-200'
            }`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${token ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
            <span className={`text-xs font-semibold ${token ? 'text-emerald-700' : 'text-amber-700'}`}>
              {token ? 'Webhook Active — token saved' : 'Token not configured'}
            </span>
          </div>

          {/* Webhook URL */}
          <div className="mb-5">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">
              Your Webhook URL
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Paste into Sociabuzz → Integrations → Webhook → Webhook URL
            </p>
            <div className="flex gap-2">
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs text-gray-700 font-mono overflow-hidden text-ellipsis whitespace-nowrap">
                {webhookUrl || 'Loading...'}
              </div>
              <button
                onClick={copyUrl}
                className="shrink-0 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-600 text-xs px-3 py-2 rounded-xl transition-all font-semibold"
              >
                {copiedUrl ? '✓' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Webhook Token */}
          <div className="mb-5">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">
              Webhook Token
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Copy from Sociabuzz → Integrations → Webhook → Webhook Token
            </p>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="sbwhook-xxxxxxxxxxxxxxxx"
              className="w-full bg-gray-50 border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 rounded-xl px-3 py-2.5 text-gray-900 placeholder-gray-400 text-sm outline-none transition-all font-mono mb-3"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-xl text-sm transition-all"
            >
              {saving ? 'Saving...' : saved ? '✓ Token Saved!' : 'Save Token'}
            </button>
          </div>

          <div className="border-t border-gray-200 my-5" />

          {/* Setup Guide */}
          <div className="mb-5">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
              Setup Guide
            </h3>
            <div className="space-y-3">
              {[
                { step: '01', title: 'Copy Webhook URL', desc: 'Click Copy above.' },
                { step: '02', title: 'Paste in Sociabuzz', desc: 'Sociabuzz → Integrations → Webhook → paste URL.' },
                { step: '03', title: 'Enable Webhook', desc: 'Toggle "Aktifkan Integrasi Webhook" ON.' },
                { step: '04', title: 'Copy Their Token', desc: 'Copy "Webhook Token" from Sociabuzz.' },
                { step: '05', title: 'Save Token Here', desc: 'Paste in field above, click Save Token.' },
              ].map((s) => (
                <div key={s.step} className="flex gap-3">
                  <span className="text-[10px] font-black text-indigo-500 font-mono shrink-0 mt-0.5 w-5">{s.step}</span>
                  <div>
                    <p className="text-xs font-semibold text-gray-700">{s.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-200 my-5" />

          {/* Message Format */}
          <div className="mb-5">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Donation Message Format
            </h3>
            <p className="text-xs text-gray-500 mb-2">Viewers must include IGN in message:</p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 font-mono text-xs">
              <span className="text-indigo-600 font-semibold">IGN: YourIGN</span>
            </div>
          </div>

          <div className="border-t border-gray-200 my-5" />

          {/* Test Curl */}
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Test Manually
            </h3>
            <p className="text-xs text-gray-500 mb-2">Run in terminal to test webhook:</p>
            <div className="bg-gray-900 rounded-xl p-3">
              <pre className="text-[10px] text-emerald-400 leading-relaxed whitespace-pre-wrap break-all font-mono">
                {testCurl}
              </pre>
            </div>
          </div>

        </div>
      </aside>
    </>
  );
}
