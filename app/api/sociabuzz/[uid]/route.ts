import { NextRequest, NextResponse } from 'next/server';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { parseMessage, extractGamesFromPackage } from '../../../../lib/donation';
import { addPlayerToQueue, formatOrderDate } from '../../../../lib/queue';
import { db } from '../../../../lib/firebase';
import { getRates, getFeatures, getWebhookToken, convertAmountToGames } from '../../../../lib/settings';

// ─── Body Parser ──────────────────────────────────────────────────────────────

async function parseBody(req: NextRequest): Promise<Record<string, unknown>> {
  const contentType = req.headers.get('content-type') ?? '';
  const rawText = await req.text();
  console.log('[Sociabuzz] Raw body:', rawText);

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(rawText);
    const result: Record<string, unknown> = {};
    params.forEach((v, k) => { result[k] = v; });
    return result;
  }

  try {
    return JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    return { _raw: rawText };
  }
}

// ─── Token Verification ───────────────────────────────────────────────────────

function getIncomingToken(req: NextRequest): string | null {
  return (
    req.headers.get('x-callback-token') ??
    req.headers.get('x-sociabuzz-token') ??
    req.headers.get('x-webhook-token') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    null
  );
}

// ─── Payload Extractor ────────────────────────────────────────────────────────

interface ParsedDonation {
  transactionId: string;
  donorName: string;
  amount: number;
  message: string;
  createdAt: string;
  levelTitle: string | null;
}

function extractDonation(body: Record<string, unknown>): ParsedDonation | null {
  let donorName = '';
  let amount = 0;
  let message = '';
  let transactionId = '';
  let createdAt = '';
  let levelTitle: string | null = null;

  const extractLevel = (obj: Record<string, unknown>): string | null => {
    if (obj.level && typeof obj.level === 'object') {
      const level = obj.level as Record<string, unknown>;
      if (level.title) return String(level.title);
    }
    return null;
  };

  const extractMeta = (obj: Record<string, unknown>) => {
    if (obj.id != null) transactionId = String(obj.id);
    if (obj.created_at != null) createdAt = String(obj.created_at);
    const lt = extractLevel(obj);
    if (lt) levelTitle = lt;
  };

  extractMeta(body);

  if (body.supporter != null || body.supporter_name != null) {
    donorName = String(body.supporter ?? body.supporter_name);
    amount = Number(body.price ?? body.amount ?? body.amount_settled ?? 0);
    message = String(body.message ?? '');
  } else if (body.donation && typeof body.donation === 'object') {
    const d = body.donation as Record<string, unknown>;
    extractMeta(d);
    donorName = String(d.donatur_name ?? d.supporter_name ?? d.supporter ?? d.name ?? '');
    amount = Number(d.amount ?? d.price ?? 0);
    message = String(d.message ?? '');
  } else if (body.support && typeof body.support === 'object') {
    const s = body.support as Record<string, unknown>;
    extractMeta(s);
    donorName = String(s.name ?? '');
    amount = Number(s.amount ?? s.price ?? 0);
    message = String(s.message ?? '');
  } else if (body.donor_name != null) {
    donorName = String(body.donor_name);
    amount = Number(body.amount ?? 0);
    message = String(body.message ?? '');
  } else if (body.data && typeof body.data === 'object') {
    const d = body.data as Record<string, unknown>;
    extractMeta(d);
    if (d.supporter_name != null || d.donatur_name != null || d.supporter != null || d.name != null) {
      donorName = String(d.supporter_name ?? d.donatur_name ?? d.supporter ?? d.name ?? '');
      amount = Number(d.amount ?? d.price ?? 0);
      message = String(d.message ?? '');
    } else {
      return null;
    }
  } else if (body.name != null && body.amount != null) {
    donorName = String(body.name);
    amount = Number(body.amount ?? 0);
    message = String(body.message ?? '');
  } else {
    return null;
  }

  if (!donorName) return null;
  return { transactionId, donorName, amount, message, createdAt, levelTitle };
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  return NextResponse.json({ status: 'ok', service: 'MabarQueue webhook', uid });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const timestamp = new Date().toISOString();

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[Sociabuzz/${uid}] Webhook received at ${timestamp}`);

  try {
    const body = await parseBody(req);
    console.log('[Sociabuzz] Body:', JSON.stringify(body, null, 2));

    // Token verification against this user's saved token
    const savedToken = await getWebhookToken(uid);
    if (savedToken) {
      const bodyToken = typeof body.token === 'string' ? body.token : null;
      const incomingToken = getIncomingToken(req) ?? bodyToken;
      if (incomingToken !== savedToken) {
        console.warn(`[Sociabuzz/${uid}] ✗ Token mismatch — processing anyway`);
      } else {
        console.log(`[Sociabuzz/${uid}] ✓ Token verified`);
      }
    }

    const donation = extractDonation(body);
    if (!donation) {
      console.warn(`[Sociabuzz/${uid}] ✗ Could not extract donation`);
      return NextResponse.json({ success: true, warning: 'Could not parse payload' });
    }

    const { transactionId, donorName, amount, message, createdAt, levelTitle } = donation;
    console.log(`[Sociabuzz/${uid}] → donor: "${donorName}", amount: ${amount}, message: "${message}", level: "${levelTitle}"`);

    const [rates, featureSettings] = await Promise.all([getRates(uid), getFeatures(uid)]);

    // Comment Album detection
    const albumMatch = featureSettings.commentAlbum
      ? message.match(/^ALBUM:\s*(\d+)\s+(.+)/i)
      : null;

    if (albumMatch) {
      const gameId = albumMatch[1].trim();
      const albumIgn = albumMatch[2].trim();
      await addDoc(collection(db, 'users', uid, 'comment_album'), {
        donorName, gameId, ign: albumIgn, amount, message, timestamp: serverTimestamp(),
      });
      console.log(`[Sociabuzz/${uid}] ✓ Album comment saved`);
      return NextResponse.json({ success: true, type: 'comment_album', donorName, gameId, ign: albumIgn });
    }

    // Parse ML ID + IGN from message
    const parsed = parseMessage(message);
    if (!parsed || !parsed.player_id) {
      console.warn(`[Sociabuzz/${uid}] ✗ No ML ID in message: "${message}"`);
      await addDoc(collection(db, 'users', uid, 'donations'), {
        donorName, amount, ign: null, player_id: null, gamesAdded: 0,
        message, transaction_id: transactionId, levelTitle,
        status: 'failed_parse', timestamp: serverTimestamp(),
      });
      return NextResponse.json({
        success: true,
        warning: `No ML ID found in message "${message}"`,
      });
    }

    const { player_id, ign: parsedIgn } = parsed;
    const ign = parsedIgn || donorName;

    // Determine games: level.title first, then amount tiers
    let games = extractGamesFromPackage(levelTitle);
    let gameSource = 'package';
    if (games === null) {
      games = convertAmountToGames(amount, rates);
      gameSource = 'amount';
    }

    if (games === 0) {
      return NextResponse.json({ success: true, warning: `Could not determine games for RM${amount}` });
    }

    let orderDate: string;
    try {
      orderDate = createdAt ? formatOrderDate(new Date(createdAt)) : formatOrderDate();
    } catch {
      orderDate = formatOrderDate();
    }

    await Promise.all([
      addPlayerToQueue(uid, donorName, ign, games, orderDate, player_id, transactionId),
      addDoc(collection(db, 'users', uid, 'donations'), {
        donorName, amount, ign, player_id, gamesAdded: games, gameSource,
        message, transaction_id: transactionId, levelTitle,
        status: 'success', timestamp: serverTimestamp(),
      }),
    ]);

    console.log(`[Sociabuzz/${uid}] ✓ ${donorName} → "${ign}" (ML: ${player_id}, ${games} games)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    return NextResponse.json({ success: true, donorName, ign, player_id, games, amount, transaction_id: transactionId });

  } catch (error) {
    console.error(`[Sociabuzz/${uid}] ✗ Error:`, error);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 200 });
  }
}
