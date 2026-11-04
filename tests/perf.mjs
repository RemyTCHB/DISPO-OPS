// How heavy each version is to run: browser main-thread time while the dashboard sits open (mouse moving) for 6 s,
// and what the page downloads from this site. Same made-up deals for both. (The old page's Tailwind and icon CDNs
// can't be reached from the test machine, so its real cost is higher than measured here.)
import { chromium, serve, wireNetwork, clearFirestore, signIn, ROOT, patchOldPage } from './harness.mjs';
import { seed } from './look.mjs';
import { execSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
const OLD = path.join(ROOT, 'tests', 'out', 'old-site'); fs.mkdirSync(OLD, { recursive: true });
fs.writeFileSync(path.join(OLD, 'index.html'), execSync('git show f572873:index.html', { cwd: ROOT }));
for (const f of ['icon.svg', 'logo.svg', 'google.svg', 'manifest.json']) fs.copyFileSync(path.join(ROOT, f), path.join(OLD, f));
await clearFirestore(); await seed();
const browser = await chromium().launch();
async function measure(label, dir, port, transform, url) {
  const srv = await serve(dir, port, transform), ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }), page = await ctx.newPage();
  let bytes = 0; page.on('response', async r => { try { if (new URL(r.url()).port === String(port) || /gstatic.com\/firebasejs/.test(r.url())) bytes += (await r.body()).length; } catch (e) {} });
  await wireNetwork(page);
  await page.goto(url); await signIn(page, 'carlos@totalchb.com');
  await page.waitForTimeout(4000);
  const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable');
  const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
  const a = await m();
  for (let i = 0; i < 60; i++) { await page.mouse.move(300 + (i % 20) * 40, 300 + (i % 7) * 40); await page.waitForTimeout(100); }
  const b = await m();
  console.log(`${label}: main thread busy ${((b.TaskDuration - a.TaskDuration) * 1000).toFixed(0)} ms of 6000 ms (scripts ${((b.ScriptDuration - a.ScriptDuration) * 1000).toFixed(0)} ms, layout+style ${(((b.LayoutDuration - a.LayoutDuration) + (b.RecalcStyleDuration - a.RecalcStyleDuration)) * 1000).toFixed(0)} ms); downloaded ${(bytes / 1024).toFixed(0)} KB (site + Firebase)`);
  await ctx.close(); srv.close();
}
await measure('Before (old page)', OLD, 5350, (p, t) => patchOldPage(p, t), 'http://127.0.0.1:5350/');
await measure('After (revamp)   ', ROOT, 5351, null, 'http://127.0.0.1:5351/?emulator');
await browser.close();
