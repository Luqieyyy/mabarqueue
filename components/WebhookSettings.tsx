'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_TIERS,
  getRates,
  saveRates,
  getFeatures,
  saveFeatures,
  getWebhookToken,
  saveWebhookToken,
  type RateTier,
  type FeatureSettings,
} from '../lib/settings';
import {
  getPackages,
  deletePackage,
  togglePackage,
  updatePackageMatchCount,
  syncPackages,
  type StreamerPackage,
} from '../lib/packages';

interface Props {
  uid: string;
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'webhook' | 'rates' | 'packages' | 'features';

export default function WebhookSettings({ uid, isOpen, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('webhook');

  // ── Webhook tab state ──
  const [token, setToken] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [savedToken, setSavedToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // ── Rates tab state ──
  const [tiers, setTiers] = useState<RateTier[]>(DEFAULT_TIERS);
  const [savingRates, setSavingRates] = useState(false);
  const [savedRates, setSavedRates] = useState(false);

  // ── Packages tab state ──
  const [packages, setPackages] = useState<StreamerPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [editingMatch, setEditingMatch] = useState<string | null>(null);
  const [editMatchValue, setEditMatchValue] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // ── Features tab state ──
  const [features, setFeatures] = useState<FeatureSettings>({ commentAlbum: false });
  const [savingFeatures, setSavingFeatures] = useState(false);
  const [savedFeatures, setSavedFeatures] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWebhookUrl(`${window.location.origin}/api/sociabuzz/${uid}`);
    }
    getWebhookToken(uid).then((t) => { if (t) setToken(t); });
    getRates(uid).then(setTiers);
    getFeatures(uid).then(setFeatures);
  }, [uid]);

  const loadPackages = useCallback(async () => {
    setLoadingPackages(true);
    try {
      const pkgs = await getPackages(uid);
      setPackages(pkgs);
    } finally {
      setLoadingPackages(false);
    }
  }, [uid]);

  // Load packages when tab is selected
  useEffect(() => {
    if (tab === 'packages') loadPackages();
  }, [tab, loadPackages]);

  // ── Webhook handlers ──
  const handleSaveToken = async () => {
    setSavingToken(true);
    try {
      await saveWebhookToken(uid, token);
      setSavedToken(true);
      setTimeout(() => setSavedToken(false), 3000);
    } finally {
      setSavingToken(false);
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  // ── Rates handlers ──
  const updateTier = (index: number, field: keyof RateTier, value: number) => {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  };

  const addTier = () => {
    setTiers((prev) => [...prev, { amount: 0, games: 1 }]);
  };

  const removeTier = (index: number) => {
    setTiers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveRates = async () => {
    setSavingRates(true);
    try {
      const sorted = [...tiers]
        .filter((t) => t.amount > 0 && t.games > 0)
        .sort((a, b) => a.amount - b.amount);
      await saveRates(uid, sorted);
      setTiers(sorted);
      setSavedRates(true);
      setTimeout(() => setSavedRates(false), 3000);
    } finally {
      setSavingRates(false);
    }
  };

  const resetToDefault = () => setTiers(DEFAULT_TIERS);

  // ── Package handlers ──
  const handleDeletePackage = async (title: string) => {
    await deletePackage(uid, title);
    setPackages((prev) => prev.filter((p) => p.title !== title));
    setConfirmDelete(null);
  };

  const handleTogglePackage = async (title: string, isActive: boolean) => {
    await togglePackage(uid, title, isActive);
    setPackages((prev) =>
      prev.map((p) => (p.title === title ? { ...p, isActive } : p)),
    );
  };

  const handleSaveMatchCount = async (title: string) => {
    await updatePackageMatchCount(uid, title, editMatchValue);
    setPackages((prev) =>
      prev.map((p) => (p.title === title ? { ...p, matchCount: editMatchValue } : p)),
    );
    setEditingMatch(null);
  };

  const handleSyncPackages = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const count = await syncPackages(uid);
      setSyncResult(`${count} new package${count !== 1 ? 's' : ''} synced`);
      await loadPackages();
      setTimeout(() => setSyncResult(null), 4000);
    } finally {
      setSyncing(false);
    }
  };

  // ── Features handlers ──
  const handleSaveFeatures = async () => {
    setSavingFeatures(true);
    try {
      await saveFeatures(uid, features);
      setSavedFeatures(true);
      setTimeout(() => setSavedFeatures(false), 3000);
    } finally {
      setSavingFeatures(false);
    }
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
      <aside className="fixed right-0 top-0 h-full w-full max-w-sm bg-white border-l border-gray-200 z-50 overflow-y-auto shadow-2xl flex flex-col">
        <div className="p-5 flex-1">

          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">Settings</h2>
              <p className="text-xs text-gray-500 mt-0.5">Sociabuzz & streamer config</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all text-lg mt-0.5"
            >
              x
            </button>
          </div>

          {/* Tabs */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
            {(['webhook', 'rates', 'packages', 'features'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-all capitalize ${
                  tab === t
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'webhook' ? 'Webhook' : t === 'rates' ? 'Rates' : t === 'packages' ? 'Packages' : 'Features'}
              </button>
            ))}
          </div>

          {/* ── TAB: WEBHOOK ── */}
          {tab === 'webhook' && (
            <div className="space-y-5">
              {/* Status badge */}
              <div
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl ${
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
              <div>
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
              <div>
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
                  onClick={handleSaveToken}
                  disabled={savingToken}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm transition-all"
                >
                  {savingToken ? 'Saving...' : savedToken ? '✓ Token Saved!' : 'Save Token'}
                </button>
              </div>

              <div className="border-t border-gray-200" />

              {/* Setup Guide */}
              <div>
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

              <div className="border-t border-gray-200" />

              {/* Message Format */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  Donation Message Format
                </h3>
                <p className="text-xs text-gray-500 mb-2">Viewers must include IGN in message:</p>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 font-mono text-xs">
                  <span className="text-indigo-600 font-semibold">IGN: YourIGN</span>
                </div>
              </div>

              <div className="border-t border-gray-200" />

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
          )}

          {/* ── TAB: RATES ── */}
          {tab === 'rates' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Set how many games each donation amount unlocks. System picks the highest matching tier.
                </p>
              </div>

              {/* Tier rows */}
              <div className="space-y-2">
                {tiers.map((tier, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                    {/* Amount */}
                    <span className="text-xs text-gray-400 font-medium shrink-0">RM</span>
                    <input
                      type="number"
                      min={1}
                      value={tier.amount || ''}
                      onChange={(e) => updateTier(i, 'amount', Number(e.target.value))}
                      className="w-16 bg-white border border-gray-200 rounded-lg px-2 py-1 text-sm text-center font-bold text-gray-900 outline-none focus:border-indigo-400"
                      placeholder="0"
                    />
                    <span className="text-xs text-gray-400 shrink-0">=</span>
                    {/* Games with +/- */}
                    <div className="flex items-center gap-1 flex-1">
                      <button
                        onClick={() => updateTier(i, 'games', Math.max(1, tier.games - 1))}
                        className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded-md text-gray-500 hover:bg-gray-100 text-xs font-bold transition-all"
                      >
                        -
                      </button>
                      <span className="w-8 text-center text-sm font-bold text-gray-900">{tier.games}</span>
                      <button
                        onClick={() => updateTier(i, 'games', Math.min(10, tier.games + 1))}
                        className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded-md text-gray-500 hover:bg-gray-100 text-xs font-bold transition-all"
                      >
                        +
                      </button>
                      <span className="text-xs text-gray-400 ml-1">game{tier.games !== 1 ? 's' : ''}</span>
                    </div>
                    {/* Delete */}
                    <button
                      onClick={() => removeTier(i)}
                      className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-md transition-all text-base"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>

              {/* Add Tier */}
              <button
                onClick={addTier}
                className="w-full border-2 border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-gray-400 hover:text-indigo-500 text-xs font-semibold py-2.5 rounded-xl transition-all"
              >
                + Add Tier
              </button>

              <div className="flex gap-2">
                <button
                  onClick={resetToDefault}
                  className="flex-1 border border-gray-200 hover:bg-gray-50 text-gray-500 text-xs font-semibold py-2.5 rounded-xl transition-all"
                >
                  Reset Default
                </button>
                <button
                  onClick={handleSaveRates}
                  disabled={savingRates}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs transition-all"
                >
                  {savingRates ? 'Saving...' : savedRates ? '✓ Saved!' : 'Save Rates'}
                </button>
              </div>

              {/* Preview */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Preview</p>
                <div className="flex flex-wrap gap-2">
                  {[...tiers]
                    .filter((t) => t.amount > 0)
                    .sort((a, b) => a.amount - b.amount)
                    .map((t, i) => (
                      <span
                        key={i}
                        className="bg-white border border-indigo-100 text-indigo-600 text-xs font-bold px-2.5 py-1 rounded-lg"
                      >
                        RM{t.amount} → {t.games}g
                      </span>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* ── TAB: PACKAGES ── */}
          {tab === 'packages' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Packages are auto-detected from Sociabuzz donations. Each streamer has their own packages based on their Sociabuzz page setup.
                </p>
              </div>

              {/* Sync button */}
              <button
                onClick={handleSyncPackages}
                disabled={syncing}
                className="w-full border-2 border-dashed border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/50 text-indigo-500 hover:text-indigo-600 text-xs font-semibold py-2.5 rounded-xl transition-all disabled:opacity-50"
              >
                {syncing ? 'Syncing...' : 'Sync Packages from Donations'}
              </button>

              {syncResult && (
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full shrink-0" />
                  <span className="text-xs font-semibold text-emerald-700">{syncResult}</span>
                </div>
              )}

              {/* Package list */}
              {loadingPackages ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : packages.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400 italic">No packages yet</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Packages are auto-created when viewers donate via Sociabuzz
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {packages.map((pkg) => (
                    <div
                      key={pkg.title}
                      className={`border rounded-xl px-3 py-3 transition-all ${
                        pkg.isActive
                          ? 'bg-white border-gray-200'
                          : 'bg-gray-50 border-gray-200 opacity-60'
                      }`}
                    >
                      {/* Title + toggle */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold truncate ${pkg.isActive ? 'text-gray-900' : 'text-gray-500 line-through'}`}>
                            {pkg.title}
                          </p>
                          {pkg.description && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">{pkg.description}</p>
                          )}
                        </div>
                        {/* Active toggle */}
                        <button
                          onClick={() => handleTogglePackage(pkg.title, !pkg.isActive)}
                          className={`shrink-0 w-9 h-5 rounded-full transition-all relative ${
                            pkg.isActive ? 'bg-emerald-500' : 'bg-gray-300'
                          }`}
                          title={pkg.isActive ? 'Disable package' : 'Enable package'}
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
                              pkg.isActive ? 'left-4' : 'left-0.5'
                            }`}
                          />
                        </button>
                      </div>

                      {/* Stats row */}
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-gray-500">
                          RM<span className="font-bold text-gray-700">{pkg.price}</span>
                        </span>
                        <span className="text-gray-300">|</span>

                        {/* Match count (editable) */}
                        {editingMatch === pkg.title ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setEditMatchValue((v) => Math.max(1, v - 1))}
                              className="w-5 h-5 flex items-center justify-center bg-gray-100 border border-gray-200 rounded text-gray-600 text-xs font-bold hover:bg-gray-200"
                            >
                              -
                            </button>
                            <span className="w-6 text-center font-bold text-indigo-600">{editMatchValue}</span>
                            <button
                              onClick={() => setEditMatchValue((v) => Math.min(50, v + 1))}
                              className="w-5 h-5 flex items-center justify-center bg-gray-100 border border-gray-200 rounded text-gray-600 text-xs font-bold hover:bg-gray-200"
                            >
                              +
                            </button>
                            <button
                              onClick={() => handleSaveMatchCount(pkg.title)}
                              className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded font-semibold ml-1 hover:bg-indigo-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingMatch(null)}
                              className="text-[10px] text-gray-400 hover:text-gray-600 px-1"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingMatch(pkg.title);
                              setEditMatchValue(pkg.matchCount);
                            }}
                            className="text-indigo-600 font-bold hover:underline"
                            title="Click to edit match count"
                          >
                            {pkg.matchCount} match{pkg.matchCount !== 1 ? 'es' : ''}
                          </button>
                        )}

                        <div className="flex-1" />

                        {/* Delete */}
                        {confirmDelete === pkg.title ? (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-red-500 font-medium">Sure?</span>
                            <button
                              onClick={() => handleDeletePackage(pkg.title)}
                              className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded font-semibold hover:bg-red-600"
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="text-[10px] text-gray-400 hover:text-gray-600 px-1"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(pkg.title)}
                            className="text-gray-300 hover:text-red-500 transition-colors"
                            title="Delete package"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Info box */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">How it works</p>
                <ul className="text-xs text-gray-500 space-y-1 leading-relaxed">
                  <li>Packages are auto-created from Sociabuzz level titles</li>
                  <li>Each streamer has unique packages based on their Sociabuzz setup</li>
                  <li>Disabled packages will reject new queue entries</li>
                  <li>Deleting a package won&apos;t affect existing donation history</li>
                  <li>Use Sync to rebuild packages from past donations</li>
                </ul>
              </div>
            </div>
          )}

          {/* ── TAB: FEATURES ── */}
          {tab === 'features' && (
            <div className="space-y-4">
              {/* Comment Album */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-bold text-gray-800">Comment Album</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      Viewers can donate to comment on your ML gallery — they provide Game ID + IGN.
                    </p>
                  </div>
                  {/* Toggle */}
                  <button
                    onClick={() => setFeatures((f) => ({ ...f, commentAlbum: !f.commentAlbum }))}
                    className={`shrink-0 w-11 h-6 rounded-full transition-all relative ${
                      features.commentAlbum ? 'bg-indigo-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
                        features.commentAlbum ? 'left-5' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>

                {features.commentAlbum && (
                  <div className="border-t border-gray-200 pt-3 space-y-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Message format when ON</p>
                    <div className="bg-white border border-gray-200 rounded-lg p-2.5 font-mono text-xs space-y-1">
                      <div>
                        <span className="text-gray-400">Mabar → </span>
                        <span className="text-indigo-600 font-semibold">IGN: YourIGN</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Album → </span>
                        <span className="text-violet-600 font-semibold">ALBUM: 43149159 YourIGN</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-400 leading-relaxed">
                      Webhook auto-detects by prefix. Album entries go to a separate collection, visible in donations feed.
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={handleSaveFeatures}
                disabled={savingFeatures}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm transition-all"
              >
                {savingFeatures ? 'Saving...' : savedFeatures ? '✓ Saved!' : 'Save Features'}
              </button>
            </div>
          )}

        </div>
      </aside>
    </>
  );
}
