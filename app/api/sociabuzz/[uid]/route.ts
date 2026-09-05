import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { extractGamesFromPackage, extractLevelInfo } from '../../../../lib/donation';
import { getGameDefinition } from '../../../../lib/games';
import {
  admitPaidViewer,
  convertAmountToGames,
  ensurePackageExists,
  formatOrderDate,
  getActiveGame,
  getFeatures,
  getRates,
  getWebhookToken,
  logAlbumComment,
  logDonation,
} from '../../../../lib/admin/webhook-repo';

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

/** Length-safe, constant-time token comparison. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

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

    // ─── Token verification (REQUIRED) ──────────────────────────────────
    // A forged POST here mints game credits, so an unverified request is
    // never processed. A streamer with no token saved cannot receive
    // donations until they set one in Dashboard → Webhook.
    const savedToken = await getWebhookToken(uid);
    if (!savedToken) {
      console.error(`[Sociabuzz/${uid}] ✗ Rejected — no webhook token configured`);
      return NextResponse.json(
        { success: false, error: 'Webhook token not configured for this streamer' },
        { status: 401 },
      );
    }

    const bodyToken = typeof body.token === 'string' ? body.token : null;
    const incomingToken = getIncomingToken(req) ?? bodyToken;
    if (!incomingToken || !safeEqual(incomingToken, savedToken)) {
      console.error(`[Sociabuzz/${uid}] ✗ Rejected — invalid webhook token`);
      return NextResponse.json(
        { success: false, error: 'Invalid webhook token' },
        { status: 401 },
      );
    }
    console.log(`[Sociabuzz/${uid}] ✓ Token verified`);

    const donation = extractDonation(body);
    if (!donation) {
      console.warn(`[Sociabuzz/${uid}] ✗ Could not extract donation`);
      return NextResponse.json({ success: true, warning: 'Could not parse payload' });
    }

    const { transactionId, donorName, amount, message, createdAt, levelTitle } = donation;
    console.log(`[Sociabuzz/${uid}] → donor: "${donorName}", amount: ${amount}, message: "${message}", level: "${levelTitle}"`);

    const [rates, featureSettings, activeGame] = await Promise.all([
      getRates(uid), getFeatures(uid), getActiveGame(uid),
    ]);
    const gameDef = getGameDefinition(activeGame);

    // Comment Album detection — ML only
    const albumMatch = (activeGame === 'ml' && featureSettings.commentAlbum)
      ? message.match(/^ALBUM:\s*(\d+)\s+(.+)/i)
      : null;

    if (albumMatch) {
      const gameId = albumMatch[1].trim();
      const albumIgn = albumMatch[2].trim();
      await logAlbumComment(uid, { donorName, gameId, ign: albumIgn, amount, message });
      console.log(`[Sociabuzz/${uid}] ✓ Album comment saved`);
      return NextResponse.json({ success: true, type: 'comment_album', donorName, gameId, ign: albumIgn });
    }

    // Parse player ID + IGN from message, using this streamer's active game's parser
    const parsed = gameDef.parseMessage(message);
    if (!parsed || !parsed.player_id) {
      // A support/donation without valid mabar player details is still a
      // successful donation. It is logged for alerts and reporting but must
      // never create or update a queue entry.
      console.log(`[Sociabuzz/${uid}] ✓ Donation only — no queue entry requested`);
      await logDonation(uid, {
        donorName, amount, ign: null, playerId: null, gamesAdded: 0,
        message, transactionId, packageTitle: levelTitle,
        status: 'donation_only', game: activeGame,
      });
      return NextResponse.json({
        success: true, type: 'donation', queued: false,
      });
    }

    const { player_id, ign: parsedIgn } = parsed;
    const ign = parsedIgn || donorName;

    // ─── Dynamic Package Detection ─────────────────────────────────────
    // Extract full level info from webhook body
    const levelInfo = extractLevelInfo(body);
    let games: number | null = null;
    let gameSource = 'amount';
    let packageTitle: string | null = levelTitle;

    if (levelInfo) {
      // Auto-create or fetch existing package
      const pkg = await ensurePackageExists(
        uid,
        levelInfo.title,
        levelInfo.price || amount,
        levelInfo.description,
      );

      packageTitle = levelInfo.title;

      // Check if package is active
      if (!pkg.isActive) {
        console.warn(`[Sociabuzz/${uid}] ✗ Package "${levelInfo.title}" is disabled`);
        await logDonation(uid, {
          donorName, amount, ign, playerId: player_id, gamesAdded: 0,
          message, transactionId, packageTitle,
          status: 'package_disabled', game: activeGame,
        });
        return NextResponse.json({
          success: true,
          warning: `Package "${levelInfo.title}" is disabled`,
        });
      }

      // Use package matchCount for games
      games = pkg.matchCount;
      gameSource = 'package';
    }

    // Fallback: try extracting from title text, then amount tiers
    if (games === null) {
      games = extractGamesFromPackage(levelTitle);
      if (games !== null) gameSource = 'package_title';
    }
    if (games === null) {
      games = convertAmountToGames(amount, rates);
      gameSource = 'amount';
    }

    if (games === 0) {
      await logDonation(uid, {
        donorName, amount, ign, playerId: player_id, gamesAdded: 0,
        message, transactionId, packageTitle,
        status: 'no_games', game: activeGame,
      });
      return NextResponse.json({ success: true, warning: `Could not determine games for RM${amount}` });
    }

    let orderDate: string;
    try {
      orderDate = createdAt ? formatOrderDate(new Date(createdAt)) : formatOrderDate();
    } catch {
      orderDate = formatOrderDate();
    }

    // Idempotency requires a real, stable key. Sociabuzz payloads normally
    // carry `id`, but if a caller ever omits it, fabricate one so the
    // transaction still has a valid document ID — this request simply won't
    // be deduplicated against a retry, which only affects malformed payloads.
    const idempotencyKey = transactionId || `no-txn-${crypto.randomUUID()}`;

    const admission = await admitPaidViewer({
      uid, username: donorName, ign, games, orderDate,
      playerId: player_id, transactionId: idempotencyKey,
      packageTitle: packageTitle ?? undefined, game: activeGame,
    });

    if (admission.kind === 'duplicate') {
      console.warn(`[Sociabuzz/${uid}] ✗ Duplicate delivery ignored (transaction_id: ${transactionId})`);
      return NextResponse.json({ success: true, warning: 'Duplicate webhook delivery — already processed' });
    }

    await logDonation(uid, {
      donorName, amount, ign, playerId: player_id, gamesAdded: games, gameSource,
      message, transactionId, packageTitle,
      status: 'success', game: activeGame,
    });

    console.log(`[Sociabuzz/${uid}] ✓ ${donorName} → "${ign}" (ML: ${player_id}, ${games} games, pkg: "${packageTitle}")`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    return NextResponse.json({ success: true, donorName, ign, player_id, games, amount, packageTitle, transaction_id: transactionId });

  } catch (error) {
    console.error(`[Sociabuzz/${uid}] ✗ Error:`, error);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 200 });
  }
}
