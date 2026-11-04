// The revamp keeps the old calculations exactly: run the pre-revamp page's own functions (read from git, commit
// f572873) side by side with js/logic.js on many made-up deals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import * as L from '../../js/logic.js';
import { DEFAULT_SOP } from '../../js/sop-default.js';

const OLD = execSync('git show f572873:index.html', { cwd: new URL('../..', import.meta.url).pathname, maxBuffer: 1 << 26 }).toString();
const fnSrc = name => { const a = OLD.indexOf(`function ${name}(`); let i = OLD.indexOf('{', a), depth = 0;
  for (; i < OLD.length; i++) { if (OLD[i] === '{') depth++; else if (OLD[i] === '}' && --depth === 0) break; }
  return OLD.slice(a, i + 1); };
const appCfg = OLD.slice(OLD.indexOf('const AppConfig = {'), OLD.indexOf('// --- GLOBAL STATE'));
const old = new Function(`${appCfg}; ${fnSrc('getPropStats')}; ${fnSrc('parseSOWCSV')}; ${fnSrc('generateTaskInstances')}; ${fnSrc('timeSince')};
  return { getPropStats, parseSOWCSV, generateTaskInstances, timeSince, AppConfig };`)();

let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function madeUpDeal() {
  const strategies = Object.keys(DEFAULT_SOP), strategy = strategies[Math.floor(rand() * strategies.length)];
  const d = L.newDeal(DEFAULT_SOP, 'Test ' + Math.floor(rand() * 999) + ' Lane', strategy, strategy === 'Fix & Flip' && rand() > 0.5 ? 'Task,Detail,Cost\nA,B,$1\nC,"D, E",$2\n' : null, 1700000000000);
  d.tasks.forEach(t => {
    if (rand() > 0.6) t.subtasks.push({ id: 's' + rand(), title: 'Made Up', completed: rand() > 0.5 });
    t.completed = rand() > 0.5;
    t.subtasks.forEach(s => { s.completed = rand() > 0.4; });
  });
  return d;
}

test('progress, next step and next agent match the old page on 500 made-up deals', () => {
  for (let i = 0; i < 500; i++) {
    const d = madeUpDeal(), a = old.getPropStats(JSON.parse(JSON.stringify(d))), b = L.getPropStats(d);
    for (const k of ['percent', 'nextStep', 'nextTaskDetail', 'nextAgent', 'nextTaskId', 'nextSectionKey']) assert.equal(b[k], a[k], k);
  }
});

test('the built-in SOP is the old AppConfig.sopBlueprints, unchanged', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(DEFAULT_SOP)), JSON.parse(JSON.stringify(old.AppConfig.sopBlueprints)));
});

test('deploying builds the same tasks as before (ids aside), CSV SOW included', () => {
  const csv = 'Task,Detail,Cost\nPaint,Interior,$1000\nRoof,"Patch, seal",$2000\n\n';
  for (const s of Object.keys(DEFAULT_SOP)) {
    const strip = ts => JSON.parse(JSON.stringify(ts).replace(/"sub_(sow_)?\d+[a-z0-9]*"/g, '"sub"'));
    assert.deepEqual(strip(L.generateTaskInstances(DEFAULT_SOP, s, csv)), strip(old.generateTaskInstances(s, csv)), s);
  }
  assert.deepEqual(L.parseSOWCSV('a,b,c\nx,"y, z",3'), old.parseSOWCSV('a,b,c\nx,"y, z",3'));
});

test('Time Last Edited reads the same', () => {
  const now = Date.now();
  for (const ago of [5e3, 9e4, 4e6, 9e7, 3e8, 4e10]) {
    const [top, bottom] = L.timeSinceParts(now - ago, now, true), want = old.timeSince(now - ago, true);
    const got = bottom ? `<div class="flex flex-col items-center justify-center gap-0.5 leading-tight"><span>${top}</span><span class="text-[10px] opacity-80">${bottom}</span></div>` : top;
    assert.equal(got, want);
  }
});

test('names match the Cloud Functions (Sarah = sara@, Remy = systems@)', () => {
  assert.equal(L.normalizeAgent('Sarah'), 'sara'); assert.equal(L.prefixOf('systems@totalchb.com'), 'remy');
  assert.equal(L.storedNameFor('sara@totalchb.com'), 'Sarah'); assert.equal(L.storedNameFor('will@totalchb.com'), 'Will');
  assert.ok(L.sameAgent(L.storedNameFor('systems@totalchb.com'), 'remy'));
});

test('subtask statuses keep completed as the truth and the task follows its subtasks', () => {
  const d = L.newDeal(DEFAULT_SOP, '1 Test St', 'Wholesale', null), x = { now: 1, me: 'carlos', name: 'Carlos Test' };
  const t = d.tasks[2], tg = { tid: t.id, ti: 2 };
  L.edit.addSubtask(d, x, tg, { title: 'A' }); L.edit.addSubtask(d, x, tg, { title: 'B' });
  const s0 = { ...tg, sid: t.subtasks[0].id, si: 0 }, s1 = { ...tg, sid: t.subtasks[1].id, si: 1 };
  L.edit.setSubStatus(d, x, s0, 'progress');
  assert.equal(t.subtasks[0].completed, false); assert.equal(t.subtasks[0].status, 'progress'); assert.equal(t.completed, false);
  L.edit.setSubStatus(d, x, s0, 'done'); L.edit.setSubStatus(d, x, s1, 'done');
  assert.equal(t.completed, true); assert.ok(t.doneAt);
  L.edit.setSubStatus(d, x, s1, 'todo'); assert.equal(t.completed, false); assert.equal(t.doneAt, null);
});

test('Inject Custom Task borrows weight exactly and Delete gives it back', () => {
  const d = L.newDeal(DEFAULT_SOP, '1 Test St', 'Wholesale', null), x = { now: 2, me: 'carlos', name: 'C' };
  assert.throws(() => L.edit.injectTask(d, x, { phase: 'Phase I: Deal Intake', categoryMode: 'existing', category: 'Underwriting', title: 'X', assignee: 'Moe', weight: '3', deductions: [{ taskId: 'ws_1', weight: 2 }] }), /must exactly match/);
  const t = L.edit.injectTask(d, x, { phase: 'Phase I: Deal Intake', categoryMode: 'existing', category: 'Underwriting', title: 'X', assignee: 'Moe', weight: '2', deductions: [{ taskId: 'ws_1', weight: 2 }] });
  assert.equal(d.tasks.find(z => z.id === 'ws_1').weight, 4); assert.equal(d.tasks[2].id, t.id);
  assert.equal(L.getPropStats(d).percent, 0);
  L.edit.deleteCustomTask(d, x, { tid: t.id, ti: 2 });
  assert.equal(d.tasks.find(z => z.id === 'ws_1').weight, 6);
});

test('legacy fix-up is unchanged', () => {
  const d = L.legacyFix({ tasks: [{ id: 'p3_7' }, { id: 'p3_6', subtasks: [] }] });
  assert.deepEqual(d.tasks.map(t => t.id), ['p3_6']); assert.equal(d.tasks[0].subtasks[0].id, 'sub_default_boost');
});

test('dashboard views: status, strategy, sort, due', () => {
  const a = { id: 'a', exitStrategy: 'Wholesale', dateStarted: 1, dateLastEdited: 5, tasks: [] };
  const b = { id: 'b', exitStrategy: 'Novation', dateStarted: 2, dateLastEdited: 4, tasks: [], due: 10 };
  const c = { id: 'c', dateStarted: 3, dateLastEdited: 6, tasks: [], status: 'closed' };
  assert.deepEqual(L.viewDeals([a, b, c], {}).map(x => x.id), ['a', 'b']);
  assert.deepEqual(L.viewDeals([a, b, c], { status: 'closed' }).map(x => x.id), ['c']);
  assert.deepEqual(L.viewDeals([a, b, c], { strategy: 'Wholesale' }).map(x => x.id), ['a']);
  assert.deepEqual(L.viewDeals([a, b, c], { sort: 'due_asc' }).map(x => x.id), ['b', 'a']);
});

test('Eastern time: 9:00 AM picked in Eastern is 9:00 AM Eastern', () => {
  const ms = L.etToMs(2026, 11, 5, 9, 0);
  assert.equal(L.etYmd(ms).hh, 9); assert.equal(L.etDay(ms), '11/05/2026');
  const summer = L.etToMs(2026, 7, 1, 17, 30); assert.equal(L.et24(summer), '17:30:00');
});

test('SOP check blocks totals other than 100%', () => {
  assert.deepEqual(L.sopProblems(JSON.parse(JSON.stringify(DEFAULT_SOP))), []);
  const s = JSON.parse(JSON.stringify(DEFAULT_SOP)); s.Creative[0].weight = 19;
  assert.match(L.sopProblems(s)[0], /Creative totals 99%/);
});

test('no change ever writes an undefined value (Firestore would refuse the whole save)', () => {
  const d = L.newDeal(DEFAULT_SOP, '1 Test St', 'Wholesale', null), x = { now: 5, me: 'carlos', name: 'C' }, t = { tid: d.tasks[0].id, ti: 0 };
  L.edit.addSubtask(d, x, t, { title: 'S' }); const s = { ...t, sid: d.tasks[0].subtasks[0].id, si: 0 };
  for (const tg of [{}, t, s]) {
    L.edit.setDue(d, x, tg, 99); L.edit.addNote(d, x, tg, 'n'); L.edit.addFile(d, x, tg, { kind: 'link', name: 'l', url: 'https://x' });
    if (tg.tid) { L.edit.saveTemplate(d, x, tg, 'draft'); L.edit.saveLink(d, x, tg, 'x.com'); L.edit.clearLink(d, x, tg); }
  }
  L.edit.setStatus(d, x, 'closed'); L.edit.setStatus(d, x, 'open');
  const bad = []; (function walk(v, p) { if (v === undefined) bad.push(p); else if (v && typeof v === 'object') for (const [k, w] of Object.entries(v)) walk(w, p + '.' + k); })(d, 'deal');
  assert.deepEqual(bad, []);
});
