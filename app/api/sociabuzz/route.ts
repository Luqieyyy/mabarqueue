import { NextRequest, NextResponse } from 'next/server';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { extractIGN } from '../../../lib/donation';
import { addPlayerToQueue, formatOrderDate } from '../../../lib/queue';
import { db } from '../../../lib/firebase';
import { getRates, getFeatures, convertAmountToGames } from '../../../lib/settings';

// ─── Content-Type Parser ──────────────────────────────────────────────────────

/**
 * Parses the request body based on Content-Type header.
 * Supports:
 *   - application/json
 *   - application/x-www-form-urlencoded
 *   - anything else → attempts JSON, falls back to raw text
 */
async function parseBody(req: NextRequest): Promise<Record<string, unknown>> {
  const contentType = req.headers.get('content-type') ?? '';

  // Clone the request so we can read the body twice if needed
  const rawText = await req.text();

  console.log('[Sociabuzz] Raw body received:');
  console.log(rawText);

  if (contentType.includes('application/x-www-form-urlencoded')) {
    // Parse form-encoded: key=value&key2=value2
    const params = new URLSearchParams(rawText);
    const result: Record<string, unknown> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  // Default: treat as JSON (application/json or unknown)
  try {
    return JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    // If JSON parse fails, return the raw text under a key for inspection
    return { _raw: rawText };
  }
}

// ─── Token Verification ───────────────────────────────────────────────────────

async function getSavedToken(): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'webhook'));
    if (!snap.exists()) return null;
    const token = snap.data().token as string | undefined;
    return token?.trim() || null;
  } catch {
    return null;
  }
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
  donorName: string;
  amount: number;
  message: string;
}

/**
 * Tries to extract donorName, amount, and message from whatever Sociabuzz sends.
 * Handles multiple known payload formats — keeps a loose hand so nothing breaks.
 */
function extractDonation(body: Record<string, unknown>): ParsedDonation | null {
  // Format 1 — Sociabuzz flat:  { supporter_name, price/amount, message }
  if (body.supporter_name != null) {
    return {
      donorName: String(body.supporter_name),
      amount: Number(body.price ?? body.amount ?? 0),
      message: String(body.message ?? ''),
    };
  }

  // Format 2 — nested under "donation": { donatur_name, amount, message }
  if (body.donation && typeof body.donation === 'object') {
    const d = body.donation as Record<string, unknown>;
    return {
      donorName: String(d.donatur_name ?? d.supporter_name ?? d.name ?? ''),
      amount: Number(d.amount ?? d.price ?? 0),
      message: String(d.message ?? ''),
    };
  }

  // Format 3 — nested under "support": { name, amount, message }
  if (body.support && typeof body.support === 'object') {
    const s = body.support as Record<string, unknown>;
    return {
      donorName: String(s.name ?? ''),
      amount: Number(s.amount ?? s.price ?? 0),
      message: String(s.message ?? ''),
    };
  }

  // Format 4 — manual test: { donor_name, amount, message }
  if (body.donor_name != null) {
    return {
      donorName: String(body.donor_name),
      amount: Number(body.amount ?? 0),
      message: String(body.message ?? ''),
    };
  }

  return null;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

/**
 * POST /api/sociabuzz
 *
 * Receives Sociabuzz donation webhooks via ngrok or production.
 *
 * Test with curl:
 *   curl -X POST https://xxxx.ngrok-free.app/api/sociabuzz \
 *     -H "Content-Type: application/json" \
 *     -d '{"donor_name":"Ali123","amount":10,"message":"IGN: AliPro"}'
 *
 * Or form-urlencoded:
 *   curl -X POST https://xxxx.ngrok-free.app/api/sociabuzz \
 *     -d "donor_name=Ali123&amount=10&message=IGN%3A+AliPro"
 */
// Sociabuzz sends GET to verify the endpoint is reachable before sending POST
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'MabarQueue webhook' });
}

export async function POST(req: NextRequest) {
  const timestamp = new Date().toISOString();

  // ── 1. Log all incoming headers (useful for seeing Sociabuzz's auth headers) ──
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`[Sociabuzz] Webhook received at ${timestamp}`);
  console.log('[Sociabuzz] Headers:');
  req.headers.forEach((value, key) => {
    console.log(`  ${key}: ${value}`);
  });

  try {
    // ── 2. Parse body (handles JSON + form-urlencoded) ──
    const body = await parseBody(req);

    console.log('[Sociabuzz] Parsed body:');
    console.log(JSON.stringify(body, null, 2));

    // ── 3. Token verification ──
    const savedToken = await getSavedToken();
    if (savedToken) {
      // Also check body in case Sociabuzz sends token there
      const bodyToken = typeof body.token === 'string' ? body.token : null;
      const incomingToken = getIncomingToken(req) ?? bodyToken;
      console.log(`[Sociabuzz] Token check — expected: ${savedToken}, received: ${incomingToken}`);
      if (incomingToken !== savedToken) {
        // Return 200 so Sociabuzz doesn't mark as failed — log for debugging
        console.warn(`[Sociabuzz] ✗ Token mismatch (incoming: ${incomingToken}) — processing anyway, check Vercel logs`);
      } else {
        console.log('[Sociabuzz] ✓ Token verified');
      }
    } else {
      console.log('[Sociabuzz] No token configured — skipping verification (dev mode)');
    }

    // ── 4. Extract donation data ──
    const donation = extractDonation(body);

    if (!donation) {
      console.warn('[Sociabuzz] ✗ Could not extract donation from payload');
      console.warn('[Sociabuzz] Raw body was:', JSON.stringify(body));
      // Return 200 so Sociabuzz does not retry — we log for manual inspection
      return NextResponse.json({
        success: true,
        warning: 'Payload received but could not be parsed. Check server logs.',
      });
    }

    const { donorName, amount, message } = donation;
    console.log(`[Sociabuzz] Extracted → donorName: "${donorName}", amount: ${amount}, message: "${message}"`);

    // ── 5. Load settings (rates + features) ──
    const [rates, featureSettings] = await Promise.all([getRates(), getFeatures()]);

    // ── 6. Detect Comment Album (if feature is ON) ──
    const albumMatch = featureSettings.commentAlbum
      ? message.match(/^ALBUM:\s*(\d+)\s+(.+)/i)
      : null;

    if (albumMatch) {
      const gameId = albumMatch[1].trim();
      const albumIgn = albumMatch[2].trim();
      console.log(`[Sociabuzz] → Comment Album detected | GameID: "${gameId}" | IGN: "${albumIgn}"`);

      await addDoc(collection(db, 'comment_album'), {
        donorName,
        gameId,
        ign: albumIgn,
        amount,
        message,
        timestamp: serverTimestamp(),
      });

      console.log(`[Sociabuzz] ✓ Album comment from ${donorName} saved`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return NextResponse.json({ success: true, type: 'comment_album', donorName, gameId, ign: albumIgn });
    }

    // ── 7. Normal mabar flow — extract IGN ──
    const ign = extractIGN(message);
    if (!ign) {
      console.warn(`[Sociabuzz] ✗ No IGN found in message: "${message}"`);
      return NextResponse.json({
        success: true,
        warning: `No IGN found in message "${message}". Viewer must include: IGN: TheirIGN`,
      });
    }

    // ── 8. Convert amount to games using saved rates ──
    const games = convertAmountToGames(amount, rates);
    if (games === 0) {
      console.warn(`[Sociabuzz] ✗ Amount RM${amount} below minimum tier`);
      return NextResponse.json({
        success: true,
        warning: `RM${amount} is below minimum donation tier`,
      });
    }

    console.log(`[Sociabuzz] → IGN: "${ign}" | Games: ${games} | Amount: RM${amount}`);

    // ── 9. Add to queue + log donation ──
    await Promise.all([
      addPlayerToQueue(donorName, ign, games, formatOrderDate()),
      addDoc(collection(db, 'donations'), {
        donorName,
        amount,
        ign,
        gamesAdded: games,
        timestamp: serverTimestamp(),
      }),
    ]);

    console.log(`[Sociabuzz] ✓ ${donorName} added to queue as "${ign}" (${games} games)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return NextResponse.json({ success: true, donorName, ign, games, amount });

  } catch (error) {
    console.error('[Sociabuzz] ✗ Unhandled error:', error);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Return 200 even on error so Sociabuzz doesn't keep retrying
    return NextResponse.json(
      { success: false, error: 'Internal server error — check server logs' },
      { status: 200 }
    );
  }
}
