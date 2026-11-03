// Test harness for DISPO OPS: serves a copy of the site locally, points it at the Firebase emulators (never the real
// project), signs in made-up @totalchb.com accounts, and reads back what the page saved. Dev only; not deployed.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const PROJECT = 'demo-dispo-ops';           // "demo-" projects can only ever talk to emulators
export const APP_ID = 'tchb-dispo-ops';
const FB_DIR = path.join(HERE, 'node_modules', 'firebase');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

export function chromium() { return require('playwright').chromium; }

/** Serve a folder (the site) on a local port; `transform(url, body)` may rewrite text files (used for the old page). */
export function serve(dir, port, transform = null) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(dir, p);
    if (!f.startsWith(dir)) { res.statusCode = 403; return res.end(); }
    fs.readFile(f, (err, data) => {
      if (err) { res.statusCode = 404; return res.end('not found'); }
      const type = TYPES[path.extname(f)] || 'application/octet-stream';
      let body = data;
      if (transform && /text|javascript|json/.test(type)) body = transform(p, data.toString('utf8'));
      res.setHeader('Content-Type', type); res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Date', new Date().toUTCString());
      res.end(body);
    });
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}

/** Route the Firebase CDN to the identical npm files, and block every real Google / Firebase server. */
export async function wireNetwork(page, { log } = {}) {
  await page.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/')) {
      const file = path.join(FB_DIR, path.basename(u.pathname));
      if (fs.existsSync(file)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(file) });
      return route.abort();
    }
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return route.continue();
    if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') return route.continue();
    if (log) log('blocked ' + u.hostname);
    return route.abort();
  });
}

/** The current (pre-revamp) page has no emulator switch: add one to a served copy, test runs only. */
export function patchOldPage(p, text) {
  if (p !== '/index.html') return text;
  return text
    .replace('import { getAuth, signInWithPopup,', 'import { connectAuthEmulator, signInWithCredential, getAuth, signInWithPopup,')
    .replace('import { getFirestore,', 'import { connectFirestoreEmulator, getFirestore,')
    .replace('db = getFirestore(app);', `db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
              connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
              window.__testSignIn = (email) => signInWithCredential(firebaseAuth, GoogleAuthProvider.credential(JSON.stringify({ sub: 'u-' + email.split('@')[0], email, email_verified: true })));`)
    .replace('projectId: "dispo-ops"', `projectId: "${PROJECT}"`)
    .replace('try { await enableIndexedDbPersistence(db); } catch (err) {}', '');
}

/** Admin access to the emulators (made-up data only). */
export function admin() {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';
  const a = require('firebase-admin');
  if (!a.apps.length) a.initializeApp({ projectId: PROJECT, storageBucket: PROJECT + '.appspot.com' });
  return a;
}

export async function clearFirestore() {
  const r = await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  if (!r.ok) throw new Error('could not clear the Firestore emulator');
}

/** Every document under artifacts/<appId>/, as { path: data }. */
export async function dump() {
  const db = admin().firestore(), out = {};
  const walk = async ref => {
    for (const col of await ref.listCollections()) {
      for (const d of await col.listDocuments()) {
        const s = await d.get(); if (s.exists) out[d.path] = s.data();
        await walk(d);
      }
    }
  };
  await walk(db.doc('artifacts/' + APP_ID));
  return out;
}

/** The "shape" of a value: field names and types, arrays merged across items, so two runs can be compared. */
export function shape(v) {
  if (Array.isArray(v)) { const m = {}; v.forEach(x => mergeShape(m, shape(x))); return v.length ? [m] : []; }
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, shape(v[k])]));
  return v === null ? 'null' : typeof v;
}
function mergeShape(into, s) {
  if (typeof s !== 'object' || s === null || Array.isArray(s)) { into.__leaf = [...new Set([...(into.__leaf || []), JSON.stringify(s)])].sort(); return; }
  for (const [k, v] of Object.entries(s)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) { into[k] = into[k] && typeof into[k] === 'object' && !Array.isArray(into[k]) ? into[k] : {}; mergeShape(into[k], v); }
    else into[k] = into[k] === undefined || JSON.stringify(into[k]) === JSON.stringify(v) ? v : [...new Set([].concat(into[k], v).map(x => JSON.stringify(x)))].map(x => JSON.parse(x));
  }
}

export async function signIn(page, email) {
  await page.waitForFunction(() => typeof window.__testSignIn === 'function', null, { timeout: 20000 });
  await page.evaluate(e => window.__testSignIn(e), email);
}
