// The DISPO OPS -> hub sync end to end on the emulators: a deal saved in Firestore runs the real Cloud Function, which
// signs and sends it to a stand-in hub on HUB_URL; the stand-in runs the hub's own sync rules (api/_lib/dispoops.js
// from a checkout of the hub next to this repo, HUB_DIR) and keeps the hub tasks in memory. Made-up deals only.
//   HUB_SYNC_ENABLED=true in functions/.env.local, then:
//   firebase emulators:exec --project demo-dispo-ops "node tests/hubsync.mjs"
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { admin, clearFirestore, APP_ID, HERE, ROOT } from './harness.mjs';

const HUB_DIR = process.env.HUB_DIR || path.resolve(ROOT, '..', 'hub');
const { applyDispo } = createRequire(import.meta.url)(path.join(HUB_DIR, 'api/_lib/dispoops.js'));
const SECRET = (fs.readFileSync(path.join(ROOT, 'functions/.secret.local'), 'utf8').match(/HUB_SYNC_SECRET=(.*)/) || [])[1].trim();
const people = { 'carlos@totalchb.com': { name: 'Carlos Test' }, 'monz@totalchb.com': { name: 'Monz Test' }, 'sara@totalchb.com': { name: 'Sara Test' }, 'moe@totalchb.com': { name: 'Moe Test' }, 'yanna@totalchb.com': { name: 'Yanna Test' }, 'chris@totalchb.com': { name: 'Chris Test' } };
const tasks = {}, links = {}, calls = [];
const hub = http.createServer((req, res) => { let body = ''; req.on('data', c => body += c); req.on('end', () => {
  const want = 'sha256=' + crypto.createHmac('sha256', SECRET).update(req.headers['x-hub-timestamp'] + '.' + body).digest('hex');
  if (req.url !== '/api/dispo-ops' || req.headers['x-hub-signature'] !== want) { res.statusCode = 401; return res.end('{}'); }
  const p = JSON.parse(body), id = p.deal.id; calls.push(id);
  const r = applyDispo(tasks[id] || null, links[id] || null, p, { now: Date.now(), owner: { key: 'carlos@totalchb.com', name: 'Carlos Test' }, people });
  if (r.task) tasks[id] = r.task; if (r.created || r.task || r.removed) links[id] = { ...(links[id] || {}), created: true, ...(r.removed ? { removed: true } : {}) };
  res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}');
}); });

let fails = 0;
const step = async (name, fn) => { try { await fn(); console.log('ok  ', name); } catch (e) { fails++; console.log('FAIL', name, '-', e.message); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const until = async (f, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await f(); if (v) return v; await new Promise(r => setTimeout(r, 250)); } return null; };

async function main() {
  await clearFirestore();
  await new Promise(r => hub.listen(5399, '127.0.0.1', r));
  const db = admin().firestore(), base = `artifacts/${APP_ID}/public/data/properties`;
  const { newDeal } = await import('../js/logic.js'), { DEFAULT_SOP } = await import('../js/sop-default.js');
  const d = newDeal(DEFAULT_SOP, '100 Test Lane', 'Wholesale', null, Date.now());
  await step('a deployed deal becomes "DISPO OPS - <address>" with one subtask per phase', async () => {
    await db.doc(`${base}/${d.id}`).set(d);
    const t = await until(() => tasks[d.id]); assert(t, 'no hub task');
    assert(t.title === 'DISPO OPS - 100 Test Lane', 'title: ' + t.title); assert(t.ext.percent === 0, 'percent ' + t.ext.percent);
    assert(t.subs.length === 3, 'phases: ' + t.subs.length);
    assert(t.subs[0].title === 'Phase I: Deal Intake · 0%\nStarts With: Underwriting › Next: Manually UW The Deal', 'phase I: ' + JSON.stringify(t.subs[0].title));
    assert(t.subs[0].owner === 'Carlos Test', 'owner ' + t.subs[0].owner);
  });
  await step('progress moves the % , the group being worked on, its next task and the owner', async () => {
    ['Manually UW The Deal', 'AI UW Tool To Confirm Manual UW', 'Intake Call with Seller'].forEach(n => { d.tasks.find(t => t.title === n).completed = true; });
    const ca = d.tasks.find(t => t.title === 'Confirming Access'); ca.subtasks = [{ id: 'sub_1', title: 'Get Lockbox Code', completed: false }];
    await db.doc(`${base}/${d.id}`).set(d);
    const t = await until(() => tasks[d.id] && tasks[d.id].ext.percent === 12 && tasks[d.id]); assert(t, 'percent did not follow: ' + (tasks[d.id] || {}).ext?.percent);
    assert(t.subs[0].title === 'Phase I: Deal Intake · 60%\nWorking On: TC Prep › Next: Confirming Access', 'phase I: ' + JSON.stringify(t.subs[0].title));
    assert(t.subs[0].owner === 'Monz Test' && t.subs[0].status === 'progress', 'owner/status ' + t.subs[0].owner + '/' + t.subs[0].status);
    assert(t.subs[1].title.startsWith('Phase II: Marketing Prep · 0%\nStarts With: Pull Local Hyper Qualified Buyers › Next: At least 3 Local Investors'), 'phase II: ' + JSON.stringify(t.subs[1].title));
    fs.mkdirSync(path.join(HERE, 'out'), { recursive: true }); fs.writeFileSync(path.join(HERE, 'out', 'hub-task.json'), JSON.stringify(t, null, 1));
  });
  await step('closed and cancelled deals that were never sent get no hub task', async () => {
    const c = newDeal(DEFAULT_SOP, '200 Sample Ave', 'Novation', null, Date.now()); c.status = 'closed';
    const x = newDeal(DEFAULT_SOP, '300 Demo Rd', 'Creative', null, Date.now()); x.status = 'cancelled';
    await db.doc(`${base}/${c.id}`).set(c); await db.doc(`${base}/${x.id}`).set(x);
    await new Promise(r => setTimeout(r, 4000));
    assert(!calls.includes(c.id) && !calls.includes(x.id), 'a closed or cancelled deal was sent');
  });
  await step('closing a deal that has a hub task marks every phase Done', async () => {
    d.status = 'closed'; await db.doc(`${base}/${d.id}`).set(d);
    const t = await until(() => tasks[d.id] && tasks[d.id].done && tasks[d.id]); assert(t && t.subs.every(s => s.done), 'not done');
  });
  console.log(`\n${4 - fails} passed, ${fails} failed`);
  hub.close(); process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
