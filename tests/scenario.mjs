// The Build Map's actions, run through a page's own functions, against the emulators with made-up deals.
// Used on today's page (baseline) and on the revamped page, so their saved data can be compared shape for shape.
//   node scenario.mjs old|new  (inside `firebase emulators:exec`)
import fs from 'node:fs';
import path from 'node:path';
import { chromium, serve, wireNetwork, patchOldPage, clearFirestore, dump, shape, signIn, ROOT, HERE } from './harness.mjs';

const which = process.argv[2] || 'old';
const PORT = 5310;

// Old page: its own window functions. New page: the same actions through its test API (window.__dispo).
export async function runOld(page) {
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  const deploy = async (address, strategy, csv = null) => {
    await ev(([a, s, c]) => { document.getElementById('newAssetAddressInput').value = a; window.selectNewAssetStrategy(s); window.pendingCSVContent = c; }, [address, strategy, csv]);
    await ev(() => window.confirmNewAsset());
    await page.waitForTimeout(400);
  };
  await deploy('100 Test Lane', 'Wholesale');
  await deploy('200 Sample Ave', 'Fix & Flip', 'Task,Detail,Cost\nPaint,Interior,$1000\nRoof,"Patch, seal",$2000\n');
  await deploy('300 Demo Rd', 'Novation');
  await deploy('400 Fake Ct', 'Creative');
  const open = addr => ev(a => { const p = window.__props().find(x => x.address === a); window.openTracker(p.id); }, addr);
  // Wholesale actions
  await open('100 Test Lane');
  await ev(() => window.toggleTask(1, true));
  await ev(() => window.changeAssignee(2, 'Moe'));
  await ev(() => { document.getElementById('newSubtaskInput_3').value = 'Call The Seller Back'; document.getElementById('newSubtaskLink_3').checked = true; return window.confirmAddSubtask(3); });
  await ev(() => window.toggleSubtask(3, 0, true));
  await ev(() => { document.getElementById('sub_input_3_0').value = 'Call The Seller Back Today'; document.getElementById('editSubtaskDraft_3_0').checked = true; return window.saveSubtask(3, 0); });
  await ev(() => { document.getElementById('templateInput_0').value = 'Draft text for testing'; return window.saveItemTemplate('0'); });
  await ev(() => { document.getElementById('linkInput_0').value = 'example.com/doc'; return window.saveItemLink('0'); });
  await ev(() => { document.getElementById('linkInput_3_0').value = 'https://example.com/sub'; return window.saveItemLink('3_0'); });
  await ev(() => { document.getElementById('templateInput_3_0').value = 'Subtask draft'; return window.saveItemTemplate('3_0'); });
  // Inject a custom task borrowing 2% from ws_1, then another kept
  await ev(() => { window.promptGlobalAddTask(); Object.assign(window.customTaskState, { phase: 'Phase I: Deal Intake', categoryMode: 'existing', category: 'Underwriting', title: 'Custom Check', assignee: 'Yanna', weight: '2', requireLink: true, deductions: [{ taskId: 'ws_1', weight: 2 }] }); return window.confirmGlobalAddTask(false); });
  await ev(() => { window.promptGlobalAddTask(); Object.assign(window.customTaskState, { phase: 'Phase II: Marketing Prep', categoryMode: 'new', newCategoryName: 'Extra Group', insertGroupAfter: 'top', title: 'Temp Task', assignee: 'Moe', weight: '' }); return window.confirmGlobalAddTask(false); });
  await ev(() => { const p = window.__props().find(x => x.address === '100 Test Lane'); window.pendingCustomTaskRemove = p.tasks.find(t => t.title === 'Temp Task').id; return window.executeDeleteCustomTask(); });
  await ev(() => { window.pendingSOWRemove = null; });
  // Chat
  await ev(() => { document.getElementById('chatInput').value = 'Hello team'; return window.sendChatMessage(); });
  await ev(() => { const p = window.__props().find(x => x.address === '100 Test Lane'); return window.togglePinComment(p.comments[0].id); });
  await ev(() => window.toggleChat());
  await page.waitForTimeout(300);
  await ev(() => window.toggleChat());
  // Fix & Flip: choose a path, edit it, tick a SOW subtask, remove another subtask
  await open('200 Sample Ave');
  await ev(() => window.selectTaskOption(6, 0));
  await ev(() => window.editTaskOption(6));
  await ev(() => window.selectTaskOption(6, 1));
  await ev(() => window.toggleSubtask(2, 0, true));
  await ev(() => { window.pendingSOWRemove = { taskIndex: 2, subIndex: 1 }; return window.executeRemoveSOWSubtask(); });
  // Notification preferences
  await ev(async () => { await window.loadNotificationPreferences(); document.getElementById('pref_comments').checked = false; return window.saveNotificationPreferences(); });
  await page.waitForTimeout(500);
  // Remove a deal (the password is read from the page, never written in the tests)
  const pw = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/pass === '([^']+)'/) || [])[1];
  await open('400 Fake Ct');
  await ev(p => { document.getElementById('deleteAuthInput').value = p; return window.confirmDeleteProperty(); }, pw);
  await page.waitForTimeout(800);
}

async function main() {
  await clearFirestore();
  const srv = await serve(ROOT, PORT, which === 'old' ? (p, t) => patchOldPage(p, t).replace('let propertiesData = [];', 'let propertiesData = []; window.__props = () => propertiesData;') : null);
  const browser = await chromium().launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await wireNetwork(page);
  await page.goto(`http://127.0.0.1:${PORT}/${which === 'new' ? '?emulator=1' : ''}`);
  await signIn(page, 'carlos@totalchb.com');
  await page.waitForSelector('#mainContent:not(.hidden), [data-app-ready]', { timeout: 20000 });
  await page.waitForTimeout(1500);
  if (which === 'old') await runOld(page);
  else { const { runNew } = await import('./scenario-new.mjs'); await runNew(page); }
  const data = await dump();
  fs.mkdirSync(path.join(HERE, 'out'), { recursive: true });
  fs.writeFileSync(path.join(HERE, 'out', `data-${which}.json`), JSON.stringify(data, null, 1));
  const byKind = {};
  for (const [p, d] of Object.entries(data)) { const kind = p.split('/').filter((_, i) => i % 2 === 0).join('/'); byKind[kind] = byKind[kind] || {}; Object.assign(byKind[kind], shape(d)); }
  fs.writeFileSync(path.join(HERE, 'out', `shape-${which}.json`), JSON.stringify(byKind, null, 1));
  console.log(`${which}: ${Object.keys(data).length} documents saved; ${errors.length} console errors`);
  errors.slice(0, 10).forEach(e => console.log('  error:', e.slice(0, 200)));
  await browser.close(); srv.close();
}
main().catch(e => { console.error(e); process.exit(1); });
