import { NextResponse } from 'next/server';
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

/**
 * GET /api/queue
 *
 * Returns the current queue state as JSON.
 * Useful for external tools, health checks, or custom overlays.
 */
export async function GET() {
  try {
    const [currentSnap, queueSnap] = await Promise.all([
      getDoc(doc(db, 'current', 'active')),
      getDocs(query(collection(db, 'queue'), orderBy('timestamp', 'asc'))),
    ]);

    return NextResponse.json({
      current: currentSnap.exists() ? currentSnap.data() : null,
      queue: queueSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        // Convert Firestore Timestamp to ISO string for JSON serialization
        timestamp: d.data().timestamp?.toDate?.().toISOString() ?? null,
      })),
      totalInQueue: queueSnap.size,
    });
  } catch (error) {
    console.error('[Queue API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
