/**
 * One-time backfill for the multi-game feature (F2).
 *
 * Stamps `game: 'ml'` onto every existing `queue`, `donations`, and `history`
 * document across all streamers, since all data predates the multi-game field
 * and is implicitly Mobile Legends. Without this, the new `where('game', '==', ...)`
 * filters added throughout the app would make all pre-existing data invisible.
 *
 * Safe to re-run — skips any doc that already has a `game` field.
 *
 * Usage:
 *   cd scripts
 *   npm install
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json node backfill-game-field.js
 *
 * (Download a service account key from Firebase Console →
 * Project Settings → Service Accounts → Generate New Private Key.)
 */

const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const COLLECTIONS = ['queue', 'donations', 'history'];
const BATCH_LIMIT = 400; // stay under Firestore's 500-write batch cap

async function backfillUser(uid) {
  let updated = 0;

  for (const colName of COLLECTIONS) {
    const snap = await db.collection('users').doc(uid).collection(colName).get();
    let batch = db.batch();
    let batchCount = 0;

    for (const docSnap of snap.docs) {
      if (docSnap.data().game) continue; // already tagged
      batch.update(docSnap.ref, { game: 'ml' });
      batchCount++;
      updated++;

      if (batchCount === BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) await batch.commit();
  }

  return updated;
}

async function main() {
  const usersSnap = await db.collection('users').get();
  console.log(`Found ${usersSnap.size} streamer(s).`);

  let total = 0;
  for (const userDoc of usersSnap.docs) {
    const updated = await backfillUser(userDoc.id);
    console.log(`  users/${userDoc.id}: stamped game:'ml' on ${updated} doc(s)`);
    total += updated;
  }

  console.log(`Done. ${total} doc(s) updated total.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
