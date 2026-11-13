// Every action from the Build Map, clicked through the real buttons, against the emulators (Auth, Firestore,
// Functions, Storage) with made-up people and deals. A fake hub answers the team request (signature checked).
//   firebase emulators:exec "node tests/e2e.mjs"
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { chromium, serve, wireNetwork, clearFirestore, signIn, ROOT, HERE, admin, APP_ID } from './harness.mjs';
import { seed } from './look.mjs';

const PORT = 5330, HUB_PORT = 5399, SECRET = 'test-only-secret';
const P = `artifacts/${APP_ID}/public/data`;
const results = [], errors = [];
const db = () => admin().firestore();
const getDeal = async addr => { const s = await db().collection(`${P}/properties`).where('address', '==', addr).get(); return s.empty ? null : s.docs[0].data(); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000) { const t = Date.now(); let v; while (Date.now() - t < ms) { try { v = await fn(); if (v) return v; } catch (e) {} await sleep(150); } return v; }
const pages = [];
async function step(name, fn) {
  try { await fn(); results.push(['ok', name]); console.log('ok  ', name); }
  catch (e) { const w = (/waiting for (.*)/.exec(e.message) || [])[1]; results.push(['FAIL', name, e.message]); console.log('FAIL', name, '-', e.message.split('\n')[0] + (w ? ' [waiting for ' + w.replace(/\x1b\[[0-9;]*m/g, '') + ']' : '')); }
  finally { for (const p of pages) { try { await p.evaluate(() => { const D = window.__dispo; D.S.menu = null; D.S.modal = null; D.render(); }); } catch (e) {} } }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

// fake hub: POST /api/title-agent/team, signed with the shared secret
const hubCalls = [];
const hub = http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const ts = req.headers['x-hub-timestamp'], sig = req.headers['x-hub-signature'];
    const want = 'sha256=' + crypto.createHmac('sha256', SECRET).update(ts + '.' + body).digest('hex');
    hubCalls.push({ url: req.url, ok: sig === want, body });
    if (sig !== want) { res.statusCode = 401; return res.end('{}'); }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ people: [
      { name: 'Brandy Hub', email: 'brandy@totalchb.com', role: 'manager', dept: '', photo: '' }, { name: 'Remy Hub', email: 'systems@totalchb.com', role: 'manager', dept: '', photo: '' },
      { name: 'Monz Hub', email: 'monz@totalchb.com', role: 'lead', dept: 'TC', photo: '' }, { name: 'Carlos Hub', email: 'carlos@totalchb.com', role: 'lead', dept: 'DISPO', photo: '' },
      { name: 'Moe Hub', email: 'moe@totalchb.com', role: 'member', dept: 'DISPO', photo: '' }, { name: 'Sara Hub', email: 'sara@totalchb.com', role: 'member', dept: 'DISPO', photo: '' },
      { name: 'Jess Hub', email: 'jess@totalchb.com', role: 'member', dept: 'ACQ', photo: '' }] }));
  });
});

async function open(browser, email, { phone = false, theme = 'light' } = {}) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme } : { viewport: { width: 1360, height: 900 }, colorScheme: theme });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${email}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/net::|favicon|Failed to load resource/.test(m.text())) errors.push(`${email}: ${m.text()}`); });
  page.on('dialog', d => d.dismiss());
  await wireNetwork(page);
  await page.goto(`http://127.0.0.1:${PORT}/?emulator`);
  await signIn(page, email);
  await page.waitForSelector('[data-app-ready]', { timeout: 20000 });
  await page.waitForTimeout(1200);
  pages.push(page);
  return page;
}
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const count = async (page, sel, n) => { const t = Date.now(); let c; while (Date.now() - t < 5000) { await settle(page); c = await page.locator(sel).count(); if (c === n) return true; await page.waitForTimeout(100); } return false; };
const openDeal = async (page, addr) => {
  await page.evaluate(() => { const D = window.__dispo; D.S.view.status = 'open'; D.S.view.strategy = 'All'; D.S.tab = 'dashboard'; D.S.chat.open = false; D.render(); });
  await settle(page);
  const st = await page.evaluate(a => { const d = [...window.__dispo.S.saved.values()].find(x => x.address === a); return d && d.status; }, addr);
  if (st) { await page.click(`[data-act="view"][data-v="${st}"]`); await settle(page); }
  await page.click(`tr:has-text("${addr}")`); await page.waitForSelector(`#tracker-address:has-text("${addr}")`); };
const details = async (page, scope, part) => { await scope.locator('[data-act="details"]:not([data-part])').first().click(); await page.click(`[data-act="detailsPart"][data-v="${part}"]`); await settle(page); };
const status = async (page, row, label) => { await row.locator('.status-pill').click(); await page.click(`.menu .mi:has-text("${label}")`); await page.waitForTimeout(200); };
const menuPick = async (page, text) => { await page.click(`.menu .mi:has-text("${text}")`); await page.waitForTimeout(200); };

async function main() {
  await clearFirestore();
  await seed();
  await new Promise(r => hub.listen(HUB_PORT, '127.0.0.1', r));
  const srv = await serve(ROOT, PORT);
  const browser = await chromium().launch();
  const carlos = await open(browser, 'carlos@totalchb.com');
  const moe = await open(browser, 'moe@totalchb.com');

  await step('dashboard: Open / Closed / Cancelled views and counts', async () => {
    await carlos.click('[data-act="view"][data-v="closed"]'); assert(await count(carlos, 'tr:has-text("400 Fake Ct")', 1), 'closed deal not in Closed view');
    await carlos.click('[data-act="view"][data-v="cancelled"]'); assert(await count(carlos, '.empty', 1), 'Cancelled view should be empty');
    await carlos.click('[data-act="view"][data-v="open"]'); assert(await count(carlos, 'tbody tr', 4), 'Open view should list 4 deals');
  });
  await step('dashboard: strategy filter and Due Soonest sort', async () => {
    await carlos.click('[data-menu="strategyFilter"]'); await menuPick(carlos, 'Wholesale');
    assert(await count(carlos, 'tbody tr', 2), 'Wholesale filter should show 2');
    await carlos.click('[data-menu="strategyFilter"]'); await menuPick(carlos, 'All Strategies');
    await carlos.click('[data-menu="sort"]'); await menuPick(carlos, 'Due Soonest'); await settle(carlos);
    assert((await carlos.locator('tbody tr').first().innerText()).includes('100 Test Lane'), 'deal with a due date should sort first');
    await carlos.click('[data-menu="sort"]'); await menuPick(carlos, 'Recently Edited');
  });
  await step('deploy a Fix & Flip deal with a SOW CSV', async () => {
    await carlos.click('[data-act="openDeploy"] >> nth=0');
    await carlos.fill('#deployAddress', '700 E2E Way');
    await carlos.click('[data-menu="deployStrategy"]'); await menuPick(carlos, 'Fix & Flip');
    await carlos.setInputFiles('[data-change="deployCsv"]', { name: 'sow.csv', mimeType: 'text/csv', buffer: Buffer.from('Task,Detail,Cost\nPaint,Interior,$100\nFloors,LVP,$200\n') });
    await carlos.waitForSelector('.drop.has');
    await carlos.click('[data-act="deploy"]');
    await carlos.waitForSelector('#tracker-address:has-text("700 E2E Way")');
    const d = await until(() => getDeal('700 E2E Way'));
    assert(d && d.exitStrategy === 'Fix & Flip', 'deal not saved');
    assert(d.tasks.find(t => t.id === 'ff_3').subtasks.length === 2 && d.tasks.find(t => t.id === 'ff_3').isSOW, 'SOW subtasks missing');
  });
  const W = '100 Test Lane';
  await openDeal(carlos, W);
  const card = (title) => carlos.locator('.task', { hasText: title }).first();
  await step('tick a task (quiet save, as before)', async () => {
    const before = (await getDeal(W)).dateLastEdited;
    await card('Search Entire CRM').locator('[data-act="toggleTask"]').click();
    const d = await until(async () => { const x = await getDeal(W); return x.tasks.find(t => t.id === 'ws_7').completed ? x : null; });
    assert(d, 'task not ticked'); assert(d.dateLastEdited === before, 'a tick should not change Time Last Edited (as before)');
  });
  await step('change a task owner from the grouped menu', async () => {
    const c = card('Pull The Data From (Investorbase');
    await c.locator('[data-menu="owner"]').click(); await settle(carlos);
    assert(await carlos.locator('.menu .label:has-text("DISPO")').count() === 1, 'owner menu not grouped');
    assert(await carlos.locator('.menu .mi:has-text("Other Company")').count() === 0, 'other-company accounts must not be offered');
    await menuPick(carlos, 'Moe Test');
    assert(await until(async () => (await getDeal(W)).tasks.find(t => t.id === 'ws_11').assignee === 'Moe'), 'owner not saved as the first name');
  });
  await step('add, start, finish, edit and remove subtasks', async () => {
    const c = () => card('Format The Data');
    await c().locator('.tk-xd [data-act="expand"]').click(); await settle(carlos);
    await c().locator('[data-box^="add:"]').click();
    await carlos.fill('[id^="newsub_ws_12"]', 'E2E Subtask One'); await c().locator('[data-act="addSubtask"]').click();
    await until(async () => (await getDeal(W)).tasks.find(t => t.id === 'ws_12').subtasks.length === 1);
    await c().locator('[data-box^="add:"]').click();
    await carlos.fill('[id^="newsub_ws_12"]', 'E2E Subtask Two'); await c().locator('[data-act="addSubtask"]').click();
    await until(async () => (await getDeal(W)).tasks.find(t => t.id === 'ws_12').subtasks.length === 2);
    await c().locator('.sub', { hasText: 'E2E Subtask Two' }).locator('[data-menu="owner"]').click(); await menuPick(carlos, 'Moe Test');
    assert(await until(async () => { const z = (await getDeal(W)).tasks.find(t => t.id === 'ws_12'); return z.subtasks[1].assignee === 'Moe' && z.assignee !== 'Moe'; }), 'subtask owner not saved on the subtask alone');
    assert((await c().locator('.sub', { hasText: 'E2E Subtask Two' }).locator('[data-menu="owner"]').innerText()).includes('Moe'), 'subtask owner not shown');
    await status(carlos, c().locator('.sub', { hasText: 'E2E Subtask One' }), 'In Progress');
    let s = await until(async () => { const t = (await getDeal(W)).tasks.find(t => t.id === 'ws_12'); return t.subtasks[0].status === 'progress' ? t : null; });
    assert(s && s.subtasks[0].completed === false && s.subtasks[0].startedAt, 'In Progress not saved');
    await status(carlos, c().locator('.sub', { hasText: 'E2E Subtask One' }), 'Done');
    await c().locator('.sub', { hasText: 'E2E Subtask Two' }).locator('.check').click();
    s = await until(async () => { const t = (await getDeal(W)).tasks.find(t => t.id === 'ws_12'); return t.completed ? t : null; });
    assert(s && s.subtasks.every(x => x.completed && x.doneAt), 'task should follow its subtasks');
    await c().locator('.sub', { hasText: 'E2E Subtask Two' }).locator('[data-box^="edit:"]').click();
    await carlos.fill('[id^="subedit_ws_12"]', 'E2E Subtask Two Renamed'); await c().locator('[data-act="saveSubtask"]').click();
    await until(async () => (await getDeal(W)).tasks.find(t => t.id === 'ws_12').subtasks[1].title === 'E2E Subtask Two Renamed');
    await c().locator('.sub', { hasText: 'Renamed' }).locator('[data-act="openRemoveSub"]').click();
    assert(await carlos.locator('[data-act="removeSub"]').isDisabled(), 'Remove must wait for "Confirm"');
    await carlos.fill('#confirmWord', 'Confirm'); await carlos.click('[data-act="removeSub"]');
    assert(await until(async () => (await getDeal(W)).tasks.find(t => t.id === 'ws_12').subtasks.length === 1), 'subtask not removed');
  });
  await step('no Link or Draft buttons anywhere; drafts and links saved before stay listed in Details and can be removed', async () => {
    assert(!(await carlos.locator('[data-box^="draft:"], [data-box^="link:"], #draft_own, .own-box').count()), 'Link and Draft are gone from cards and Details');
    await card('Format The Data').locator('[data-box^="add:"]').click();
    assert(!(await card('Format The Data').locator('.inline-box input[type="checkbox"]').count()), 'Add Subtask has no Link / Draft checkboxes');
    await card('Format The Data').locator('[data-act="box"][data-box^="add:"]').first().click();
    await carlos.click('.deal-head [data-act="pop"][data-pop="notes"]'); await settle(carlos);
    const dr = carlos.locator('.menu .pop-item', { hasText: 'Made up draft text' });
    assert(await dr.locator('[data-act="copy"]').count() === 1, 'an old draft keeps its Copy button');
    await dr.locator('[data-act="clearDraft"]').click(); await carlos.click('[data-act="confirmOk"]');
    assert(await until(async () => (await getDeal(W)).tasks[0].templateText === ''), 'draft not removed');
    await carlos.click('.deal-head [data-act="pop"][data-pop="files"]'); await settle(carlos);
    const lk = carlos.locator('.menu .pop-item', { hasText: 'example.com/uw' });
    assert(await lk.locator('a[href="https://example.com/uw"]').count() === 1, 'an old link still opens');
    await lk.locator('[data-act="clearLink"]').click();
    assert(await until(async () => (await getDeal(W)).tasks[0].hyperlink === ''), 'link not removed');
    await carlos.keyboard.press('Escape'); await settle(carlos);
    // more drafts and links "saved before" (written straight to the emulator), used by the notes and chat steps below
    const ref = (await db().collection(`${P}/properties`).where('address', '==', W).get()).docs[0].ref, x = (await ref.get()).data();
    Object.assign(x.tasks.find(t => t.id === 'ws_23'), { templateText: 'E2E draft text', templateLastEditedBy: 'carlos', templateLastEditedAt: Date.now() });
    x.tasks.find(t => t.id === 'ws_12').hyperlink = 'example.com/e2e';
    await ref.update({ tasks: x.tasks });
    assert(await until(async () => (await carlos.locator('.deal-head [data-pop="notes"]').innerText()).includes('Notes')), 'page did not follow');
  });
  await step('Inject Custom Task (borrowing weight) and delete it', async () => {
    await carlos.click('[data-act="openInject"]');
    await carlos.click('[data-menu="injPhase"]'); await menuPick(carlos, 'Phase III: Marketing Execution');
    await carlos.click('[data-menu="injMode"]'); await menuPick(carlos, 'Create New Group');
    await carlos.fill('[data-k="newCategoryName"]', 'E2E Group');
    await carlos.click('[data-menu="injPosition"]'); await menuPick(carlos, 'At The Top');
    await carlos.fill('[data-k="title"]', 'E2E Custom Task');
    await carlos.click('[data-menu="injAssignee"]'); await menuPick(carlos, 'Yanna Test');
    for (let i = 0; i < 3; i++) await carlos.click('[data-act="injWeight"][data-n="1"]');
    await carlos.click('[data-act="deductAdd"]');
    await carlos.click('[data-menu="deductTask"]'); await menuPick(carlos, 'Execute Calls & Marketing');
    await carlos.fill('[data-change="deductWeight"]', '3'); await carlos.press('[data-change="deductWeight"]', 'Tab');
    await carlos.waitForSelector('.meter.ok');
    await carlos.check('[data-change="injCheck"][data-k="splitWeight"]');
    await carlos.click('[data-act="inject"]:not([data-another])');
    const d = await until(async () => { const x = await getDeal(W); return x.tasks.some(t => t.title === 'E2E Custom Task') ? x : null; });
    assert(d && d.tasks.find(t => t.id === 'ws_28').weight === 7, 'weight not borrowed');
    assert(d.tasks.find(t => t.title === 'E2E Custom Task').isSOW === true, 'Split weight should mark the task like a SOW task');
    assert(await card('E2E Custom Task').locator('.chip.tag:has-text("Split Weight")').count() === 1, 'Split Weight tag missing');
    await card('E2E Custom Task').locator('[data-act="openDeleteCustom"]').click(); await carlos.click('[data-act="confirmOk"]');
    const e = await until(async () => { const x = await getDeal(W); return !x.tasks.some(t => t.title === 'E2E Custom Task') ? x : null; });
    assert(e && e.tasks.find(t => t.id === 'ws_28').weight === 10, 'weight not returned');
  });
  await step('due date on a subtask and on the deal (Eastern time, 9:00 AM default)', async () => {
    const c = card('Format The Data');
    await details(carlos, c.locator('.sub').first(), 'due');
    await carlos.click('.dp-day >> text="20"'); await carlos.click('[data-act="dpSet"]');
    const s = await until(async () => (await getDeal(W)).tasks.find(t => t.id === 'ws_12').subtasks[0].due);
    const et = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(s));
    assert(et === '09:00', 'default due time should be 9:00 AM Eastern, got ' + et);
    await carlos.click('[data-pop="due"]:not([data-tid])'); await carlos.click('[data-act="dpStep"][data-unit="Hour"][data-n="1"]');
    await carlos.click('.dp-day >> text="21"'); await carlos.click('[data-act="dpSet"]');
    assert(await until(async () => (await getDeal(W)).due), 'deal due not saved');
  });
  await step('notes on the deal (compiled view) and on a task; delete own note', async () => {
    await carlos.click('[data-pop="notes"]:not([data-tid])'); await settle(carlos);
    assert(await carlos.locator('.menu .chip:has-text("Draft")').count() >= 1, 'deal notes should compile task drafts');
    await carlos.fill('#noteText', 'E2E deal note'); await carlos.click('[data-act="addNote"]');
    await until(async () => ((await getDeal(W)).notes || []).length === 1);
    await settle(carlos);
    if (!await carlos.locator('[data-act="deleteNote"]').count()) throw new Error('note not shown: ' + (await carlos.locator('.menu').innerText()).slice(0, 300).replace(/\n/g, ' | ') + ' / by=' + ((await getDeal(W)).notes[0].by));
    await carlos.click('[data-act="deleteNote"]'); await carlos.click('[data-act="confirmOk"]');
    assert(await until(async () => ((await getDeal(W)).notes || []).length === 0), 'note not deleted');
    await carlos.keyboard.press('Escape');
    await details(carlos, card('Format The Data').locator('.tk-side'), 'notes');
    await carlos.fill('#noteText', 'E2E task note'); await carlos.click('[data-act="addNote"]');
    assert(await until(async () => ((await getDeal(W)).tasks.find(t => t.id === 'ws_12').notes || []).length === 1), 'task note not saved');
    await carlos.keyboard.press('Escape');
  });
  await step('files & links: add a link and upload a file (Storage)', async () => {
    await details(carlos, card('Format The Data').locator('.tk-side'), 'files');
    await carlos.click('[data-act="popMode"][data-v="link"]');
    await carlos.fill('#linkName', 'E2E Link'); await carlos.fill('#linkUrl', 'https://example.com/e2e-file'); await carlos.click('[data-act="addLinkFile"]');
    await until(async () => ((await getDeal(W)).tasks.find(t => t.id === 'ws_12').files || []).length === 1);
    await carlos.click('[data-act="popMode"][data-v="file"]');
    await carlos.setInputFiles('[data-change="uploadFiles"]', { name: 'e2e.txt', mimeType: 'text/plain', buffer: Buffer.from('made-up file') });
    const f = await until(async () => { const fs = (await getDeal(W)).tasks.find(t => t.id === 'ws_12').files || []; return fs.length === 2 ? fs[1] : null; }, 15000);
    assert(f && f.kind === 'file' && f.path.startsWith('files/') && f.url, 'upload not recorded');
    await carlos.keyboard.press('Escape');
  });
  await step('activity shows who changed what', async () => {
    await carlos.click('[data-pop="activity"]:not([data-tid])'); await settle(carlos);
    const txt = await carlos.locator('.menu').innerText();
    assert(/Carlos Test/.test(txt) && /due date/.test(txt) && /note added/.test(txt), 'activity incomplete');
    await carlos.keyboard.press('Escape');
  });
  await step('choose a path on a Fix & Flip deal, then Edit Path', async () => {
    await openDeal(carlos, '700 E2E Way');
    await carlos.locator('.task', { hasText: 'Contractor Selection' }).first().locator('[data-menu="path"]').click();
    await menuPick(carlos, 'Non-Local Contractor');
    const t = await until(async () => { const x = (await getDeal('700 E2E Way')).tasks.find(t => t.id === 'ff_7'); return x.selectedOption === 1 ? x : null; });
    assert(t && t.title === 'Non-Local Contractor' && t.assignee === 'Chris', 'path not applied');
    await carlos.locator('#task_ff_7 [data-act="editPath"]').click();
    assert(await until(async () => (await getDeal('700 E2E Way')).tasks.find(t => t.id === 'ff_7').selectedOption === null), 'Edit Path did not reopen');
  });
  await step('Previous / Next and Back To Master Dashboard', async () => {
    const first = await carlos.locator('#tracker-address').innerText();
    await carlos.click('[data-act="step"][data-n="1"]'); await carlos.waitForTimeout(400);
    assert(await carlos.locator('#tracker-address').innerText() !== first, 'Next did not move');
    await carlos.click('[data-act="step"][data-n="-1"]'); await carlos.waitForTimeout(300);
    assert(await carlos.locator('#tracker-address').innerText() === first, 'Previous did not come back');
    await carlos.click('.nav-row [data-tab="dashboard"]'); await carlos.waitForSelector('table.deals');
  });
  await step('chat: send, pin, search, pinned list, links overlay, read receipt', async () => {
    await openDeal(carlos, W);
    await carlos.click('#chatFab'); await carlos.fill('#chatInput', 'E2E message'); await carlos.press('#chatInput', 'Enter');
    await until(async () => (await getDeal(W)).comments.some(c => c.text === 'E2E message'));
    await carlos.locator('.msg', { hasText: 'E2E message' }).hover(); await carlos.locator('.msg', { hasText: 'E2E message' }).locator('[data-act="chatPin"]').click();
    assert(await until(async () => (await getDeal(W)).comments.find(c => c.text === 'E2E message').pinned), 'pin not saved');
    await carlos.click('[data-act="chatSearch"]'); await carlos.fill('#chatSearch', 'runner');
    assert(await count(carlos, '.msg', 1), 'search should filter messages');
    await carlos.click('[data-act="chatSearch"]');
    await carlos.click('[data-act="chatOverlay"][data-v="pins"]'); assert(await count(carlos, '.overlay .hub-item', 2), 'pinned list');
    await carlos.click('.overlay [data-act="chatOverlay"]');
    await carlos.click('[data-act="chatOverlay"][data-v="links"]'); await settle(carlos); assert((await carlos.locator('.overlay').innerText()).includes('example.com/e2e'), 'links overlay');
    await carlos.click('.overlay [data-act="chatOverlay"]');
    assert((await getDeal(W)).readBy.carlos, 'read receipt');
    await carlos.click('[data-act="chatClose"]');
  });

  // a second person on the same deal at the same moment: nobody's change is lost
  await step('two people editing the same deal at once keep both changes', async () => {
    await openDeal(moe, W);
    await Promise.all([card('Upload The Data To CRM').locator('[data-act="toggleTask"]').click(),
      moe.locator('.task', { hasText: 'Upload Non Dups To SC' }).first().locator('[data-act="toggleTask"]').click()]);
    const d = await until(async () => { const x = await getDeal(W); return x.tasks.find(t => t.id === 'ws_13').completed && x.tasks.find(t => t.id === 'ws_15').completed ? x : null; });
    assert(d, 'one of the two changes was lost');
  });
  await step('notifications from the Cloud Functions reach the other person and open the deal', async () => {
    await moe.click('[data-menu="notifs"]');
    await moe.waitForSelector('.notif', { timeout: 15000 });
    await moe.locator('.notif .body', { hasText: '700 E2E Way' }).first().click();
    await moe.waitForSelector('#tracker-address:has-text("700 E2E Way")');
  });
  await step('notification settings save', async () => {
    await moe.click('[data-menu="user"]'); await moe.click('[data-act="openPrefs"]'); await moe.waitForSelector('[data-act="prefToggle"]');
    await moe.click('[data-act="prefToggle"][data-k="daily_brief"]'); await moe.click('[data-act="savePrefs"]');
    const s = await until(async () => { const x = await db().collection(`${P}/user_preferences`).where('email', '==', 'moe@totalchb.com').get(); return !x.empty && x.docs[0].data().daily_brief === false ? x.docs[0].data() : null; });
    if (!(s && s.daily_brief === false)) { const all = (await db().collection(`${P}/user_preferences`).get()).docs.map(d => d.data().email + ':' + d.data().daily_brief);
      throw new Error('preference not saved: ' + all.join(', ') + ' / modal ' + await moe.evaluate(() => JSON.stringify(window.__dispo.S.modal && { kind: window.__dispo.S.modal.kind, db: window.__dispo.S.modal.prefs && window.__dispo.S.modal.prefs.daily_brief, saved: window.__dispo.S.modal.saved }))); }
  });
  await step('only Carlos and Systems see Edit SOP', async () => {
    await moe.click('.header [data-menu="user"]'); await moe.click('.menu [data-tab="sop"]'); await settle(moe); assert(await moe.locator('[data-act="sopEdit"]').count() === 0, 'Moe should not see Edit SOP');
  });
  await step('mark a deal Closed: read-only, listed under Closed, no alerts; then Reopen', async () => {
    await openDeal(carlos, '500 Example Blvd');
    await carlos.click('[data-menu="status"]'); await menuPick(carlos, 'Mark As Closed'); await carlos.click('[data-act="confirmOk"]');
    const d = await until(async () => { const x = await getDeal('500 Example Blvd'); return x.status === 'closed' ? x : null; });
    assert(d && d.statusBy === 'Carlos Test', 'status not saved');
    await carlos.waitForSelector('.banner.closed');
    assert(await carlos.locator('.task [data-act="toggleTask"]').first().isDisabled(), 'checklist should be read-only');
    const count = async () => (await db().collectionGroup('notifications').get()).size;
    const before = await count();
    await db().doc(`${P}/properties/${d.id}`).update({ tasks: d.tasks.map((t, i) => i === 0 ? { ...t, completed: true } : t) });
    await sleep(4000);
    assert(await count() === before, 'a closed deal sent an alert');
    await carlos.click('.banner [data-act="setStatus"]'); await carlos.click('[data-act="confirmOk"]');
    assert(await until(async () => !(await getDeal('500 Example Blvd')).status), 'reopen failed');
  });
  await step('SOP editor: total must be 100%, then save; new deals use it', async () => {
    await carlos.click('.header [data-menu="user"]'); await carlos.click('.menu [data-tab="sop"]'); await carlos.click('[data-act="sopEdit"]');
    await carlos.click('[data-act="sopEditStrategy"][data-v="Creative"]');
    const w = carlos.locator('[data-k="weight"]').first(); await w.fill('25'); await w.press('Tab');
    await carlos.waitForSelector('.meter.bad'); assert(await carlos.locator('[data-act="sopSave"]').isDisabled(), 'Save should be blocked');
    const w2 = carlos.locator('[data-k="weight"]').nth(1); await w2.fill('5'); await w2.press('Tab');
    await carlos.waitForSelector('.meter.ok');
    // drag a group above another, add a task and drag it to the top of its group, add default subtasks and reorder them
    const dragTo = async (grip, target, after = false) => { await carlos.click('.center-note'); await settle(carlos); await target.scrollIntoViewIfNeeded(); const g = await grip.boundingBox(), t = await target.boundingBox();
      await carlos.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await carlos.mouse.down();
      await carlos.mouse.move(t.x + t.width / 2, t.y + t.height * (after ? 0.85 : 0.15), { steps: 10 }); await carlos.mouse.up(); await settle(carlos); };
    await dragTo(carlos.locator('.sop-group[data-dv="Documentation"] > .row [data-grip]'), carlos.locator('.sop-group[data-dv="Seller Negotiation"]'));
    await carlos.click('[data-act="sopAdd"][data-what="task"][data-group="Documentation"]');
    const nt = carlos.locator('.sop-task[data-dv="1"] [data-k="title"]'); await nt.fill('E2E Second Task'); await nt.press('Tab');
    await dragTo(carlos.locator('.sop-task[data-dv="1"] > [data-grip]'), carlos.locator('.sop-task[data-dv="0"]'));
    for (const [k, v] of ['A', 'B', 'C'].entries()) { await carlos.click('[data-act="sopSubAdd"][data-i="2"]'); const f = carlos.locator(`[data-change="sopSub"][data-i="2"][data-si="${k}"]`); await f.fill(v); await f.press('Tab'); }
    await dragTo(carlos.locator('.sop-sub[data-dz="sub:2"][data-dv="2"] [data-grip]'), carlos.locator('.sop-sub[data-dz="sub:2"][data-dv="0"]'));
    await carlos.check('[data-change="sopSplit"][data-i="2"]');
    await carlos.click('[data-act="sopSave"]'); await carlos.click('[data-act="confirmOk"]');
    const s = await until(async () => { const x = (await db().doc(`${P}/settings/sop`).get()).data(); return x && x.strategies ? x : null; });
    await carlos.click('.seg.tabs [data-tab="dashboard"]'); await settle(carlos);
    const cr = s && s.strategies.find(x => x.name === 'Creative').tasks;
    assert(cr && cr.find(t => t.title.startsWith('Finalize')).weight === 25, 'SOP not saved');
    assert(cr.slice(0, 3).map(t => t.title).join(' | ') === 'E2E Second Task | Draft Creative Purchase Agreement | Finalize SubTo/Seller Finance Terms', 'order not saved: ' + cr.slice(0, 3).map(t => t.title).join(' | '));
    const fin = cr[2]; assert(fin.defaultSubtasks.join() === 'C,A,B' && fin.splitWeight === true, 'subtasks or split not saved: ' + JSON.stringify(fin));
    await carlos.click('[data-act="openDeploy"] >> nth=0'); await carlos.fill('#deployAddress', '800 Sop Way');
    await carlos.click('[data-menu="deployStrategy"]'); await menuPick(carlos, 'Creative'); await carlos.click('[data-act="deploy"]');
    const d = await until(() => getDeal('800 Sop Way'));
    const f2 = d && d.tasks.find(t => t.title.startsWith('Finalize'));
    assert(f2 && f2.weight === 25 && d.tasks[0].title === 'E2E Second Task', 'new deal should use the saved SOP');
    assert(f2.isSOW === true && f2.subtasks.map(x => x.title).join() === 'C,A,B', 'split task should carry its subtasks with the weight split');
  });
  await db().doc(`${P}/settings/directory`).set({ copiedAt: Date.now() - 2 * 3600e3 }, { merge: true });   // the copy is two hours old
  const remy = await open(browser, 'systems@totalchb.com');
  await step('Team: refreshes itself from the hub when a Manager opens DISPO OPS (copy missing or over an hour old)', async () => {
    const dir = await until(async () => { const x = (await db().doc(`${P}/settings/directory`).get()).data(); return x && x.people['jess@totalchb.com'] ? x : null; }, 20000);
    const teamCalls = () => hubCalls.filter(c => c.ok && c.url === '/api/title-agent/team').length;
    assert(dir && teamCalls() === 1, 'the team should be copied once on its own: ' + teamCalls() + ' team requests');
    await remy.reload(); await settle(remy); await remy.waitForTimeout(1500);
    assert(teamCalls() === 1, 'a fresh copy should not be refreshed again on reload');
  });
  await step('Team: Refresh From Hub (manager), signed request, names shown', async () => {
    await remy.click('[data-menu="user"]'); await remy.click('[data-act="openTeam"]'); await remy.click('[data-act="refreshTeam"]');
    const dir = await until(async () => { const x = (await db().doc(`${P}/settings/directory`).get()).data(); return x && x.people['jess@totalchb.com'] ? x : null; }, 20000);
    assert(dir && hubCalls.some(c => c.ok && c.url === '/api/title-agent/team'), 'hub not asked with a valid signature');
    assert(JSON.parse(hubCalls.find(c => c.ok && c.url === '/api/title-agent/team').body).depts.join() === 'TC,DISPO,ACQ,OPS', 'all departments should be asked for');
    await remy.click('[data-act="closeModal"]'); await remy.waitForTimeout(500);
    await remy.click('[data-act="tab"][data-tab="dashboard"] >> nth=0'); await settle(remy); await remy.waitForTimeout(500);
    assert((await remy.locator('table.deals').innerText()).includes('Hub'), 'names from the hub not shown');
  });
  await step('Team Members is for Managers only', async () => {
    await moe.click('[data-menu="user"]'); await settle(moe);
    assert(await moe.locator('[data-act="openTeam"]').count() === 0, 'Members should not see Team Members');
    assert((await moe.locator('.acct .role').innerText()).toLowerCase() === 'member · dispo', 'role line');
    await moe.keyboard.press('Escape');
  });
  await step('Live clock: one pill with the save state; its panel says when it last saved', async () => {
    await carlos.click('.live'); await settle(carlos);
    const t = await carlos.locator('.live-pop').innerText();
    assert(/Live: Everything Is Saved/.test(t) && /Last saved/.test(t), 'Live panel: ' + t.slice(0, 120));
    assert(/\d{1,2}:\d{2}:\d{2} (AM|PM) E[SD]T/.test(await carlos.locator('.live').innerText()), 'clock text');
    await carlos.click('.live-pop [data-act="closeMenu"]');
  });
  await step('Sign In As: Remy views DISPO OPS as Moe, changes are recorded via Remy, then Back To Remy', async () => {
    await remy.click('[data-menu="user"]'); await remy.click('[data-act="openTeam"]');
    await remy.click('.team-row:has-text("moe@totalchb.com") [data-act="loginAs"]'); await remy.click('[data-act="confirmOk"]');
    await remy.waitForSelector('.imp-bar', { timeout: 20000 }); await remy.waitForSelector('[data-app-ready]');
    assert((await remy.locator('.imp-bar').innerText()).includes('moe@totalchb.com'), 'orange bar should say whose view');
    await openDeal(remy, '200 Sample Ave');
    await remy.locator('.task', { hasText: 'Inspection' }).first().locator('[data-act="toggleTask"]').click();
    const e = await until(async () => { const d = await getDeal('200 Sample Ave'); return (d.log || []).find(x => x.tid === 'ff_1' && x.ev === 'marked done'); });
    assert(e && / \(via Remy/.test(e.by), 'change should be recorded via Remy, got ' + (e && e.by));
    const audits = (await db().collection(`artifacts/${APP_ID}/server`).get()).docs.filter(d => d.id.startsWith('audit-'));
    assert(audits.some(d => d.data().kind === 'login as' && d.data().as === 'moe@totalchb.com'), 'audit record');
    await remy.click('[data-act="backToRemy"]');
    await remy.waitForSelector('[data-app-ready]', { timeout: 20000 }); await remy.waitForTimeout(1500);
    assert(await remy.locator('.imp-bar').count() === 0, 'should be back as Remy');
    assert(await remy.evaluate(() => window.__dispo.S.user.email) === 'systems@totalchb.com', 'signed in as Remy again');
  });
  await step('Only Remy sees Sign In As', async () => {
    await carlos.evaluate(() => { const D = window.__dispo; D.S.modal = { kind: 'team' }; D.render(); }); await settle(carlos);
    assert(await carlos.locator('[data-act="loginAs"]').count() === 0, 'Carlos should not see Sign In As');
    await carlos.evaluate(() => { window.__dispo.S.modal = null; window.__dispo.render(); });
  });
  await step('Remove Asset From Pipeline needs the password', async () => {
    await openDeal(carlos, '800 Sop Way');
    await carlos.click('[data-act="openRemoveDeal"]'); await carlos.fill('#deletePassword', 'wrong'); await carlos.click('[data-act="removeDeal"]');
    await carlos.waitForSelector('.note.red'); assert(await getDeal('800 Sop Way'), 'wrong password removed the deal');
    const pw = (fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8').match(/pass === '([^']+)'/) || [])[1];
    await carlos.fill('#deletePassword', pw); await carlos.click('[data-act="removeDeal"]');
    assert(await until(async () => !(await getDeal('800 Sop Way'))), 'deal not removed');
  });
  await step('phone: bottom bar, chat and a deal at 390px, no sideways scroll', async () => {
    const ph = await open(browser, 'yanna@totalchb.com', { phone: true, theme: 'dark' });
    assert(await ph.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'dashboard scrolls sideways');
    await ph.locator('.deal-card').first().click(); await ph.waitForSelector('#tracker-address');
    assert(await ph.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'tracker scrolls sideways');
    await ph.click('.bottom-nav [data-act="chatToggle"]'); await ph.waitForSelector('#chatInput');
    const fsz = await ph.$eval('#chatInput', e => getComputedStyle(e).fontSize); assert(fsz === '16px', 'inputs must be 16px on phones');
  });

  const failed = results.filter(r => r[0] === 'FAIL');
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed; ${errors.length} console errors`);
  errors.slice(0, 10).forEach(e => console.log('  console:', e.slice(0, 240)));
  await browser.close(); srv.close(); hub.close();
  process.exit(failed.length || errors.length ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
