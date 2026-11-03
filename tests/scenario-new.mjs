// The same actions as runOld (scenario.mjs), on the revamped page, through the same code its buttons use.
export async function runNew(page) {
  const ev = (fn, a) => page.evaluate(fn, a);
  const deploy = async (address, strategy, csv = null) => {
    await ev(([a, s, c]) => { const D = window.__dispo; D.A.openDeploy(); Object.assign(D.S.modal, { address: a, strategy: s, csv: c, csvName: c ? 'sow.csv' : '' }); return D.A.deploy(); }, [address, strategy, csv]);
    await page.waitForTimeout(400);
  };
  await deploy('100 Test Lane', 'Wholesale');
  await deploy('200 Sample Ave', 'Fix & Flip', 'Task,Detail,Cost\nPaint,Interior,$1000\nRoof,"Patch, seal",$2000\n');
  await deploy('300 Demo Rd', 'Novation');
  await deploy('400 Fake Ct', 'Creative');
  const idOf = addr => ev(a => [...window.__dispo.S.saved.values()].find(x => x.address === a).id, addr);
  const W = await idOf('100 Test Lane'), F = await idOf('200 Sample Ave'), C = await idOf('400 Fake Ct');
  // target helpers: by position in the deal as the old scenario did, sent as { tid, ti, sid, si }
  const tg = (id, ti, si) => ev(([id, ti, si]) => { const d = window.__dispo.deal(id), t = d.tasks[ti];
    return si === undefined ? { tid: t.id, ti } : { tid: t.id, ti, sid: t.subtasks[si].id, si }; }, [id, ti, si]);
  const ch = (name, args, id) => ev(([n, a, i]) => window.__dispo.change(n, a, i), [name, args, id]);
  await ev(id => window.__dispo.openTracker(id), W);
  await ch('toggleTask', [await tg(W, 1), true], W);
  await ch('changeAssignee', [await tg(W, 2), 'Moe'], W);
  await ch('addSubtask', [await tg(W, 3), { title: 'Call The Seller Back', link: true, draft: false }], W);
  await ch('setSubStatus', [await tg(W, 3, 0), 'done'], W);
  await ch('editSubtask', [await tg(W, 3, 0), { title: 'Call The Seller Back Today', link: true, draft: true }], W);
  await ch('saveTemplate', [await tg(W, 0), 'Draft text for testing'], W);
  await ch('saveLink', [await tg(W, 0), 'example.com/doc'], W);
  await ch('saveLink', [await tg(W, 3, 0), 'https://example.com/sub'], W);
  await ch('saveTemplate', [await tg(W, 3, 0), 'Subtask draft'], W);
  await ch('injectTask', [{ phase: 'Phase I: Deal Intake', categoryMode: 'existing', category: 'Underwriting', newCategoryName: '', insertGroupAfter: '', title: 'Custom Check', assignee: 'Yanna', weight: '2', requireLink: true, requireDraft: false, deductions: [{ taskId: 'ws_1', weight: 2 }] }], W);
  await ch('injectTask', [{ phase: 'Phase II: Marketing Prep', categoryMode: 'new', category: '', newCategoryName: 'Extra Group', insertGroupAfter: 'top', title: 'Temp Task', assignee: 'Moe', weight: '', requireLink: false, requireDraft: false, deductions: [] }], W);
  const temp = await ev(id => { const d = window.__dispo.deal(id), i = d.tasks.findIndex(t => t.title === 'Temp Task'); return { tid: d.tasks[i].id, ti: i }; }, W);
  await ch('deleteCustomTask', [temp], W);
  // chat: open (read receipt), send, pin, close
  await ev(() => window.__dispo.A.chatToggle());
  await page.waitForTimeout(300);
  await page.fill('#chatInput', 'Hello team');
  await ev(() => window.__dispo.A.chatSend());
  await page.waitForTimeout(500);
  const cid = await ev(id => window.__dispo.deal(id).comments[0].id, W);
  await ch('pin', [cid], W);
  await ev(() => window.__dispo.A.chatClose());
  // Fix & Flip: path, edit path, path again, SOW subtask, remove a subtask
  await ev(id => window.__dispo.openTracker(id), F);
  await ch('selectOption', [await tg(F, 6), 0], F);
  await ch('editOption', [await tg(F, 6)], F);
  await ch('selectOption', [await tg(F, 6), 1], F);
  await ch('setSubStatus', [await tg(F, 2, 0), 'done'], F);
  await ch('removeSubtask', [await tg(F, 2, 1)], F);
  // notification settings
  await ev(async () => { const D = window.__dispo; await D.A.openPrefs(); D.S.modal.prefs.comments = false; await D.A.savePrefs(); });
  // remove a deal with the password (read from the page's code, never written in the tests)
  const fs = await import('node:fs'), pw = (fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8').match(/pass === '([^']+)'/) || [])[1];
  await ev(id => window.__dispo.openTracker(id), C);
  await ev(() => window.__dispo.A.openRemoveDeal());
  await page.fill('#deletePassword', pw);
  await ev(() => window.__dispo.A.removeDeal());
  await page.waitForTimeout(1000);
}
