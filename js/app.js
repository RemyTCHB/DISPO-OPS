// DISPO OPS: starts the page, keeps the live data, and handles every button (data-act) and field (data-change,
// data-input, data-enter). Screens are drawn by views.js / views2.js / sopview.js / help.js.
import * as store from './store.js';
import * as L from './logic.js';
import { startAurora } from './aurora.js';
import { icon } from './icons.js';
import { esc, patch, toast, startTooltips, placeMenu, wasDeferred, dpState, dpStep, dpMonth, dpValue } from './ui.js';
import { S, deal, allDeals, addPending, dropPending, setCtx, saveView, ownerGroups, label, face, myName, sop, strategies, canEditSop, isManager } from './state.js';
import { header, dashboard, tracker, trackerList } from './views.js';
import { menuHtml, chatHtml, modalHtml, unreadFor } from './views2.js';
import { sopPage } from './sopview.js';
import { helpPage } from './help.js';

const $ = id => document.getElementById(id);
const ctx = () => ({ now: store.now(), me: store.myPrefix(), name: myName() });
setCtx(ctx); store.setNameResolver(myName);

// ---------------------------------------------------------------- theme (follows the device, then remembered)
function setTheme(t, save = true) {
  document.documentElement.dataset.theme = t;
  if (save) try { localStorage.setItem('tchb_theme', t); } catch (e) {}
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === 'dark' ? '#1c1a2e' : '#f7f7f9';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => { let saved = null; try { saved = localStorage.getItem('tchb_theme'); } catch (x) {} if (!saved) { setTheme(e.matches ? 'dark' : 'light', false); render(); } });

// ---------------------------------------------------------------- drawing
let queued = false, syncSt = { state: 'ready' };
export function render() { if (!queued) { queued = true; requestAnimationFrame(draw); } }
function draw() {
  queued = false;
  if (drag) { dragRedraw = true; return; }   // no redraw while an SOP row is being dragged; it happens on release
  S.syncSt = syncSt; S.lastSaved = store.lastSaved();
  patch($('header'), `<div data-key="h-${syncSt.state}">${header(syncSt)}</div>`);
  if (!S.user) { $('main').innerHTML = gateHtml(); $('bottomNav').hidden = true; $('chatFab').hidden = true; $('chat').hidden = true; return; }
  const page = S.tab === 'dashboard' ? dashboard() : S.tab === 'tracker' ? tracker() : S.tab === 'sop' ? sopPage() : helpPage();
  patch($('main'), page);
  // chat
  const unread = allDeals().reduce((n, d) => n + unreadFor(d), 0), badge = unread ? `<span class="badge">${unread > 9 ? '9+' : unread}</span>` : '';
  $('chatFab').hidden = S.chat.open; $('chatFab').innerHTML = icon('chat', 24) + (S.chat.open ? '' : badge);
  $('chat').hidden = !S.chat.open;
  if (S.chat.open) { const body = $('chatMessages'), keep = body && body.scrollHeight - body.scrollTop - body.clientHeight < 40; patch($('chat'), chatHtml()); scrollChat(keep); }
  // bottom bar (phones)
  const bn = (tab, txt, ic, act = 'tab') => `<button type="button" data-act="${act}" data-tab="${tab}" aria-pressed="${act === 'tab' ? S.tab === tab : S.chat.open}">${icon(ic, 20)}${txt}${act === 'chatToggle' && unread && !S.chat.open ? `<span class="badge">${unread > 9 ? '9+' : unread}</span>` : ''}</button>`;
  $('bottomNav').hidden = false;
  $('bottomNav').innerHTML = bn('dashboard', 'Master', 'layers') + bn('tracker', 'Tracker', 'list') + bn('', 'Chat', 'chat', 'chatToggle');
  // menu and dialog layers
  const mh = menuHtml();
  $('layer').hidden = !mh;
  if (mh) { patch($('layer'), `<div class="scrim" data-key="scrim" data-act="closeMenu"></div><div data-key="m-${S.menu.kind}-${S.menu.pop || ''}-${S.menu.dealId || ''}-${S.menu.tg ? S.menu.tg.tid + (S.menu.tg.sid || '') : ''}" data-morph style="display:contents">${mh}</div>`); placeMenu($('layer').querySelector('.menu'), S.menu.anchor && S.menu.anchor.isConnected ? S.menu.anchor : findAnchor()); }
  const md = modalHtml();
  $('modal').hidden = !md;
  if (md) patch($('modal'), `<div data-key="md-${S.modal.kind}" style="display:contents">${md}</div>`);
  tick(); measure();
}
// After a live update redraws the button a menu came from, find it again (or keep the menu where the button was).
function findAnchor() {
  const a = S.menu && S.menu.anchorSel ? document.querySelector(S.menu.anchorSel) : null;
  if (a && S.menu) { S.menu.anchor = a; return a; }
  const r = S.menu && S.menu.rect; return r ? { isConnected: true, getBoundingClientRect: () => r } : null;
}
function scrollChat(keepBottom) {
  const body = $('chatMessages'); if (!body) return;
  const c = S.chat;
  if (c.focus) { const el = document.getElementById('chat_msg_' + c.focus); if (el) { el.scrollIntoView({ block: 'center' }); } c.focus = null; setTimeout(render, 2500); return; }
  if (c.firstUnread) { const el = document.getElementById('chat_msg_' + c.firstUnread); c.firstUnread = null; if (el) { el.scrollIntoView({ block: 'center' }); return; } }
  if (c.stickBottom || keepBottom) { body.scrollTop = body.scrollHeight; c.stickBottom = false; }
}
function gateHtml() {
  return `<section class="card gate"><img src="assets/logo-mark.png" alt="" width="72" height="72" style="border-radius:18px"><h2>Sign In To <span>Dispo Ops</span></h2>
    <p>Authorized personnel only. Use your @totalchb.com Google account.</p>
    <button type="button" class="btn primary" data-act="signIn" ${S.signingIn ? 'disabled' : ''}>${S.signingIn ? '<span class="spin"></span>Signing In…' : 'Sign In With Google'}</button>
    ${S.gateError ? `<p class="err">${S.gateError}</p>` : ''}</section>`;
}
// the clock: server time, Eastern
// The Live clock: one line, 12-hour Eastern, from the server clock ("Wed 11/04/2026 7:42:07 AM EST"; phones: time only)
function tick() {
  const dd = $('clockD'), tt = $('clockT'); if (!tt) return;
  const n = store.now(); dd.textContent = L.etDate(n) + ' '; tt.textContent = L.et12(n) + ' ' + L.etZone(n);
}
// The pinned header slims past 120px of scroll (back within 40px of the top); the tabs line pins under it with a glass card.
let slim = false;
// Header like the hub's: logo + clock | page tabs | buttons on one row when they fit; otherwise the tabs take their
// own centred line under the other two (checked from the real widths, so other fonts never wrap the buttons).
const gw = g => { const k = [...g.children].filter(c => getComputedStyle(c).display !== 'none' && getComputedStyle(c).position !== 'absolute');
  return k.reduce((s, c) => s + c.getBoundingClientRect().width, 0) + Math.max(0, k.length - 1) * (parseFloat(getComputedStyle(g).columnGap) || 0); };
function fitHeader() {
  const row = document.querySelector('.header-row'), l = row && row.querySelector('.hl'), m = row && row.querySelector('.hm'), r = row && row.querySelector('.hr');
  if (!l || !m || !r || window.innerWidth < 640) return document.body.classList.remove('hm-drop');
  const cs = getComputedStyle(row), room = row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const gap = parseFloat(cs.columnGap) || 0;
  document.body.classList.toggle('hm-drop', gw(l) + gw(m) + gw(r) + gap * 2 > room - 4);
}
function measure() {
  const h = $('header'); if (!h) return;
  fitHeader();
  document.documentElement.style.setProperty('--head-h', Math.round(h.getBoundingClientRect().height) + 'px');
  const y = window.scrollY || 0;
  if (!slim && y > 120) { slim = true; document.body.classList.add('slim'); } else if (slim && y < 40) { slim = false; document.body.classList.remove('slim'); }
  const tl = document.querySelector('.tabs-line');
  document.body.classList.toggle('tabs-stuck', !!tl && y > 0 && tl.getBoundingClientRect().top <= h.getBoundingClientRect().height + 1);
}
window.addEventListener('scroll', () => requestAnimationFrame(measure), { passive: true });
window.addEventListener('resize', () => requestAnimationFrame(measure));
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => measure());
setInterval(tick, 1000);
store.onSync(st => { const changed = st.state !== syncSt.state || st.error !== syncSt.error; syncSt = st; if (changed) render(); });

// ---------------------------------------------------------------- saving changes (shown at once, then confirmed)
async function change(name, args, dealId = S.activeId) {
  const d = deal(dealId); if (!d) return false;
  if (L.isLocked(d) && !L.WHEN_LOCKED.has(name)) { toast('This deal is ' + L.STATUS[L.statusOf(d)], 'Reopen it to make changes.', true); return false; }
  try { const probe = JSON.parse(JSON.stringify(d)); if (L.edit[name](probe, ctx(), ...JSON.parse(JSON.stringify(args))) === false) return false; }
  catch (e) { if (e instanceof L.EditError) { toast('Not Saved', e.message, true); return false; } throw e; }
  const p = addPending(dealId, name, args); render();
  try {
    const r = await store.mutate(dealId, name, args);
    // keep showing the change until the database's own update for this deal arrives (or 5 seconds at most)
    p.done = true; setTimeout(() => { dropPending(dealId, p); render(); }, 5000);
    if (r && r.changed === false) { dropPending(dealId, p); render(); }
    return r;
  }
  catch (e) { dropPending(dealId, p); render(); toast('Not Saved', e instanceof L.EditError ? e.message : (e.code === 'permission-denied' ? 'You do not have permission for that change.' : 'Your change could not be saved. Use Retry in the badge at the top.'), true); return false; }
}
const tgOf = el => ({ tid: el.dataset.tid, ti: +el.dataset.ti, ...(el.dataset.sid ? { sid: el.dataset.sid, si: +el.dataset.si } : {}) });
const tgSel = tg => `[data-tid="${CSS.escape(tg.tid)}"]${tg.sid ? `[data-sid="${CSS.escape(tg.sid)}"]` : ':not([data-sid])'}`;

// ---------------------------------------------------------------- navigation
function goTab(tab) {
  S.tab = tab; S.menu = null;
  if (tab === 'dashboard' || tab === 'sop' || tab === 'help') { if (S.chat.open && S.chat.view === 'deal') S.chat.open = false; }
  if (tab !== 'sop') S.sopEdit = null;
  render(); window.scrollTo({ top: 0 });
}
export function openTracker(id, scrollToTaskId = null, sectionKey = null) {
  if (S.activeId !== id) { S.sections = {}; S.sectionDone = {}; S.boxes = {}; S.agentFilter = 'All'; }
  S.activeId = id; S.tab = 'tracker'; S.menu = null;
  if (S.chat.open) { S.chat.view = 'deal'; openChatDeal(id); }
  if (sectionKey && sectionKey !== 'null') S.sections[sectionKey] = 'open';
  render();
  if (scrollToTaskId && scrollToTaskId !== 'null') {
    const t = deal(id) && deal(id).tasks.find(x => x.id === scrollToTaskId);
    if (t) S.sections[L.sectionKeyOf(t.phase, t.mainTask)] = 'open';
    render();
    setTimeout(() => { const el = document.getElementById('task_' + scrollToTaskId); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); } }, 120);
  } else window.scrollTo({ top: 0 });
  const u = new URL(location.href); u.searchParams.set('deal', id); history.replaceState(null, '', u);
}
function openChatDeal(id) {
  const d = deal(id); if (!d) return;
  const mine = store.myPrefix().toLowerCase(), lastRead = (d.readBy || {})[mine] || 0;
  const first = (d.comments || []).find(c => c.timestamp > lastRead && String(c.author).toLowerCase() !== mine);
  S.chat.firstUnread = lastRead > 0 && first ? first.id : null; S.chat.stickBottom = !S.chat.firstUnread;
  S.chat.view = 'deal'; S.chat.overlay = null; S.chat.searching = false; S.chat.search = '';
  if (unreadFor(d) || !(d.readBy || {})[mine]) store.markChatRead(id);
}

// ---------------------------------------------------------------- menus (every dropdown is the same glass menu)
const selectorFor = el => !el || !el.dataset ? null : el.dataset.menu ? `[data-menu="${CSS.escape(el.dataset.menu)}"]` + (el.dataset.tid ? tgSel(tgOf(el)) : '') + (el.dataset.i !== undefined ? `[data-i="${CSS.escape(el.dataset.i)}"]` : '') + (el.dataset.oi !== undefined ? `[data-oi="${CSS.escape(el.dataset.oi)}"]` : '') : null;
function choose(anchor, options, onPick, extra = {}) {
  S.menu = { kind: 'choose', anchor, anchorSel: selectorFor(anchor), rect: anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null, options: options.map((o, i) => ({ ...o, i })), onPick, ...extra }; render();
}
const ownerOptions = current => ownerGroups().flatMap(g => [{ header: g.label }, ...g.items.map(p => ({ label: p.name, value: p.value, face: face(p.value), selected: current && L.sameAgent(current, p.value) }))]);
const MENUS = {
  strategyFilter: () => [{ label: 'All Strategies', value: 'All', selected: S.view.strategy === 'All' }, ...[...new Set([...strategies(), ...allDeals().map(d => d.exitStrategy || 'Wholesale')])].map(s => ({ label: s, value: s, selected: S.view.strategy === s }))],
  sort: () => [['edited_desc', 'Recently Edited'], ['edited_asc', 'Oldest Edited'], ['started_desc', 'Newest Added'], ['started_asc', 'Oldest Added'], ['due_asc', 'Due Soonest']].map(([value, label]) => ({ value, label, selected: S.view.sort === value })),
  dealPick: () => { const ds = allDeals(), out = [{ label: '-- Select An Active Deal --', value: '' }];
    for (const st of ['open', 'closed', 'cancelled']) { const list = ds.filter(d => L.statusOf(d) === st).sort((a, b) => b.dateLastEdited - a.dateLastEdited); if (list.length) out.push({ header: L.STATUS[st] }, ...list.map(d => ({ label: d.address, value: d.id, selected: d.id === S.activeId }))); }
    return out; },
  agentFilter: () => [{ label: 'All Agents', value: 'All', selected: S.agentFilter === 'All' }, ...ownerOptions(S.agentFilter === 'All' ? null : S.agentFilter)],
  status: () => { const st = L.statusOf(deal(S.activeId)); return [{ header: 'Deal Status' }, { label: 'Mark As Closed', value: 'closed', selected: st === 'closed' }, { label: 'Mark As Cancelled', value: 'cancelled', selected: st === 'cancelled' }, ...(st !== 'open' ? [{ hr: true }, { label: 'Reopen', value: 'open' }] : [])]; },
  interval: () => [['2', 'Every 2 Hours'], ['4', 'Every 4 Hours'], ['8', 'Every 8 Hours'], ['24', 'Once A Day (24 Hours)']].map(([value, label]) => ({ value, label, selected: S.modal && S.modal.prefs && S.modal.prefs.reminder_interval === value })),
  deployStrategy: () => strategies().map(s => ({ label: s, value: s, selected: S.modal && S.modal.strategy === s }))
};
const PICK = {
  strategyFilter: v => { S.view.strategy = v; saveView(); },
  sort: v => { S.view.sort = v; saveView(); },
  dealPick: v => { if (v) openTracker(v); else { S.activeId = null; } },
  agentFilter: v => { S.agentFilter = v; },
  status: v => askStatus(v),
  interval: v => { S.modal.prefs.reminder_interval = v; },
  deployStrategy: v => { S.modal.strategy = v; if (v !== 'Fix & Flip') { S.modal.csv = null; S.modal.csvName = ''; } }
};
function openMenu(el) {
  const kind = el.dataset.menu, anchor = el;
  if (S.menu && S.menu.anchor === el) { S.menu = null; return render(); }
  if (kind === 'subStatus') { const tg = tgOf(el); return choose(anchor, [['todo', 'Not Started'], ['progress', 'In Progress'], ['done', 'Done']].map(([value, label]) => ({ value, label, selected: L.subStatus(L.findSub(deal(S.activeId), tg).s) === value })), v => change('setSubStatus', [tg, v]).then(() => autoClose(tg, v))); }
  if (kind === 'user' || kind === 'active' || kind === 'notifs' || kind === 'sync') { S.menu = { kind, anchor, anchorSel: `.header [data-menu="${kind}"]`, rect: anchor.getBoundingClientRect() }; if (kind === 'notifs') S.selectedNotifs.clear(); return render(); }
  if (MENUS[kind]) return choose(anchor, MENUS[kind](), PICK[kind]);
  const d = deal(S.activeId);
  if (kind === 'owner') { const tg = tgOf(el), t = L.findTask(d, tg);
    if (tg.sid) { const s = (t.subtasks || []).find(z => z.id === tg.sid) || {}; return choose(anchor, ownerOptions(s.assignee || t.assignee), v => change('changeSubAssignee', [tg, v])); }
    return choose(anchor, ownerOptions(t.assignee), v => change('changeAssignee', [tg, v])); }
  if (kind === 'path') { const tg = tgOf(el), t = L.findTask(d, tg);
    return choose(anchor, [{ label: '-- Make A Selection --', value: '' }, ...t.dropdownOptions.map((o, i) => ({ label: o.title, hint: 'Assign to: ' + label(o.defaultAssignee || 'Unassigned'), value: String(i) }))], v => change('selectOption', [tg, v === '' ? '' : +v])); }
  // Inject Custom Task
  const st = S.modal && S.modal.state;
  if (kind === 'injPhase') return choose(anchor, [...new Set(d.tasks.map(t => t.phase))].map(p => ({ label: p, value: p, selected: st.phase === p })), v => { st.phase = v; if (st.categoryMode === 'existing') st.category = ''; });
  if (kind === 'injMode') return choose(anchor, [{ label: 'Assign To Existing Group', value: 'existing' }, { label: 'Create New Group', value: 'new' }], v => { st.categoryMode = v; });
  const cats = () => [...new Set(d.tasks.filter(t => t.phase === st.phase).map(t => t.mainTask))];
  if (kind === 'injCategory') return choose(anchor, st.phase ? cats().map(c => ({ label: c || '(No Group Name)', value: c, selected: st.category === c })) : [{ header: 'Pick a phase first' }], v => { st.category = v; });
  if (kind === 'injPosition') return choose(anchor, st.phase ? [{ label: 'At The Top (Beginning)', value: 'top' }, ...cats().map(c => ({ label: 'Insert After: ' + c, value: c }))] : [{ header: 'Pick a phase first' }], v => { st.insertGroupAfter = v; });
  if (kind === 'injAssignee') return choose(anchor, ownerOptions(st.assignee), v => { st.assignee = v; });
  if (kind === 'deductTask') { const i = +el.dataset.i;
    return choose(anchor, d.tasks.filter(t => t.weight > 0 && !st.deductions.some((x, j) => j !== i && x.taskId === t.id)).map(t => ({ label: `[${t.weight}%] ${t.title} (${t.mainTask})`, value: t.id, selected: st.deductions[i].taskId === t.id })), v => { st.deductions[i].taskId = v; }); }
  if (kind === 'sopOwner') { const i = +el.dataset.i, oi = el.dataset.oi, t = S.sopEdit.data[S.sopEdit.strategy][i];
    return choose(anchor, ownerOptions(oi !== undefined ? t.dropdownOptions[+oi].defaultAssignee : t.defaultAssignee), v => { if (oi !== undefined) t.dropdownOptions[+oi].defaultAssignee = v; else t.defaultAssignee = v; }); }
}
function openPop(el, details = false) {
  const tg = el.dataset.tid ? tgOf(el) : null, d = deal(S.activeId); if (!d) return;
  const it = !tg ? d : tg.sid ? L.findSub(d, tg).s : L.findTask(d, tg);
  let pop = el.dataset.pop;
  if (details) {   // the Details button opens on the part used last (Notes the first time); subtasks have no Activity part
    let last = 'notes'; try { last = localStorage.getItem('tchb_details_part') || 'notes'; } catch (e) {}
    pop = el.dataset.part || last; if (tg && tg.sid && pop === 'activity') pop = 'notes';
    if (!['due', 'notes', 'activity', 'files'].includes(pop)) pop = 'notes';
  }
  const sel = details ? `[data-act="details"]:not([data-part])${tgSel(tg)}` : tg ? `[data-pop="${pop}"]${tgSel(tg)}` : `[data-pop="${pop}"]:not([data-tid])`;
  S.menu = { kind: 'pop', pop, details, anchor: details ? (document.querySelector(sel) || el) : el, anchorSel: sel, dealId: d.id, tg, mode: 'file', withSubs: false,
    dp: dpState(it.due, store.now()) };
  render();
}
// a group whose last task was just finished folds away, as before
function autoClose(tg, v) {
  if (v !== 'done') return; const d = deal(S.activeId), t = d && L.findTask(d, tg); if (!t || !L.isTaskDone(t)) return;
  const k = L.sectionKeyOf(t.phase, t.mainTask);
  if (L.groupStats(d.tasks.filter(x => x.phase === t.phase && x.mainTask === t.mainTask)).allCompleted) { S.sections[k] = 'closed'; render(); }
}

// ---------------------------------------------------------------- dialogs
const confirmBox = (title, body, ok, onOk, danger = true) => { S.modal = { kind: 'confirm', title, body, ok, onOk, danger }; S.menu = null; render(); };
function askStatus(v) {
  const d = deal(S.activeId), cur = L.statusOf(d); if (v === cur) return;
  const text = { closed: ['Mark As Closed?', 'The deal moves to the Closed view, its checklist becomes read-only and it stops sending alerts. You can reopen it any time.', 'Mark As Closed'],
    cancelled: ['Mark As Cancelled?', 'The deal moves to the Cancelled view, its checklist becomes read-only and it stops sending alerts. You can reopen it any time.', 'Mark As Cancelled'],
    open: ['Reopen This Deal?', 'The deal goes back to Open, can be edited again and sends alerts as before.', 'Reopen'] }[v];
  confirmBox(text[0], text[1], text[2], () => change('setStatus', [v]).then(r => r && toast(v === 'open' ? 'Deal reopened' : 'Deal marked ' + L.STATUS[v])), v !== 'open');
}
function newInjectState() { return { phase: '', categoryMode: '', category: '', newCategoryName: '', insertGroupAfter: '', title: '', assignee: '', weight: '', requireLink: false, requireDraft: false, splitWeight: false, deductions: [] }; }

// ---------------------------------------------------------------- actions
const A = {
  signIn: async () => { S.signingIn = true; S.gateError = ''; render();
    try { await store.signIn(); } catch (e) { if (e.code === 'auth/unauthorized-domain') S.gateError = `<strong>Domain Not Authorized.</strong> Add this domain in Firebase Authorized Domains: <code>${esc(location.hostname)}</code>`; else if (e.code !== 'auth/popup-closed-by-user') S.gateError = esc(e.message); }
    S.signingIn = false; render(); },
  signOut: () => store.logOut(),
  askSignOut: () => confirmBox('Sign Out?', 'You will need to sign in with Google again to use DISPO OPS.', 'Sign Out', () => store.logOut(), false),
  details: el => openPop(el, true),
  detailsPart: el => { const m = S.menu; if (!m) return; m.pop = el.dataset.v; try { localStorage.setItem('tchb_details_part', m.pop); } catch (e) {} render(); },
  expand: el => { const k = el.dataset.k, t = deal(S.activeId) && deal(S.activeId).tasks.find(x => x.id === k), def = !!(t && (t.subtasks || []).length);
    const open = S.boxes['col:' + k] === undefined ? def : !S.boxes['col:' + k]; S.boxes['col:' + k] = open; render(); },
  // Sign In As (Remy only): the server signs him in as that person; Back To Remy signs him back in as himself
  loginAs: el => { const email = el.dataset.email, nm = L.storedNameFor(email);
    confirmBox('Sign In As ' + label(nm) + '?', 'You will see and work in DISPO OPS exactly as ' + label(nm) + ' does. Anything you change is recorded as theirs, via you. Use Back To Remy at the top to come back.', 'Sign In As ' + label(nm).split(' ')[0], async () => {
      S.modal = { kind: 'team', asBusy: email }; render();
      try { const r = await store.callFunction('loginAs', { email }); await store.signInWithToken(r.token); }
      catch (e) { if (S.modal) S.modal.asBusy = ''; render(); toast('Could not sign in as them', e.message || 'Try again.', true); }
    }, false); },
  backToRemy: async () => { S.backBusy = true; render();
    try { const r = await store.callFunction('loginAs', { back: true }); await store.signInWithToken(r.token); }
    catch (e) { S.backBusy = false; render(); toast('Could not switch back', 'Sign in with Google instead.', true); store.logOut(); } },
  theme: el => { setTheme(el.dataset.v); render(); },
  tab: el => goTab(el.dataset.tab || 'dashboard'),
  menu: el => openMenu(el),
  closeMenu: () => { S.menu = null; render(); },
  choose: el => { const m = S.menu, o = m.options[+el.dataset.i]; S.menu = null; if (o && m.onPick) m.onPick(o.value); render(); },
  pop: el => openPop(el),
  retrySave: () => { S.menu = null; render(); store.retryFailed(); },
  // dashboard
  view: el => { S.view.status = el.dataset.v; saveView(); render(); },
  clearFilter: () => { S.view.strategy = 'All'; saveView(); render(); },
  openDeal: (el, e) => { if (e.target.closest('[data-act="jumpNext"]')) return; openTracker(el.dataset.id); },
  jumpNext: (el, e) => { e.stopPropagation(); openTracker(el.dataset.id, el.dataset.tid, el.dataset.sk); },
  // tracker
  step: el => { const list = trackerList(), i = list.findIndex(d => d.id === S.activeId), n = list[i + +el.dataset.n]; if (n) openTracker(n.id); },
  jumpTask: el => openTracker(S.activeId, el.dataset.tid),
  toggleGroup: el => { const k = el.dataset.sk; S.sections[k] = S.sections[k] === 'open' ? 'closed' : 'open'; render(); },
  box: el => { const k = el.dataset.box; S.boxes[k] = !S.boxes[k]; render(); if (S.boxes[k]) setTimeout(() => { const f = { add: 'newsub_', edit: 'subedit_', link: 'link_', draft: 'draft_' }[k.split(':')[0]] + k.split(':')[1]; const x = document.getElementById(f); if (x) x.focus(); }, 30); },
  toggleTask: el => { const tg = tgOf(el), t = L.findTask(deal(S.activeId), tg); change('toggleTask', [tg, !t.completed]); },
  subStatus: el => { const tg = tgOf(el), v = el.dataset.v, t = L.findTask(deal(S.activeId), tg);
    change('setSubStatus', [tg, v]).then(() => { if (v === 'done' && L.isTaskDone(L.findTask(deal(S.activeId), tg))) { S.sections[L.sectionKeyOf(t.phase, t.mainTask)] = L.groupStats(deal(S.activeId).tasks.filter(x => x.phase === t.phase && x.mainTask === t.mainTask)).allCompleted ? 'closed' : S.sections[L.sectionKeyOf(t.phase, t.mainTask)]; render(); } }); },
  editPath: el => change('editOption', [tgOf(el)]),
  addSubtask: el => { const tg = tgOf(el), key = tg.tid, title = ($('newsub_' + key).value || '').trim(); if (!title) return $('newsub_' + key).focus();
    change('addSubtask', [tg, { title, link: false, draft: false }]); S.boxes['add:' + key] = false; },   // links and drafts now go in Details (Notes, Files)
  saveSubtask: el => { const tg = tgOf(el), key = `${tg.tid}_${tg.sid}`, title = ($('subedit_' + key).value || '').trim(); if (!title) return;
    const was = (((deal(S.activeId) || {}).tasks || [])[tg.ti] || {}).subtasks || [], cur = was.find(z => z.id === tg.sid) || {};   // keep an old link or draft as it is
    change('editSubtask', [tg, { title, link: !!(cur.requiresLink || cur.hyperlink), draft: !!(cur.requiresDraft || cur.templateText) }]); S.boxes['edit:' + key] = false; },
  openRemoveSub: el => { S.modal = { kind: 'removeSub', tg: tgOf(el), ok: false }; render(); setTimeout(() => $('confirmWord') && $('confirmWord').focus(), 30); },
  removeSub: () => { const tg = S.modal.tg; S.modal = null; S.boxes[`edit:${tg.tid}_${tg.sid}`] = false; change('removeSubtask', [tg]); },
  saveLink: el => { const tg = tgOf(el), key = tg.sid ? `${tg.tid}_${tg.sid}` : tg.tid; change('saveLink', [tg, $('link_' + key).value]); S.boxes['link:' + key] = false; $('link_' + key).blur(); render(); },
  clearDraft: el => { const tg = tgOf(el); confirmBox('Remove This Draft?', 'The text is removed from this item. This cannot be undone.', 'Remove', () => change('saveTemplate', [tg, ''])); },
  clearLink: el => { const tg = tgOf(el), key = tg.sid ? `${tg.tid}_${tg.sid}` : tg.tid; change('clearLink', [tg]); S.boxes['link:' + key] = false; render(); },
  copy: (el) => { const t = el.dataset.text || ''; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).catch(() => { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); }); toast('Copied'); },
  openDeleteCustom: el => { const tg = tgOf(el); confirmBox('Confirm Removal', 'Permanently delete this custom task? Its borrowed weight goes back to the tasks it came from.', 'Delete Task', () => change('deleteCustomTask', [tg])); },
  openRemoveDeal: () => { S.modal = { kind: 'removeDeal', error: false }; render(); setTimeout(() => $('deletePassword') && $('deletePassword').focus(), 30); },
  removeDeal: async () => {
    const pass = $('deletePassword').value;
    if (pass === 'Remove@2026') {   // unchanged check from before the revamp (moving it to the server is pending the owner's OK)
      const id = S.activeId; S.modal = null; S.chat.open = false;
      try { await store.removeDeal(id); S.activeId = null; goTab('dashboard'); toast('Asset removed from the pipeline'); } catch (e) { toast('Not Removed', 'The deal could not be removed. Try again.', true); }
    } else { S.modal.error = true; render(); }
  },
  setStatus: el => askStatus(el.dataset.v),
  // deploy
  openDeploy: () => { S.modal = { kind: 'deploy', address: '', strategy: strategies()[0] || 'Wholesale', csv: null, csvName: '' }; S.menu = null; render(); setTimeout(() => $('deployAddress') && $('deployAddress').focus(), 30); },
  deploy: async () => {
    const m = S.modal, address = (m.address || '').trim(); if (!address) { m.bad = true; render(); return; }
    m.busy = true; render();
    const d = L.newDeal(sop(), address, m.strategy, m.csv, store.now());
    try { await store.createDeal(d); S.modal = null; S.saved.set(d.id, d); openTracker(d.id); toast('Asset deployed', address); }
    catch (e) { m.busy = false; render(); toast('Not Deployed', 'Failed to deploy asset due to a connection error. Please try again.', true); }
  },
  // inject custom task
  openInject: () => { S.modal = { kind: 'inject', state: newInjectState() }; render(); },
  injWeight: el => { const st = S.modal.state; st.weight = String(Math.min(100, Math.max(0, (parseInt(st.weight) || 0) + +el.dataset.n))); render(); },
  deductAdd: () => { S.modal.state.deductions.push({ taskId: '', weight: '' }); render(); },
  deductRemove: el => { S.modal.state.deductions.splice(+el.dataset.i, 1); render(); },
  inject: async el => {
    const m = S.modal, st = m.state, another = !!el.dataset.another;
    try { L.edit.injectTask(JSON.parse(JSON.stringify(deal(S.activeId))), ctx(), JSON.parse(JSON.stringify(st))); }
    catch (e) { if (e instanceof L.EditError) return toast('Check The Form', e.message, true); throw e; }
    m.busy = true; render();
    const r = await change('injectTask', [JSON.parse(JSON.stringify(st))]);
    m.busy = false;
    if (!r) return render();
    if (another) { const mt = st.categoryMode === 'existing' ? st.category : st.newCategoryName.trim();
      Object.assign(st, { title: '', weight: 0, deductions: [], requireLink: false, requireDraft: false, splitWeight: false }); if (st.categoryMode === 'new') Object.assign(st, { categoryMode: 'existing', category: mt, newCategoryName: '' });
      toast('Success', 'Task injected successfully! You can now add another.'); }
    else S.modal = null;
    render();
  },
  // dialogs
  closeModal: () => { S.modal = null; render(); },
  modalScrim: (el, e) => { if (e.target === el) { S.modal = null; render(); } },
  confirmOk: () => { const f = S.modal.onOk; S.modal = null; render(); f && f(); },
  // popovers: due date, notes, files
  dpDay: el => { const st = S.menu.dp; st.pick = { y: st.y, m: st.m, d: +el.dataset.d }; render(); },
  dpStep: el => { dpStep(S.menu.dp, el.dataset.unit, +el.dataset.n); render(); },
  dpMonth: el => { dpMonth(S.menu.dp, +el.dataset.n); render(); },
  dpSet: () => { const m = S.menu, v = dpValue(m.dp); S.menu = null; change('setDue', [m.tg || {}, v], m.dealId); },
  dpClear: () => { const m = S.menu; S.menu = null; change('setDue', [m.tg || {}, null], m.dealId); },
  popSubs: () => { S.menu.withSubs = !S.menu.withSubs; render(); },
  popMode: el => { S.menu.mode = el.dataset.v; render(); },
  addNote: el => { const text = ($('noteText').value || '').trim(); if (!text) return $('noteText').focus(); $('noteText').value = ''; change('addNote', [el.dataset.tid ? tgOf(el) : {}, text], S.menu.dealId); },
  deleteNote: el => { const tg = el.dataset.tid ? tgOf(el) : {}, nid = el.dataset.nid, id = S.menu.dealId; confirmBox('Delete This Note?', 'It is removed for everyone.', 'Delete', () => change('deleteNote', [tg, nid], id)); },
  addLinkFile: el => { const url = ($('linkUrl').value || '').trim(); if (!url) return $('linkUrl').focus();
    const name = ($('linkName').value || '').trim() || url; $('linkUrl').value = ''; $('linkName').value = '';
    change('addFile', [el.dataset.tid ? tgOf(el) : {}, { kind: 'link', name, url }], S.menu.dealId); },
  removeFile: el => { const tg = el.dataset.tid ? tgOf(el) : {}, fid = el.dataset.fid, id = S.menu.dealId;
    confirmBox('Remove This File Or Link?', 'It is removed for everyone.', 'Remove', async () => { const it = (() => { const d = deal(id); return !tg.tid ? d : tg.sid ? L.findSub(d, tg).s : L.findTask(d, tg); })(); const f = (it.files || []).find(x => x.id === fid); const r = await change('removeFile', [tg, fid], id); if (r && f && f.path) store.deleteStoredFile(f.path); }); },
  // chat
  chatToggle: () => { S.chat.open = !S.chat.open; if (S.chat.open) { if (S.tab === 'tracker' && S.activeId) openChatDeal(S.activeId); else S.chat.view = 'hub'; } render(); if (S.chat.open) setTimeout(() => $('chatInput') && $('chatInput').focus(), 60); },
  chatClose: () => { S.chat.open = false; render(); },
  chatHub: () => { S.chat.view = 'hub'; render(); },
  chatOpenDeal: el => { const id = el.dataset.id; S.activeId = S.tab === 'tracker' ? S.activeId : id; if (S.tab === 'tracker' && S.activeId !== id) openTracker(id); S.activeId = id; openChatDeal(id); render(); setTimeout(() => $('chatInput') && $('chatInput').focus(), 60); },
  chatSend: () => { const inp = $('chatInput'), text = (inp.value || '').trim(); if (!text || !S.activeId) return; inp.value = ''; S.chat.stickBottom = true; change('comment', [text]); },
  chatPin: (el, e) => { e.stopPropagation(); change('pin', [el.dataset.cid]); },
  chatSearch: () => { S.chat.searching = !S.chat.searching; S.chat.search = ''; render(); setTimeout(() => $('chatSearch') && $('chatSearch').focus(), 30); },
  chatJump: el => { S.chat.searching = false; S.chat.search = ''; S.chat.overlay = null; S.chat.focus = el.dataset.cid; render(); },
  chatOverlay: el => { S.chat.overlay = el.dataset.v || null; render(); },
  // notifications
  notifOpen: el => { const n = S.notifs.find(x => x.id === el.dataset.id); if (!n) return; store.markNotificationsRead([n.id]); S.menu = null;
    const x = n.extraData || {}; if (x.propId && deal(x.propId)) { openTracker(x.propId); if (x.action === 'open_chat') { S.chat.open = true; openChatDeal(x.propId); S.chat.focus = x.commentId || null; render(); } } else render(); },
  notifRead: () => { store.markNotificationsRead([...S.selectedNotifs]); S.selectedNotifs.clear(); render(); },
  notifDelete: el => { const ids = el.dataset.id ? [el.dataset.id] : [...S.selectedNotifs]; store.deleteNotifications(ids); ids.forEach(i => S.selectedNotifs.delete(i)); render(); },
  notifAllRead: () => store.markNotificationsRead(S.notifs.filter(n => !n.read).map(n => n.id)),
  // settings
  openPrefs: async () => { S.menu = null; S.modal = { kind: 'prefs', prefs: null }; render(); try { S.modal.prefs = await store.loadPrefs(); } catch (e) { S.modal = null; toast('Could not load settings', '', true); } render(); },
  prefToggle: el => { const p = S.modal.prefs; p[el.dataset.k] = !p[el.dataset.k]; S.modal.saved = false; render(); },
  savePrefs: async () => { const m = S.modal, p = m.prefs; m.busy = true; render();
    try { await store.savePrefs({ comments: !!p.comments, new_assets: !!p.new_assets, completions_phase: !!p.completions_phase, completions_task: !!p.completions_task, completions_subtask: !!p.completions_subtask, drafts_links: !!p.drafts_links, task_turns: !!p.task_turns, daily_brief: !!p.daily_brief, reminders: !!p.reminders, reminder_interval: p.reminder_interval || '4' });
      m.saved = true; setTimeout(() => { if (S.modal === m) { S.modal = null; render(); } }, 1200); } catch (e) { toast('Error Saving!', '', true); }
    m.busy = false; render(); },
  resetPrefs: async () => { try { S.modal.prefs = { ...S.modal.prefs, ...(await store.resetPrefs()) }; render(); toast('Settings Reset', 'Notification preferences have been restored to their defaults.'); } catch (e) {} },
  enablePush: async () => { S.modal.push = 'busy'; render(); S.modal.push = await store.enablePush() ? 'ok' : 'fail'; render(); },
  wipeDevices: async () => { try { await store.wipeDevices(); S.modal.push = 'wiped'; render(); } catch (e) {} },
  openTeam: () => { if (!isManager()) return; S.menu = null; S.modal = { kind: 'team' }; render(); },
  refreshTeam: async () => { const m = S.modal; m.busy = true; render();
    try { const r = await store.callFunction('refreshDirectory', {}); toast('Team copied from the hub', `${r.people} people in ${r.depts} departments.`); }
    catch (e) { toast('Could not reach the hub', e.message || 'Try again later.', true); }
    m.busy = false; render(); },
  // SOP
  sopStrategy: el => { S.sopStrategy = el.dataset.v; render(); },
  sopEdit: () => { if (!canEditSop()) return; const data = JSON.parse(JSON.stringify(sop())); S.sopEdit = { data, strategy: S.sopStrategy && data[S.sopStrategy] ? S.sopStrategy : Object.keys(data)[0] }; render(); },
  sopEditStrategy: el => { S.sopEdit.strategy = el.dataset.v; render(); },
  sopCancel: () => confirmBox('Discard Your SOP Changes?', 'Nothing has been saved.', 'Discard', () => { S.sopEdit = null; render(); }),
  sopSave: () => confirmBox('Save The SOP?', 'Deals deployed from now on use the new SOP. Deals already in the pipeline keep their own tasks.', 'Save SOP', async () => {
    const ed = S.sopEdit, problems = L.sopProblems(ed.data); if (problems.length) return toast('Not Saved', problems[0], true);
    ed.busy = true; render();
    try { await store.saveSop(Object.entries(ed.data).map(([name, tasks], i) => ({ name, order: i + 1, tasks: tasks.map(cleanSopTask) }))); S.sopEdit = null; toast('SOP saved', 'New deals use it from now on.'); }
    catch (e) { ed.busy = false; toast('Not Saved', e.code === 'permission-denied' ? 'Only Carlos and Systems can save the SOP.' : 'Try again.', true); }
    render(); }, false),
  sopAdd: el => { const ed = S.sopEdit, list = ed.data[ed.strategy], what = el.dataset.what, nid = 'sop_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (what === 'phase') { const n = new Set(list.map(t => t.phase)).size + 1; list.push({ id: nid, phase: `Phase ${toRoman(n)}: New Phase`, mainTask: 'New Group', title: 'New Task', weight: 0, defaultAssignee: 'Carlos' }); }
    else if (what === 'group') { const last = list.map(t => t.phase).lastIndexOf(el.dataset.phase); list.splice(last + 1, 0, { id: nid, phase: el.dataset.phase, mainTask: 'New Group', title: 'New Task', weight: 0, defaultAssignee: 'Carlos' }); }
    else { const last = list.map(t => t.phase + '\u0000' + t.mainTask).lastIndexOf(el.dataset.phase + '\u0000' + el.dataset.group); list.splice(last + 1, 0, { id: nid, phase: el.dataset.phase, mainTask: el.dataset.group, title: '', weight: 0, defaultAssignee: 'Carlos' }); }
    render(); },
  sopSubAdd: el => { const t = S.sopEdit.data[S.sopEdit.strategy][+el.dataset.i]; t.defaultSubtasks = [...(t.defaultSubtasks || []), '']; render();
    requestAnimationFrame(() => { const ins = document.querySelectorAll(`[data-change="sopSub"][data-i="${el.dataset.i}"]`); if (ins.length) ins[ins.length - 1].focus(); }); },
  sopSubRemove: el => { const t = S.sopEdit.data[S.sopEdit.strategy][+el.dataset.i]; t.defaultSubtasks.splice(+el.dataset.si, 1); if (!t.defaultSubtasks.length) delete t.defaultSubtasks; render(); },
  sopRemove: el => { const list = S.sopEdit.data[S.sopEdit.strategy], i = +el.dataset.i; confirmBox('Remove This Task From The SOP?', `"${list[i].title || 'Untitled'}" will not be added to new deals. Existing deals keep it.`, 'Remove', () => { list.splice(i, 1); render(); }); },
  sopOptionAdd: el => { const t = S.sopEdit.data[S.sopEdit.strategy][+el.dataset.i]; t.dropdownOptions = [...(t.dropdownOptions || []), { title: 'New Path', defaultAssignee: t.defaultAssignee || 'Carlos' }]; render(); },
  sopOptionRemove: el => { const t = S.sopEdit.data[S.sopEdit.strategy][+el.dataset.i]; t.dropdownOptions.splice(+el.dataset.oi, 1); if (!t.dropdownOptions.length) delete t.dropdownOptions; render(); },
  sopAddStrategy: () => { const ed = S.sopEdit; let n = 'New Strategy', k = 2; while (ed.data[n]) n = 'New Strategy ' + k++; ed.data[n] = [{ id: 'sop_' + Date.now().toString(36), phase: 'Phase I: New Phase', mainTask: 'New Group', title: 'New Task', weight: 100, defaultAssignee: 'Carlos' }]; ed.strategy = n; render(); },
  sopRemoveStrategy: () => { const ed = S.sopEdit; confirmBox(`Remove ${ed.strategy}?`, 'New deals can no longer use it. Existing deals keep their tasks.', 'Remove', () => { delete ed.data[ed.strategy]; ed.strategy = Object.keys(ed.data)[0]; render(); }); },
  helpPart: el => { S.helpPart = el.dataset.v; render(); }
};
const toRoman = n => [['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]].reduce((s, [r, v]) => { while (n >= v) { s += r; n -= v; } return s; }, '');
function cleanSopTask(t) {
  const o = { id: t.id, phase: t.phase.trim(), mainTask: (t.mainTask || '').trim(), title: (t.title || '').trim(), weight: Number(t.weight) || 0 };
  if (t.dropdownOptions && t.dropdownOptions.length) o.dropdownOptions = t.dropdownOptions.map(x => ({ title: x.title.trim(), defaultAssignee: x.defaultAssignee }));
  else o.defaultAssignee = t.defaultAssignee || 'Unassigned';
  if (t.draftsAndHyperlinks && t.draftsAndHyperlinks.length) o.draftsAndHyperlinks = [...t.draftsAndHyperlinks];
  const subs = (t.defaultSubtasks || []).map(x => String(x || '').trim()).filter(Boolean);
  if (subs.length) o.defaultSubtasks = subs;
  if (t.splitWeight) o.splitWeight = true;   // new optional SOP field (approved): deals get the task as isSOW (weight split across subtasks)
  return o;
}

// fields: data-change (on change), data-input (as you type), data-enter (Enter key)
const CHANGE = {
  saveTemplate: el => change('saveTemplate', [tgOf(el), el.value]),
  deployCsv: el => { const f = el.files[0]; if (!f) return; const r = new FileReader(); r.onload = e => { S.modal.csv = e.target.result; S.modal.csvName = f.name; render(); }; r.readAsText(f); },
  uploadFiles: async el => { const files = [...el.files], m = S.menu, tg = el.dataset.tid ? tgOf(el) : {}; if (!files.length) return;
    m.uploading = true; render();
    for (const f of files) { try { const meta = await store.uploadFile(m.dealId, f); await change('addFile', [tg, meta], m.dealId); } catch (e) { toast('Not Uploaded', e instanceof L.EditError ? e.message : `${f.name} could not be uploaded.`, true); } }
    m.uploading = false; render(); },
  notifPick: el => { const id = el.dataset.id; if (el.checked) S.selectedNotifs.add(id); else S.selectedNotifs.delete(id); render(); },
  notifAll: el => { if (el.checked) S.notifs.forEach(n => S.selectedNotifs.add(n.id)); else S.selectedNotifs.clear(); render(); },
  injCheck: el => { S.modal.state[el.dataset.k] = el.checked; },
  injWeightSet: el => { S.modal.state.weight = el.value; render(); },
  deductWeight: el => { S.modal.state.deductions[+el.dataset.i].weight = parseFloat(el.value) || 0; render(); },
  sopField: el => { const t = S.sopEdit.data[S.sopEdit.strategy][+el.dataset.i], k = el.dataset.k;
    t[k] = k === 'weight' ? (parseFloat(el.value) || 0) : k === 'defaultSubtasks' ? el.value.split('\n').map(s => s.trim()).filter(Boolean) : el.value; render(); },
  sopOption: el => { S.sopEdit.data[S.sopEdit.strategy][+el.dataset.i].dropdownOptions[+el.dataset.oi].title = el.value; },
  sopSub: el => { S.sopEdit.data[S.sopEdit.strategy][+el.dataset.i].defaultSubtasks[+el.dataset.si] = el.value; },
  sopSplit: el => { const t = S.sopEdit.data[S.sopEdit.strategy][+el.dataset.i]; if (el.checked) t.splitWeight = true; else delete t.splitWeight; render(); },
  sopRename: el => { const list = S.sopEdit.data[S.sopEdit.strategy], v = el.value.trim(); if (!v) return render();
    list.forEach(t => { if (el.dataset.what === 'phase' && t.phase === el.dataset.old) t.phase = v; if (el.dataset.what === 'group' && t.phase === el.dataset.phase && t.mainTask === el.dataset.old) t.mainTask = v; }); render(); },
  sopRenameStrategy: el => { const ed = S.sopEdit, v = el.value.trim(); if (!v || ed.data[v]) return render();
    ed.data = Object.fromEntries(Object.entries(ed.data).map(([k, t]) => [k === ed.strategy ? v : k, t])); ed.strategy = v; render(); }
};
const INPUT = {
  deployAddress: el => { S.modal.address = el.value; if (S.modal.bad) { S.modal.bad = false; el.classList.remove('bad'); } },
  confirmWord: el => { S.modal.ok = el.value === 'Confirm'; const b = document.querySelector('[data-act="removeSub"]'); if (b) b.disabled = !S.modal.ok; },
  inj: el => { S.modal.state[el.dataset.k] = el.value; },
  chatSearch: el => { S.chat.search = el.value; render(); }
};
const ENTER = { saveLink: A.saveLink, deploy: A.deploy, removeDeal: A.removeDeal, chatSend: A.chatSend, addLinkFile: A.addLinkFile };

// ---------------------------------------------------------------- SOP editor: drag to reorder (mouse, touch, pen)
// Each draggable row carries data-dz (its level and scope: "group:<phase>", "task:<phase>::<group>", "sub:<task index>")
// and data-dv (which one). A row only moves among rows with the same data-dz.
let drag = null, dragRedraw = false;
const clearMarks = () => document.querySelectorAll('.dz-before, .dz-after').forEach(x => x.classList.remove('dz-before', 'dz-after'));
document.addEventListener('pointerdown', e => {
  let g = e.target.closest('[data-grip]'); if (!g || !S.sopEdit) return;
  let row = g.closest('[data-dz]'); if (!row) return;
  e.preventDefault();
  // a text box still focused holds back the redraw; finish it now so the row being dragged is the up-to-date one
  const a = document.activeElement;
  if (a && a.matches('input, textarea')) {
    const dz = row.dataset.dz, dv = row.dataset.dv; a.blur(); queued = false; draw();
    row = [...document.querySelectorAll('[data-dz]')].find(r => r.dataset.dz === dz && r.dataset.dv === dv); if (!row) return;
    g = row.querySelector('[data-grip]');
  }
  try { g.setPointerCapture(e.pointerId); } catch (x) {}
  drag = { row, dz: row.dataset.dz, from: row.dataset.dv, target: null, after: false }; row.classList.add('dragging'); document.body.classList.add('is-dragging');
});
document.addEventListener('pointermove', e => {
  if (!drag) return; e.preventDefault();
  const under = document.elementFromPoint(e.clientX, e.clientY);
  let t = under && under.closest('[data-dz]'); while (t && t.dataset.dz !== drag.dz) t = t.parentElement && t.parentElement.closest('[data-dz]');
  clearMarks(); drag.target = null;
  if (t && t !== drag.row) { const r = t.getBoundingClientRect(); drag.target = t; drag.after = e.clientY > r.top + r.height / 2; t.classList.add(drag.after ? 'dz-after' : 'dz-before'); }
  if (e.clientY < 70) window.scrollBy(0, -12); else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 12);
}, { passive: false });
const endDrag = () => {
  if (!drag) return; const d = drag; drag = null; clearMarks(); d.row.classList.remove('dragging'); document.body.classList.remove('is-dragging');
  if (d.target && S.sopEdit) sopReorder(d.dz, d.from, d.target.dataset.dv, d.after);
  if (d.target || dragRedraw) { dragRedraw = false; render(); }
};
document.addEventListener('pointerup', endDrag); document.addEventListener('pointercancel', endDrag);
function sopReorder(dz, from, to, after) {
  const list = S.sopEdit.data[S.sopEdit.strategy], [level] = dz.split(':');
  if (level === 'sub') {   // a default subtask within its task
    const t = list[+dz.slice(4)], a = t.defaultSubtasks, [x] = a.splice(+from, 1);
    let j = +to; if (+from < j) j--; a.splice(after ? j + 1 : j, 0, x); return;
  }
  if (level === 'task') {  // a task within its group (indexes into the strategy's list)
    const [x] = list.splice(+from, 1); let j = +to; if (+from < j) j--; list.splice(after ? j + 1 : j, 0, x); return;
  }
  const phase = dz.slice(6);   // a whole group (all its tasks) within its phase
  const block = list.filter(t => t.phase === phase && t.mainTask === from), rest = list.filter(t => !(t.phase === phase && t.mainTask === from));
  const idx = rest.map((t, i) => t.phase === phase && t.mainTask === to ? i : -1).filter(i => i >= 0); if (!idx.length) return;
  rest.splice(after ? idx[idx.length - 1] + 1 : idx[0], 0, ...block); list.splice(0, list.length, ...rest);
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  if (el.tagName === 'A') return;
  const f = A[el.dataset.act]; if (f) { if (el.tagName === 'BUTTON') e.preventDefault(); f(el, e); }
});
document.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el && CHANGE[el.dataset.change]) CHANGE[el.dataset.change](el, e); });
document.addEventListener('input', e => { const el = e.target.closest('[data-input]'); if (el && INPUT[el.dataset.input]) INPUT[el.dataset.input](el, e); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (S.menu) { S.menu = null; render(); } else if (S.modal) { S.modal = null; render(); } return; }
  if (e.key !== 'Enter' || e.shiftKey) return;
  const el = e.target.closest('[data-enter]'); if (el && ENTER[el.dataset.enter]) { e.preventDefault(); ENTER[el.dataset.enter](el, e); }
});
document.addEventListener('focusout', () => setTimeout(() => { if (wasDeferred()) render(); }, 0));
window.addEventListener('resize', () => { if (S.menu) render(); });

// ---------------------------------------------------------------- start
let ver = 0;
function onUser(u, imp = '') {
  S.user = u; S.imp = imp; S.gateError = '';
  store.listenDeals((deals, changed) => {
    const seen = new Set();
    deals.forEach(d => { Object.defineProperty(d, '__v', { value: ++ver, enumerable: false }); S.saved.set(d.id, d); seen.add(d.id); });
    changed.forEach(id => (S.pending.get(id) || []).filter(p => p.done).forEach(p => dropPending(id, p)));
    [...S.saved.keys()].forEach(id => { if (!seen.has(id)) S.saved.delete(id); });
    if (S.activeId && !S.saved.has(S.activeId)) S.activeId = null;
    if (S.chat.open && S.chat.view === 'deal' && S.activeId && changed.includes(S.activeId) && unreadFor(deal(S.activeId))) { S.chat.stickBottom = true; store.markChatRead(S.activeId); }
    if (!S.ready) { S.ready = true; hideBoot(); const want = new URLSearchParams(location.search).get('deal'); if (want && S.saved.has(want)) openTracker(want); }
    render();
  }, () => render());
  store.listenNotifications((list, added) => {
    S.notifs = list; render();
    const latest = added.sort((a, b) => b.createdAt - a.createdAt)[0];
    if (latest && !latest.read) toast(latest.title, latest.body);
  });
  store.listenSettings((what, data) => { if (what === 'sop') S.sopDoc = data; else { S.directory = data; autoTeam(); } render(); });
  store.startPresence(list => { S.online = list; render(); });
  store.loadPrefs().catch(() => {});
  store.startMessaging((t, b) => toast(t || 'Notification', b || ''));
  document.body.dataset.appReady = '1';
  document.body.setAttribute('data-app-ready', '');
  render();
}
// Like TC Checklist, the team follows the hub on its own: when a Manager opens DISPO OPS and the copy is over an hour
// old, it is refreshed quietly (once per visit; Refresh From Hub still does it by hand). Not while signed in as someone.
function autoTeam() {
  if (S.teamAuto || S.imp || !isManager() || !L.teamStale(S.directory, Date.now())) return;
  S.teamAuto = true;
  store.callFunction('refreshDirectory', {}).catch(e => console.warn('Team refresh from the hub failed:', (e && e.message) || e));
}
function hideBoot() { const b = $('boot'); if (b) { b.classList.add('gone'); setTimeout(() => b.remove(), 400); } }

function start() {
  let saved = null; try { saved = localStorage.getItem('tchb_theme'); } catch (e) {}
  setTheme(saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'), false);
  startAurora($('aurora'));
  startTooltips();
  store.syncClock(); setInterval(store.syncClock, 15 * 60 * 1000);
  const slow = setTimeout(() => { const s = document.querySelector('#boot small'); if (s) s.textContent = 'Almost ready…'; }, 1500);
  store.init({
    onUser: (u, imp) => { clearTimeout(slow); onUser(u, imp); },
    onSignedOut: () => { clearTimeout(slow); S.user = null; hideBoot(); render(); },
    onDenied: msg => { clearTimeout(slow); S.user = null; S.gateError = esc(msg); hideBoot(); render(); }
  });
}
start();
// test runs only (emulator): the same actions as the buttons, for the data-shape comparison
if (store.EMU) window.__dispo = { S, deal, change, A, CHANGE, render, openTracker };
