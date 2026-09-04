import { NextRequest, NextResponse } from 'next/server';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '../../../../lib/firebase-admin';
import { withAdmin } from '../../../../lib/require-admin';

export const dynamic = 'force-dynamic';

type FirestoreData = FirebaseFirestore.DocumentData;

interface MoneySummary {
  grossSen: number;
  platformFeeSen: number;
  netBeforeProcessingSen: number;
  paymentCount: number;
}

interface SaleRecord {
  id: string;
  source: 'legacy' | 'stripe';
  ownerId: string;
  streamerId: string | null;
  donorName: string;
  packageTitle: string | null;
  status: string;
  grossSen: number;
  grossFormatted: string;
  createdAt: string | null;
}

interface UserRow {
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
  sales: MoneySummary & {
    grossFormatted: string;
    platformFeeFormatted: string;
    netBeforeProcessingFormatted: string;
  };
}

function emptyMoney(): MoneySummary {
  return { grossSen: 0, platformFeeSen: 0, netBeforeProcessingSen: 0, paymentCount: 0 };
}

function addMoney(target: MoneySummary, grossSen: number, platformFeeSen: number) {
  target.grossSen += grossSen;
  target.platformFeeSen += platformFeeSen;
  target.netBeforeProcessingSen += Math.max(0, grossSen - platformFeeSen);
  target.paymentCount += 1;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return null;
}

function senToRm(sen: number): string {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2,
  }).format(sen / 100);
}

function isSuccessfulStatus(status: string): boolean {
  return status === 'success' || status === 'succeeded';
}

function donationGrossSen(d: FirestoreData): number {
  if (Number.isFinite(d.grossSen)) return Number(d.grossSen);
  if (Number.isFinite(d.amount)) return Math.round(Number(d.amount) * 100);
  return 0;
}

function donationFeeSen(d: FirestoreData, grossSen: number): number {
  if (Number.isFinite(d.platformFeeSen)) return Number(d.platformFeeSen);
  return Math.floor(grossSen * 0.05);
}

function addFormatted(summary: MoneySummary) {
  return {
    ...summary,
    grossFormatted: senToRm(summary.grossSen),
    platformFeeFormatted: senToRm(summary.platformFeeSen),
    netBeforeProcessingFormatted: senToRm(summary.netBeforeProcessingSen),
  };
}

function parentInfo(doc: QueryDocumentSnapshot): {
  ownerId: string;
  streamerId: string | null;
  source: 'legacy' | 'stripe';
} {
  const parent = doc.ref.parent.parent;
  const collectionId = parent?.parent.id;
  const parentId = parent?.id ?? 'unknown';

  if (collectionId === 'streamers') {
    return { ownerId: parentId, streamerId: parentId, source: 'stripe' };
  }
  return { ownerId: parentId, streamerId: null, source: 'legacy' };
}

export const GET = withAdmin(async (_req: NextRequest) => {
  const db = adminDb();
  const [authUsers, userDocsSnap, streamerDocsSnap, donationDocsSnap] = await Promise.all([
    adminAuth().listUsers(1000),
    db.collection('users').get(),
    db.collection('streamers').get(),
    db.collectionGroup('donations').get(),
  ]);

  const streamerById = new Map<string, FirestoreData>();
  const streamerByOwner = new Map<string, { id: string; data: FirestoreData }>();
  streamerDocsSnap.docs.forEach((doc) => {
    const data = doc.data();
    streamerById.set(doc.id, data);
    if (typeof data.ownerUid === 'string') streamerByOwner.set(data.ownerUid, { id: doc.id, data });
  });

  const salesByOwner = new Map<string, MoneySummary>();
  const salesByStreamer = new Map<string, MoneySummary>();
  const recentSales: SaleRecord[] = [];
  const totals = emptyMoney();
  let failedPayments = 0;

  donationDocsSnap.docs.forEach((doc) => {
    const d = doc.data();
    const status = String(d.status ?? 'unknown');
    const info = parentInfo(doc);
    const grossSen = donationGrossSen(d);
    const feeSen = donationFeeSen(d, grossSen);
    const createdAt = toIso(d.succeededAt ?? d.createdAt ?? d.timestamp);

    if (!isSuccessfulStatus(status)) {
      failedPayments += 1;
      return;
    }

    addMoney(totals, grossSen, feeSen);
    if (!salesByOwner.has(info.ownerId)) salesByOwner.set(info.ownerId, emptyMoney());
    addMoney(salesByOwner.get(info.ownerId)!, grossSen, feeSen);

    if (info.streamerId) {
      if (!salesByStreamer.has(info.streamerId)) salesByStreamer.set(info.streamerId, emptyMoney());
      addMoney(salesByStreamer.get(info.streamerId)!, grossSen, feeSen);
    }

    recentSales.push({
      id: doc.id,
      source: info.source,
      ownerId: info.ownerId,
      streamerId: info.streamerId,
      donorName: String(d.donorName ?? ''),
      packageTitle: (d.packageTitle as string | null) ?? null,
      status,
      grossSen,
      grossFormatted: senToRm(grossSen),
      createdAt,
    });
  });

  const rows = new Map<string, UserRow>();

  authUsers.users.forEach((user) => {
    rows.set(user.uid, {
      userId: user.uid,
      authUid: user.uid,
      email: user.email ?? null,
      role: String(user.customClaims?.role ?? (user.customClaims?.admin ? 'admin' : 'streamer')),
      plan: null,
      accountStatus: user.disabled ? 'disabled' : 'active',
      streamerName: user.displayName ?? user.email ?? user.uid,
      slug: null,
      createdAt: user.metadata.creationTime ? new Date(user.metadata.creationTime).toISOString() : null,
      workspaceId: null,
      sales: addFormatted(emptyMoney()),
    });
  });

  userDocsSnap.docs.forEach((doc) => {
    const d = doc.data();
    const authUid = typeof d.uid === 'string' ? d.uid : typeof d.authUid === 'string' ? d.authUid : null;
    const key = authUid ?? doc.id;
    const existing = rows.get(key);
    const workspace = authUid ? streamerByOwner.get(authUid) : null;
    const sales = emptyMoney();
    const legacySales = salesByOwner.get(doc.id);
    const workspaceSales = workspace ? salesByStreamer.get(workspace.id) : null;

    if (legacySales) {
      sales.grossSen += legacySales.grossSen;
      sales.platformFeeSen += legacySales.platformFeeSen;
      sales.netBeforeProcessingSen += legacySales.netBeforeProcessingSen;
      sales.paymentCount += legacySales.paymentCount;
    }
    if (workspaceSales) {
      sales.grossSen += workspaceSales.grossSen;
      sales.platformFeeSen += workspaceSales.platformFeeSen;
      sales.netBeforeProcessingSen += workspaceSales.netBeforeProcessingSen;
      sales.paymentCount += workspaceSales.paymentCount;
    }

    rows.set(key, {
      userId: doc.id,
      authUid,
      email: (d.email as string | null) ?? existing?.email ?? null,
      role: String(d.role ?? existing?.role ?? 'streamer'),
      plan: (d.plan as string | null) ?? existing?.plan ?? null,
      accountStatus: (d.accountStatus as string | null) ?? existing?.accountStatus ?? null,
      streamerName: String(d.streamerName ?? d.name ?? d.displayName ?? workspace?.data.displayName ?? existing?.streamerName ?? doc.id),
      slug: (d.slug as string | null) ?? (workspace?.data.slug as string | null) ?? null,
      createdAt: toIso(d.createdAt) ?? existing?.createdAt ?? null,
      workspaceId: workspace?.id ?? null,
      sales: addFormatted(sales),
    });
  });

  streamerByOwner.forEach((workspace, ownerUid) => {
    if (rows.has(ownerUid)) return;
    const sales = salesByStreamer.get(workspace.id) ?? emptyMoney();
    rows.set(ownerUid, {
      userId: ownerUid,
      authUid: ownerUid,
      email: null,
      role: 'streamer',
      plan: null,
      accountStatus: String(workspace.data.status ?? 'draft'),
      streamerName: String(workspace.data.displayName ?? ownerUid),
      slug: (workspace.data.slug as string | null) ?? null,
      createdAt: toIso(workspace.data.createdAt),
      workspaceId: workspace.id,
      sales: addFormatted(sales),
    });
  });

  // Array.from rather than spreading the iterator: the build's TS target
  // doesn't enable downlevelIteration, so [...map.values()] fails to compile.
  const users = Array.from(rows.values()).sort((a, b) => b.sales.grossSen - a.sales.grossSen);
  recentSales.sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? ''));

  return NextResponse.json({
    success: true,
    summary: {
      totalAuthUsers: authUsers.users.length,
      totalUserDocs: userDocsSnap.size,
      totalStreamers: streamerDocsSnap.size,
      failedPayments,
      ...addFormatted(totals),
    },
    users,
    recentSales: recentSales.slice(0, 12),
    roles: ['admin', 'streamer', 'viewer'],
  });
});
