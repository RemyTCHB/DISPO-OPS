// Screenshots of the revamped page against the emulators (made-up deals): light and dark, desktop and phone.
//   node tests/look.mjs [outdir]   (inside `firebase emulators:exec`)
import fs from 'node:fs';
import path from 'node:path';
import { chromium, serve, wireNetwork, clearFirestore, signIn, ROOT, HERE, admin, APP_ID } from './harness.mjs';

const OUT = process.argv[2] || path.join(HERE, 'out', 'shots');
const PORT = 5320;
const errors = [];

export async function seed() {
  const db = admin().firestore(), base = `artifacts/${APP_ID}/public/data`;
  const { newDeal, edit } = await import('../js/logic.js'), { DEFAULT_SOP } = await import('../js/sop-default.js');
  const t0 = Date.now(), x = { now: t0, me: 'carlos', name: 'Carlos Test' };
  const mk = (addr, strat, ago, fn) => { const d = newDeal(DEFAULT_SOP, addr, strat, strat === 'Fix & Flip' ? 'Task,Detail,Cost\nPaint,Interior,$1000\nRoof,Patch,$2000\n' : null, t0 - ago);
    d.dateLastEdited = t0 - ago / 3; fn && fn(d); return d; };
  const deals = [
    mk('100 Test Lane', 'Wholesale', 3 * 864e5, d => { d.tasks.slice(0, 6).forEach(t => { t.completed = true; }); d.tasks[7].due = t0 - 36e5; d.due = t0 + 5 * 864e5;
      edit.addSubtask(d, x, { tid: d.tasks[7].id, ti: 7 }, { title: 'Call Investor One' }); edit.addSubtask(d, x, { tid: d.tasks[7].id, ti: 7 }, { title: 'Call Investor Two', link: true });
      edit.setSubStatus(d, x, { tid: d.tasks[7].id, ti: 7, sid: d.tasks[7].subtasks[0].id, si: 0 }, 'progress');
      d.tasks[0].templateText = 'Made up draft text'; d.tasks[0].hyperlink = 'example.com/uw';
      d.comments = [{ id: 'cmt_1', text: 'Seller confirmed access for Friday.', author: 'moe', timestamp: t0 - 7e6, pinned: true }, { id: 'cmt_2', text: 'Great, I will send the runner.', author: 'carlos', timestamp: t0 - 6e6, pinned: false }]; }),
    mk('200 Sample Ave', 'Fix & Flip', 9 * 864e5),
    mk('300 Demo Rd', 'Novation', 15 * 864e5, d => { d.tasks.slice(0, 20).forEach(t => { t.completed = true; }); }),
    mk('400 Fake Ct', 'Creative', 30 * 864e5, d => { d.tasks.forEach(t => { t.completed = true; }); d.status = 'closed'; d.statusAt = t0 - 864e5; d.statusBy = 'Carlos Test'; }),
    mk('500 Example Blvd', 'Wholesale', 2 * 36e5)
  ];
  for (const d of deals) await db.doc(`${base}/properties/${d.id}`).set(d);
  await db.doc(`${base}/settings/directory`).set({ copiedAt: t0, copiedBy: 'Test', managers: [], people: {
    'brandy@totalchb.com': { name: 'Brandy Test', role: 'manager', order: 1 }, 'systems@totalchb.com': { name: 'Remy Test', role: 'manager', order: 2 },
    'monz@totalchb.com': { name: 'Monz Test', role: 'lead', dept: 'TC', order: 3 }, 'chris@totalchb.com': { name: 'Chris Test', role: 'member', dept: 'TC', order: 4 },
    'luke@totalchb.com': { name: 'Luke Test', role: 'lead', dept: 'ACQ', order: 5 }, 'carlos@totalchb.com': { name: 'Carlos Test', role: 'lead', dept: 'DISPO', order: 6 },
    'moe@totalchb.com': { name: 'Moe Test', role: 'member', dept: 'DISPO', order: 7 }, 'sara@totalchb.com': { name: 'Sara Test', role: 'member', dept: 'DISPO', order: 8 },
    'yanna@totalchb.com': { name: 'Yanna Test', role: 'member', dept: 'DISPO', order: 9 }, 'crm@kpidriver.com': { name: 'Other Company', role: 'member', dept: 'OPS', order: 10 } } });
  return deals;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await clearFirestore();
  const deals = await seed();
  const srv = await serve(ROOT, PORT);
  const browser = await chromium().launch();
  const shots = [];
  for (const theme of ['light', 'dark']) for (const [w, h, tag] of [[1440, 900, 'desktop'], [1280, 800, 'd1280'], [1024, 768, 'd1024'], [390, 844, 'phone'], [360, 740, 'p360']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, deviceScaleFactor: 1, hasTouch: /^p/.test(tag), isMobile: /^p/.test(tag) });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${tag}/${theme}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_FAILED|net::/.test(m.text())) errors.push(`${tag}/${theme}: ${m.text()}`); });
    await wireNetwork(page);
    await page.goto(`http://127.0.0.1:${PORT}/?emulator`);
    await page.waitForTimeout(800);
    if (theme === 'light' && tag === 'desktop') await page.screenshot({ path: path.join(OUT, `gate-${tag}-${theme}.png`) });
    await signIn(page, 'carlos@totalchb.com');
    await page.waitForSelector('[data-app-ready]', { timeout: 20000 });
    await page.waitForTimeout(1500);
    const snap = async name => { await page.waitForTimeout(400); const f = path.join(OUT, `${name}-${tag}-${theme}.png`); await page.screenshot({ path: f, fullPage: false }); shots.push(f); };
    await snap('dashboard');
    await page.evaluate(() => window.scrollTo(0, 700)); await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, `dashboard-scrolled-${tag}-${theme}.png`) }); await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(id => window.__dispo.openTracker(id), deals[0].id);
    await snap('tracker');
    await page.evaluate(() => { const el = [...document.querySelectorAll('.task')].find(x => x.querySelector('.subs')); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 160); });
    await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, `tracker-scrolled-${tag}-${theme}.png`) }); await page.evaluate(() => window.scrollTo(0, 0));
    if (tag === 'desktop' && theme === 'light') {
      await page.click('[data-pop="notes"]:not([data-tid])'); await snap('notes');
      await page.keyboard.press('Escape');
      await page.click('.task [data-act="details"]:not([data-part])'); await page.click('[data-act="detailsPart"][data-v="due"]'); await snap('due');
      await page.keyboard.press('Escape');
      await page.click('.task [data-menu="owner"]'); await snap('owner-menu');
      await page.keyboard.press('Escape');
      await page.click('#chatFab'); await snap('chat');
    }
    await page.evaluate(() => { window.__dispo.S.chat.open = false; window.__dispo.S.tab = 'sop'; window.__dispo.render(); });
    await snap('sop');
    await ctx.close();
  }
  console.log(`${shots.length} screenshots in ${OUT}; ${errors.length} console errors`);
  errors.slice(0, 15).forEach(e => console.log('  error:', e.slice(0, 300)));
  await browser.close(); srv.close();
}
if (process.argv[1] && process.argv[1].endsWith("look.mjs")) main().catch(e => { console.error(e); process.exit(1); });
