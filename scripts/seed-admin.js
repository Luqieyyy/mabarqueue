const fs = require('fs');
const path = require('path');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

function loadEnvFile(filename) {
  const fullPath = path.join(process.cwd(), filename);
  if (!fs.existsSync(fullPath)) return;

  const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;

    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function emailToDocId(email) {
  return email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

function initAdmin() {
  loadEnvFile('.env.local');

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL or FIREBASE_ADMIN_PRIVATE_KEY.');
  }

  if (getApps().length === 0) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
}

async function main() {
  initAdmin();

  const auth = getAuth();
  const db = getFirestore();
  const email = process.env.ADMIN_EMAIL || 'admin@gmail.com';
  const password = process.env.ADMIN_PASSWORD || '123456';
  const legacyUserId = emailToDocId(email);

  let user;
  try {
    user = await auth.getUserByEmail(email);
    user = await auth.updateUser(user.uid, {
      password,
      displayName: 'MabarQueue Admin',
      disabled: false,
      emailVerified: true,
    });
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') throw err;
    user = await auth.createUser({
      email,
      password,
      displayName: 'MabarQueue Admin',
      disabled: false,
      emailVerified: true,
    });
  }

  await auth.setCustomUserClaims(user.uid, {
    ...(user.customClaims || {}),
    role: 'admin',
    admin: true,
  });

  const base = {
    uid: user.uid,
    authUid: user.uid,
    email,
    username: legacyUserId,
    displayName: 'MabarQueue Admin',
    name: 'MabarQueue Admin',
    role: 'admin',
    plan: 'internal',
    accountStatus: 'active',
    updatedAt: FieldValue.serverTimestamp(),
  };

  await Promise.all([
    db.collection('users').doc(user.uid).set({
      ...base,
      primaryStreamerId: null,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
    db.collection('users').doc(legacyUserId).set({
      ...base,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
  ]);

  console.log(`Admin ready: ${email}`);
  console.log(`Password: ${password}`);
  console.log(`Auth UID: ${user.uid}`);
  console.log(`Firestore docs: users/${user.uid}, users/${legacyUserId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
