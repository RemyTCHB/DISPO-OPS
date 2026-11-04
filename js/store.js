// DISPO OPS and Firebase (project dispo-ops). Same paths, same document shapes and same sign-in as before the revamp;
// the difference is how a deal is saved: each change is applied to the latest copy of the deal inside a transaction,
// so two people working on one deal no longer overwrite each other.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, connectAuthEmulator, signInWithCredential }
  from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, connectFirestoreEmulator, onSnapshot,
  doc, setDoc, getDoc, updateDoc, deleteDoc, collection, arrayUnion, deleteField, runTransaction, FieldPath }
  from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { edit, legacyFix, isLocked, QUIET, WHEN_LOCKED, EditError } from './logic.js';

// "?emulator" on this computer only: the test harness runs the page against local emulators with made-up data.
export const EMU = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('emulator');
const firebaseConfig = {
  apiKey: 'AIzaSyAd9AdG1Yl65SYscJT_hbqXa4HWzC4ky3k',
  authDomain: 'dispo-ops.firebaseapp.com',
  projectId: EMU ? 'demo-dispo-ops' : 'dispo-ops',
  storageBucket: 'dispo-ops.firebasestorage.app',
  messagingSenderId: '933896335434',
  appId: '1:933896335434:web:1be42c24236eb05155b6b3',
  measurementId: 'G-K5YV8RS58E'
};
const VAPID = 'BAOBgrEDGG_WLKRjNEXU_L2_kHZrWTVFGUxN5gm7Udkkh9p0l2Tc8sTZhErN_dZmpxD-EzjEnNfhYX7R3XHrRhw';
export const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'tchb-dispo-ops';
const DOMAIN = '@totalchb.com';

let app, auth, db, provider, user = null;
export const me = () => user;
export const myPrefix = () => (user && user.email ? user.email.split('@')[0] : 'Agent');   // stored as before (authors, drafts)
const path = (...p) => ['artifacts', APP_ID, ...p];
const dealRef = id => doc(db, ...path('public', 'data', 'properties', id));

// ---------------------------------------------------------------- the hub clock (server time, Eastern)
let clockOffset = 0;
try { clockOffset = +localStorage.getItem('tchb_clock') || 0; } catch (e) {}
export const now = () => Math.round(Date.now() + clockOffset);
export function syncClock() {
  const t0 = Date.now();
  return fetch(location.pathname + '?clock=' + t0, { method: 'HEAD', cache: 'no-store' }).then(r => {
    const d = Date.parse(r.headers.get('date')), t1 = Date.now();
    if (!isNaN(d)) { clockOffset = d + 500 - (t0 + t1) / 2; try { localStorage.setItem('tchb_clock', String(Math.round(clockOffset))); } catch (e) {} }
  }).catch(() => {});
}

// ---------------------------------------------------------------- start, sign in, sign out
export function init({ onUser, onSignedOut, onDenied }) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  let cache;
  try { cache = EMU ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() }); } catch (e) { cache = memoryLocalCache(); }
  db = initializeFirestore(app, { localCache: cache, ignoreUndefinedProperties: true });
  if (EMU) {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    window.__testSignIn = email => signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: 'u-' + email.split('@')[0], email, email_verified: true })));
  }
  provider = new GoogleAuthProvider();
  provider.setCustomParameters({ hd: 'totalchb.com' });
  onAuthStateChanged(auth, async u => {
    if (u && u.email && u.email.endsWith(DOMAIN)) { user = u; onUser(u); }
    else if (u) { await signOut(auth); user = null; onDenied('Access Denied. Only @totalchb.com emails are authorized.'); }
    else { user = null; stopAll(); onSignedOut(); }
  });
}

export async function signIn() {
  if (!auth) throw new Error('Authentication initializing, please wait...');
  const r = await signInWithPopup(auth, provider);
  if (!(r.user.email && r.user.email.endsWith(DOMAIN))) { await signOut(auth); throw new Error('Access Denied. Only @totalchb.com emails are authorized.'); }
}

export async function logOut() {
  if (user && db) { try { await setDoc(doc(db, ...path('public', 'data', 'active_users', user.uid)), { sessions: { [DEVICE]: deleteField() } }, { merge: true }); } catch (e) {} }
  stopAll();
  await signOut(auth);
  location.reload();
}

// ---------------------------------------------------------------- live data
const stops = [];
let presenceTimer = null;
function stopAll() { stops.splice(0).forEach(f => { try { f(); } catch (e) {} }); if (presenceTimer) { clearInterval(presenceTimer); presenceTimer = null; } }
const keep = unsub => { stops.push(unsub); return unsub; };

export function listenDeals(cb, onErr) {
  return keep(onSnapshot(collection(db, ...path('public', 'data', 'properties')), snap => {
    const deals = [];
    snap.forEach(d => deals.push(legacyFix(d.data())));
    cb(deals, snap.docChanges().map(c => c.doc.id), snap.metadata.fromCache);
  }, err => onErr && onErr(err)));
}

export function listenNotifications(cb) {
  let first = true;
  return keep(onSnapshot(collection(db, ...path('users', user.uid, 'notifications')), snap => {
    const added = [];
    snap.docChanges().forEach(c => { if (c.type === 'added') added.push(c.doc.data()); });
    const list = []; snap.forEach(d => list.push({ ...d.data(), id: d.id }));
    list.sort((a, b) => b.createdAt - a.createdAt);
    cb(list, first ? [] : added); first = false;
  }));
}

// New settings documents: the SOP (edited by Carlos and Systems) and the team copied from the hub.
export function listenSettings(cb) {
  keep(onSnapshot(doc(db, ...path('public', 'data', 'settings', 'sop')), s => cb('sop', s.exists() ? s.data() : null), () => cb('sop', null)));
  keep(onSnapshot(doc(db, ...path('public', 'data', 'settings', 'directory')), s => cb('directory', s.exists() ? s.data() : null), () => cb('directory', null)));
}

// ---------------------------------------------------------------- who's online (as before)
let DEVICE = 'dev_fallback';
try {
  DEVICE = localStorage.getItem('tchb_device_id');
  if (!DEVICE) { DEVICE = 'dev_' + Date.now() + Math.random().toString(36).substr(2, 9); localStorage.setItem('tchb_device_id', DEVICE); }
} catch (e) {}
export function startPresence(cb) {
  const type = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop';
  const beat = () => { if (user && db) setDoc(doc(db, ...path('public', 'data', 'active_users', user.uid)), { email: user.email, sessions: { [DEVICE]: { lastActive: Date.now(), type } } }, { merge: true }).catch(() => {}); };
  beat(); presenceTimer = setInterval(beat, 60000);
  keep(onSnapshot(collection(db, ...path('public', 'data', 'active_users')), snap => {
    const list = [], t = Date.now();
    snap.forEach(d => { const v = d.data(); if (v.sessions && Object.values(v.sessions).some(s => t - s.lastActive < 300000)) list.push(v); });
    cb(list);
  }));
}

// ---------------------------------------------------------------- saving (Saving... / Not Saved + Retry)
const sync = { pending: 0, failed: [], listeners: new Set() };
export const onSync = f => { sync.listeners.add(f); f(syncState()); };
const syncState = () => ({ state: sync.failed.length ? 'unsaved' : sync.pending ? 'saving' : navigator.onLine === false ? 'offline' : 'ready',
  error: sync.failed.length ? sync.failed[sync.failed.length - 1].message : '' });
const tell = () => sync.listeners.forEach(f => f(syncState()));
window.addEventListener('online', tell); window.addEventListener('offline', tell);
async function tracked(job, retry) {
  sync.pending++; tell();
  try { return await job(); }
  catch (e) {
    if (!(e instanceof EditError) && retry) sync.failed.push({ retry, message: e.code === 'permission-denied' ? 'You do not have permission for that change.' : (e.message || 'Could not save') });
    throw e;
  } finally { sync.pending--; tell(); }
}
export async function retryFailed() {
  const jobs = sync.failed.splice(0); tell();
  for (const j of jobs) { try { await j.retry(); } catch (e) {} }
}

const ctx = () => ({ now: now(), me: myPrefix(), name: displayName() });
let displayName = () => myPrefix();
export const setNameResolver = f => { displayName = f; };

/** Apply one named change (see logic.js `edit`) to the latest copy of a deal, in a transaction. */
export function mutate(dealId, name, args = []) {
  const run = () => tracked(() => runTransaction(db, async tx => {
    const ref = dealRef(dealId), snap = await tx.get(ref);
    if (!snap.exists()) throw new EditError('This deal was removed from the pipeline.');
    const d = legacyFix(snap.data());
    if (isLocked(d) && !WHEN_LOCKED.has(name)) throw new EditError('This deal is ' + (d.status === 'closed' ? 'Closed' : 'Cancelled') + '. Reopen it to make changes.');
    const x = ctx(), result = edit[name](d, x, ...args);
    if (result === false) return { changed: false };
    if (!QUIET.has(name)) { d.dateLastEdited = x.now; d.lastEditedBy = user.uid; d.lastEditedByName = user.email.split('@')[0]; }
    tx.set(ref, d);
    return { changed: true, result };
  }), run);
  return run();
}

/** Opening a deal's chat records when you read it (as before, without touching "Time Last Edited"). */
export function markChatRead(dealId) {
  return updateDoc(dealRef(dealId), new FieldPath('readBy', myPrefix().toLowerCase()), Date.now()).catch(() => {});
}

export function createDeal(deal) {
  const run = () => tracked(() => setDoc(dealRef(deal.id), { ...deal, lastEditedBy: user.uid, lastEditedByName: user.email.split('@')[0] }), run);
  return run();
}
export function removeDeal(id) { return tracked(() => deleteDoc(dealRef(id))); }

export function saveSop(strategies) {
  return tracked(() => setDoc(doc(db, ...path('public', 'data', 'settings', 'sop')), { strategies, version: now(), updatedAt: now(), updatedBy: displayName() }));
}

// ---------------------------------------------------------------- notifications and preferences (as before)
const notifRef = id => doc(db, ...path('users', user.uid, 'notifications', id));
export const markNotificationsRead = ids => ids.forEach(id => updateDoc(notifRef(id), { read: true }).catch(e => console.warn(e.code)));
export const deleteNotifications = ids => ids.forEach(id => deleteDoc(notifRef(id)).catch(e => console.warn(e.code)));

export function defaultPrefs(email) {
  const mail = (email || '').toLowerCase();
  const dispoAgents = ['carlos@totalchb.com', 'yanna@totalchb.com', 'moe@totalchb.com', 'sara@totalchb.com', 'sarah@totalchb.com'];
  const tcAgents = ['monz@totalchb.com', 'chris@totalchb.com'];
  const admins = ['brandy@totalchb.com', 'luke@totalchb.com', 'info@totalchb.com'];
  const superAdmin = ['systems@totalchb.com'];
  if (superAdmin.includes(mail)) return { comments: false, new_assets: false, completions_phase: false, completions_task: false, completions_subtask: false, drafts_links: false, task_turns: false, daily_brief: false, reminders: false, reminder_interval: '4' };
  if (admins.includes(mail)) return { comments: true, new_assets: true, completions_phase: true, completions_task: true, completions_subtask: false, drafts_links: true, task_turns: false, daily_brief: false, reminders: false, reminder_interval: '4' };
  if (dispoAgents.includes(mail) || tcAgents.includes(mail)) return { comments: true, new_assets: true, completions_phase: true, completions_task: true, completions_subtask: true, drafts_links: true, task_turns: true, daily_brief: true, reminders: true, reminder_interval: '4' };
  return { comments: true, new_assets: true, completions_phase: true, completions_task: true, completions_subtask: false, drafts_links: true, task_turns: false, daily_brief: false, reminders: false, reminder_interval: '4' };
}
const prefsRef = () => doc(db, ...path('public', 'data', 'user_preferences', user.uid));
export async function loadPrefs() {
  const snap = await getDoc(prefsRef()), defaults = defaultPrefs(user.email);
  if (snap.exists()) return { ...defaults, ...snap.data() };
  await setDoc(prefsRef(), { email: user.email, ...defaults, updatedAt: Date.now() });
  return defaults;
}
export const savePrefs = p => tracked(() => setDoc(prefsRef(), { email: user.email, ...p, updatedAt: Date.now() }, { merge: true }));
export async function resetPrefs() { const d = defaultPrefs(user.email); await setDoc(prefsRef(), { email: user.email, ...d, updatedAt: Date.now() }, { merge: true }); return d; }
export const wipeDevices = () => setDoc(prefsRef(), { fcmTokens: [] }, { merge: true });

// Push: the same service worker and key as before; while the app is open, a push shows as a toast.
let messaging = null, msgMod = null;
export async function startMessaging(onForeground) {
  try {
    msgMod = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging.js');
    messaging = msgMod.getMessaging(app);
    msgMod.onMessage(messaging, p => onForeground(p.notification && p.notification.title, p.notification && p.notification.body));
  } catch (e) { messaging = null; }
}
export async function enablePush() {
  if (!messaging || !msgMod) return false;
  try {
    const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
    await registration.update();
    if (await Notification.requestPermission() !== 'granted') return false;
    const token = await msgMod.getToken(messaging, { vapidKey: VAPID, serviceWorkerRegistration: registration });
    if (!token) return false;
    await setDoc(prefsRef(), { fcmTokens: arrayUnion(token) }, { merge: true });
    return true;
  } catch (e) { return false; }
}

// ---------------------------------------------------------------- files (new: Firebase Storage, files/<deal>/<id>-<name>)
export const MAX_FILE = 25 * 1024 * 1024;
let storageMod = null;
const storage = async () => {
  storageMod = storageMod || await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js');
  const s = storageMod.getStorage(app);
  if (EMU && !s.__emu) { storageMod.connectStorageEmulator(s, '127.0.0.1', 9199); s.__emu = true; }
  return s;
};
export async function uploadFile(dealId, file) {
  if (file.size > MAX_FILE) throw new EditError(`${file.name} is over 25 MB.`);
  const s = await storage(), id = 'file_' + now() + Math.random().toString(36).substr(2, 5);
  const p = `files/${dealId}/${id}-${file.name.replace(/[/\\#?\[\]*]/g, '_')}`;
  const r = storageMod.ref(s, p);
  await tracked(() => storageMod.uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' }));
  return { id, kind: 'file', name: file.name, url: await storageMod.getDownloadURL(r), path: p, size: file.size, type: file.type || '' };
}
export async function deleteStoredFile(p) { if (!p) return; try { const s = await storage(); await storageMod.deleteObject(storageMod.ref(s, p)); } catch (e) {} }

// ---------------------------------------------------------------- server functions (Cloud Functions, callable)
let fnMod = null;
export async function callFunction(name, data = {}) {
  fnMod = fnMod || await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js');
  const f = fnMod.getFunctions(app, 'us-central1');
  if (EMU && !f.__emu) { fnMod.connectFunctionsEmulator(f, '127.0.0.1', 5001); f.__emu = true; }
  return (await tracked(() => fnMod.httpsCallable(f, name)(data))).data;
}
