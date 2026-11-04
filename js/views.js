// The screens, as markup built from the state. Buttons carry data-act (what to do) and the ids of what they act on;
// app.js handles them. Everything shown from the database goes through esc().
import { icon } from './icons.js';
import { esc, attr, safeUrl, dpHtml } from './ui.js';
import { S, deal, allDeals, label, face, ownerGroups, myName, isManager, canEditSop, sop, strategies, strategyClass, people, managers, personOf } from './state.js';
import * as L from './logic.js';
import { now } from './store.js';

// Phones show the square TCHB mark so the logo, the Live clock, the bell and the photo fit on one row.
const LOGO = `<img class="logo-light lg-full" src="assets/logo-full.png" alt="Total Cash Home Buyers"><img class="logo-dark lg-full" src="assets/logo-full-white.png" alt="Total Cash Home Buyers"><img class="lg-mark" src="assets/logo-mark.png" alt="Total Cash Home Buyers">`;
const tgAttrs = (t, ti, s, si) => attr({ 'data-tid': t.id, 'data-ti': ti, 'data-sid': s ? s.id : undefined, 'data-si': s ? si : undefined });
const isOverdue = due => due && due < now();
const dueChip = (due, act, extra = '') => due
  ? `<button type="button" class="chip ${isOverdue(due) ? 'red' : ''}" data-act="${act}" ${extra} title="Due ${esc(L.when(due))}">${icon('cal', 13)}${esc(L.dueShort(due))}</button>` : '';
const romanOf = phase => { const m = /Phase\s+([IVXL]+)\b/.exec(phase || ''); return m ? m[1] : '-'; };
const noteCount = it => (it.notes || []).length + (it.templateText ? 1 : 0);
const fileCount = it => (it.files || []).length + (it.hyperlink ? 1 : 0);
export const pctClass = p => p === 100 ? 'done' : '';

// ---------------------------------------------------------------- header (the hub's header standard, docs/HEADER.md)
// Left: logo and the Live clock (clock + save status in one pill). Middle: the page tabs. Right: bell,
// Active, light/dark (icons only), photo. Phones: logo, clock (time only), bell and photo; the rest is in the photo menu.
const SYNC = { ready: 'Live', saving: 'Saving…', unsaved: 'Not Saved', offline: 'Offline' };
export function header(st = { state: 'ready' }) {
  const unread = S.notifs.filter(n => !n.read).length, u = S.user, name = myName(), photo = u && personOf(L.storedNameFor(u.email));
  const tab = (k, txt) => `<button type="button" data-act="tab" data-tab="${k}" aria-pressed="${S.tab === k}">${txt}</button>`;
  const dark = document.documentElement.dataset.theme === 'dark';
  const imp = S.imp ? `<div class="imp-bar" role="status"><span>Viewing DISPO OPS as ${esc(myName(true))} (${esc(u.email)})</span><button type="button" data-act="backToRemy" ${S.backBusy ? 'disabled' : ''}>${S.backBusy ? 'Switching Back…' : 'Back To Remy'}</button></div>` : '';
  const live = `<button type="button" class="live ${st.state}" data-act="menu" data-menu="sync" aria-haspopup="true" aria-label="Save status: ${SYNC[st.state]}. Show details" title="${esc({ ready: 'Every change is saved for the whole team', saving: 'Saving your changes for the whole team…', unsaved: st.error || 'Not saved', offline: 'No connection' }[st.state])}"><i class="ld"></i><span class="lt"><span class="cd" id="clockD"></span><span id="clockT"></span></span>${st.state === 'ready' ? '<span class="sheen" aria-hidden="true"></span>' : ''}</button>`;
  return `${imp}<div class="header-row">
    <div class="hg hl"><button type="button" class="brand" data-act="tab" data-tab="dashboard" aria-label="Master Dashboard">${LOGO}</button>${u ? live : ''}</div>
    ${u ? `<div class="hm"><nav class="seg tabs" aria-label="Pages">${tab('dashboard', 'Master Dashboard')}${tab('tracker', 'Active Deal Tracker')}${tab('sop', 'SOP Reference')}</nav></div>` : ''}
    <div class="hg hr">
      ${u ? `<button type="button" class="icon-btn glass" data-act="menu" data-menu="notifs" title="Notifications" aria-label="Notifications, ${unread} unread">${icon('bell', 19)}${unread ? `<span class="badge">${unread > 99 ? '99+' : unread}</span>` : ''}</button>
      <button type="button" class="active-pill glass dsk" data-act="menu" data-menu="active" title="Who's online now"><span class="dot"></span>Active<b>${S.online.length || 1}</b></button>` : ''}
      <div class="seg glass theme ${u ? 'dsk' : ''}" role="group" aria-label="Theme"><button type="button" data-act="theme" data-v="light" aria-pressed="${!dark}" title="Light theme" aria-label="Light theme">${icon('sun', 16)}</button><button type="button" data-act="theme" data-v="dark" aria-pressed="${dark}" title="Dark theme" aria-label="Dark theme">${icon('moon', 16)}</button></div>
      ${u ? `<button type="button" class="avatar" data-act="menu" data-menu="user" title="${esc(name)}" aria-label="Account">${esc(L.initials(name))}${photo && photo.photo ? `<img src="${esc(photo.photo)}" alt="">` : ''}</button>` : ''}
    </div></div>`;
}
/** The Live details panel: the state, one sentence, when it last saved, and Retry Now or OK. */
export function syncPanel(st, lastSaved) {
  const head = { ready: 'Live: Everything Is Saved', saving: 'Saving…', unsaved: 'Not Saved', offline: 'Offline' }[st.state];
  const text = { ready: 'Every change you make is saved for the whole team as you go.', saving: 'Your latest change is on its way to the server.',
    unsaved: st.error || 'A change could not be saved.', offline: 'DISPO OPS can\'t reach the server. Changes can\'t be saved until the connection is back.' }[st.state];
  const saved = lastSaved ? 'Last saved ' + L.etDate(lastSaved) + ' ' + L.et12(lastSaved) + ' ' + L.etZone(lastSaved) : 'Nothing changed since you opened DISPO OPS.';
  return `<div class="menu pop live-pop" data-key="menu" role="dialog" aria-label="Save status"><b class="lp-h ${st.state}">${esc(head)}</b><p>${esc(text)}</p><small>${esc(saved)}</small>
    ${st.state === 'unsaved' ? '<button type="button" class="btn sm secondary" data-act="retrySave">Retry Now</button>' : '<button type="button" class="btn sm outline" data-act="closeMenu">OK</button>'}</div>`;
}
// ---------------------------------------------------------------- rings and bars (the hub's, docs/HEADER.md section 3)
export const ring = (pct, small = false) => `<span class="ring ${small ? 'sm' : ''} ${pct >= 100 ? 'done' : ''}" style="--p:${Math.max(0, Math.min(100, pct))}%" title="${pct}% done"><b>${pct}%</b></span>`;
export const bar = (done, total, what) => `<span class="pbar"><span class="progress ${total && done >= total ? 'done' : ''}"><i style="width:${total ? Math.round(done / total * 100) : 0}%"></i></span><span class="cnt">${done} of ${total} ${what} Done</span></span>`;
// The due chip and the Details button take the due date's colour: indigo when set, redder as it nears, red when late.
export function dueTint(o, done) {
  if (!o || !o.due) return null;
  const n = now(), start = Math.min(o.dueSet || o.createdAt || o.due - 7 * 864e5, o.due - 36e5);
  const pct = done ? 0 : Math.round(100 * Math.max(0, Math.min(1, (n - start) / (o.due - start))));
  return { late: n >= o.due && !done, color: done ? 'var(--tchb-gray-500)' : `color-mix(in srgb, var(--tchb-red-500) ${pct}%, var(--tchb-indigo-700))`,
    bg: done ? 'var(--tchb-gray-100)' : `color-mix(in srgb, var(--tchb-red-500) ${Math.round(5 + pct * 0.15)}%, transparent)` };
}
const tasksDone = d => d.tasks.filter(t => (t.isSOW && t.subtasks && t.subtasks.length) ? t.subtasks.every(s => s.completed) : L.isTaskDone(t)).length;
const pageTitle = (a, b, key) => `<section class="page-title" data-key="${key}"><h1 class="title">${a} <span class="accent">${b}</span></h1></section>`;

// ---------------------------------------------------------------- Master Dashboard
export function dashboard() {
  const deals = allDeals(), counts = { open: 0, closed: 0, cancelled: 0 };
  deals.forEach(d => counts[L.statusOf(d)]++);
  const list = L.viewDeals(deals, S.view), open = deals.filter(d => L.statusOf(d) === 'open');
  const overdue = open.reduce((n, d) => n + L.openDues(d).filter(x => isOverdue(x.due)).length + (isOverdue(d.due) ? 1 : 0), 0);
  const sorts = { edited_desc: 'Recently Edited', edited_asc: 'Oldest Edited', started_desc: 'Newest Added', started_asc: 'Oldest Added', due_asc: 'Due Soonest' };
  const views = ['open', 'closed', 'cancelled'].map(k => `<button type="button" data-act="view" data-v="${k}" aria-pressed="${S.view.status === k}">${L.STATUS[k]} <span class="n">${counts[k]}</span></button>`).join('');
  const rows = list.map(d => dealRow(d)).join(''), cards = list.map(d => dealCard(d)).join('');
  return `${pageTitle('DISPO', 'OPS', 'title-dash')}
    <section class="tabs-line" data-key="tabsline-${S.view.status}-${counts.open}-${counts.closed}-${counts.cancelled}-${overdue}">
      <div class="seg" role="group" aria-label="Deal status">${views}</div>
      <div class="stats"><div class="stat"><b>${counts.open}</b><span>Open Deals</span></div><div class="stat"><b class="${overdue ? 'red' : ''}">${overdue}</b><span>Overdue Items</span></div></div>
    </section>
    <section class="toolbar" data-key="tools-${S.view.strategy}-${S.view.sort}">
      <button type="button" class="pick glass-pick glass" data-act="menu" data-menu="strategyFilter">${icon('filter', 15)}<span>${S.view.strategy === 'All' ? 'All Strategies' : esc(S.view.strategy)}</span>${icon('down', 14, 2.5)}</button>
      <button type="button" class="pick glass-pick glass" data-act="menu" data-menu="sort"><span>${sorts[S.view.sort] || 'Recently Edited'}</span>${icon('down', 14, 2.5)}</button>
      <span class="spacer"></span>
      <button type="button" class="btn primary" data-act="openDeploy">${icon('plus', 18, 2.5)}Deploy New Asset Tracker</button>
    </section>
    ${list.length ? `<section class="card table-card" data-key="table" data-morph><div class="table-wrap" data-key="w" data-morph><table class="deals" data-key="t" data-morph><thead data-key="h"><tr><th>Address</th><th>Exit Strategy</th><th>Date Started</th><th>Time Last Edited</th><th>Next Agent</th><th>Next Step</th><th>Due</th><th>% Completion</th></tr></thead>
      <tbody data-morph data-key="tbody">${rows}</tbody></table></div></section>
      <section class="deal-cards" data-morph data-key="cards">${cards}</section>`
      : `<section class="empty" data-key="empty-${S.view.status}"><h3>No Deals Match Filters</h3><p>${S.view.status === 'open' ? 'Deploy a new asset tracker or clear your filters.' : 'Nothing is marked ' + L.STATUS[S.view.status] + ' yet.'}</p>${S.view.strategy !== 'All' ? '<button type="button" class="btn outline" data-act="clearFilter">Show All Strategies</button>' : ''}</section>`}`;
}
function nextStepCell(d, st) {
  if (!st.nextTaskId) return `<span class="muted">${esc(st.nextStep)}</span>`;
  return `<button type="button" class="next-step" data-act="jumpNext" data-id="${esc(d.id)}" data-tid="${esc(st.nextTaskId)}" data-sk="${esc(st.nextSectionKey)}" data-tip="${esc(st.nextTaskDetail)}" data-tip-title="Target Action"><b>${esc(st.nextStep)}</b><small>${esc(st.nextTaskDetail)}</small></button>`;
}
const agentCell = st => st.nextAgent === 'Completed' ? '<span class="chip green">Completed</span>' : st.nextAgent === '-' ? '-' : `<span class="owner static glass">${face(st.nextAgent)}<span class="nm">${esc(label(st.nextAgent))}</span></span>`;
function dueCell(d) {
  const n = L.nextDue(d), own = d.due;
  if (!own && !n) return '<span class="muted">-</span>';
  return `<div class="stack" style="gap:4px">${own ? `<span class="chip ${isOverdue(own) ? 'red' : ''}">${icon('flag', 13)}${esc(L.dueShort(own))}</span>` : ''}${n ? `<small class="muted" title="${esc(n.title)}">Next: ${esc(L.dueShort(n.due))}</small>` : ''}</div>`;
}
function dealRow(d) {
  const st = L.getPropStats(d), strategy = d.exitStrategy || 'Wholesale', [a, b] = L.timeSinceParts(d.dateLastEdited, now(), true);
  return `<tr data-key="${esc(d.id)}" data-act="openDeal" data-id="${esc(d.id)}">
    <td class="addr-cell">${esc(d.address)}</td>
    <td><span class="chip caps ${strategyClass(strategy)}">${esc(strategy)}</span></td>
    <td class="nowrap">${esc(L.whenShort(d.dateStarted))}</td>
    <td class="ago">${esc(a)}${b ? `<small>${esc(b)}</small>` : ''}</td>
    <td>${agentCell(st)}</td><td>${nextStepCell(d, st)}</td><td>${dueCell(d)}</td>
    <td class="ring-cell">${ring(st.percent, true)}</td></tr>`;
}
function dealCard(d) {
  const st = L.getPropStats(d), strategy = d.exitStrategy || 'Wholesale', tint = dueTint(d, L.statusOf(d) !== 'open');
  return `<article class="card deal-card" data-key="${esc(d.id)}" data-act="openDeal" data-id="${esc(d.id)}">
    <span class="addr-cell">${esc(d.address)}</span>
    <div class="dc-prog">${ring(st.percent, true)}${bar(tasksDone(d), d.tasks.length, 'Tasks')}</div>
    <div class="dc-tags"><span class="chip caps ${strategyClass(strategy)}">${esc(strategy)}</span>${tint ? `<span class="chip" style="background:${tint.bg};color:${tint.color}">${icon('flag', 13)}${tint.late ? 'Late ' : ''}${esc(L.dueShort(d.due))}</span>` : ''}<small class="muted">Edited ${esc(L.timeSince(d.dateLastEdited, now()))}</small></div>
    <div class="dc-foot">${agentCell(st)}${nextStepCell(d, st)}</div></article>`;
}

// ---------------------------------------------------------------- Active Deal Tracker
// Previous / Next: the dashboard's filter and sort, within the open deal's own status (Open, Closed or Cancelled)
export function trackerList() { const d = S.activeId && deal(S.activeId); return L.viewDeals(allDeals(), { ...S.view, status: d ? L.statusOf(d) : S.view.status }); }
export function tracker() {
  const d = S.activeId && deal(S.activeId);
  const list = trackerList(), idx = d ? list.findIndex(x => x.id === d.id) : -1;
  const nav = `<section class="nav-row" data-key="nav-${S.activeId}-${idx}-${list.length}">
    <button type="button" class="btn outline" data-act="tab" data-tab="dashboard">${icon('back', 18, 2.5)}<span>Back<span class="long"> To Master Dashboard</span></span></button>
    ${d ? `<button type="button" class="dp-round" data-act="step" data-n="-1" ${idx > 0 ? '' : 'disabled'} aria-label="Previous deal" title="Previous deal">${icon('back', 18, 2.5)}</button>
    <span class="count">${idx >= 0 ? `${idx + 1} of ${list.length}` : 'Not in this view'}</span>
    <button type="button" class="dp-round" data-act="step" data-n="1" ${idx >= 0 && idx < list.length - 1 ? '' : 'disabled'} aria-label="Next deal" title="Next deal">${icon('right', 18, 2.5)}</button>` : ''}
    <button type="button" class="pick glass-pick glass" data-act="menu" data-menu="dealPick" style="max-width:340px">${icon('home', 15)}<span>${d ? esc(d.address) : 'Select An Active Deal'}</span>${icon('down', 14, 2.5)}</button>
    <span class="grow"></span><button type="button" class="btn primary" data-act="openDeploy">${icon('plus', 18, 2.5)}Add New Asset</button></section>`;
  if (!d) return nav + `<section class="empty" data-key="none"><h3>No Asset Selected</h3><p>Select a property above to view and manage its checklist.</p><button type="button" class="btn secondary" data-act="tab" data-tab="dashboard">Return To Master Dashboard</button></section>`;
  return nav + dealHead(d) + phases(d) + `<section class="row" data-key="remove" style="justify-content:center;padding-top:12px"><button type="button" class="btn danger sm" data-act="openRemoveDeal">${icon('trash', 15)}Remove Asset From Pipeline</button></section>`;
}

function dealHead(d) {
  const st = L.getPropStats(d), status = L.statusOf(d), locked = L.isLocked(d), strategy = d.exitStrategy || 'Wholesale', n = L.nextDue(d);
  const allNotes = (d.notes || []).length + d.tasks.reduce((s, t) => s + noteCount(t) + (t.subtasks || []).reduce((q, x) => q + noteCount(x), 0), 0);
  const allFiles = (d.files || []).length + d.tasks.reduce((s, t) => s + fileCount(t) + (t.subtasks || []).reduce((q, x) => q + fileCount(x), 0), 0);
  const af = S.agentFilter;
  return `<section class="card deal-head" data-key="head-${esc(d.id)}" data-morph>
    <div class="top" data-key="top"><div class="hero-text" style="flex:1 1 420px">
      <div class="tagrow" style="margin:0"><span class="chip caps ${strategyClass(strategy)}">${esc(strategy)}</span>${status !== 'open' ? `<span class="chip caps ${status === 'closed' ? 'green' : 'red'}">${L.STATUS[status]}</span>` : '<span class="chip caps gray">Open</span>'}</div>
      <h1 class="title addr" id="tracker-address">${esc(d.address)}</h1>
      <div class="meta"><span>Created <b>${esc(L.when(d.dateStarted))}</b></span><span>Updated <b>${esc(L.when(d.dateLastEdited))}</b>${d.lastEditedByName ? ` by <b>${esc(label(d.lastEditedByName))}</b>` : ''}</span></div></div>
      <div class="deal-progress">${ring(st.percent)}<div class="stack" style="gap:6px;min-width:0;flex:1"><span class="dp-l">Total Progress</span>${bar(tasksDone(d), d.tasks.length, 'Tasks')}
        <small class="muted">${st.nextTaskId ? `Next: <b>${esc(st.nextTaskDetail)}</b> · ${esc(label(st.nextAgent))}` : 'All workflow tasks finished'}</small></div></div></div>
    ${locked ? `<div class="banner ${status}" data-key="banner">${icon(status === 'closed' ? 'check' : 'x', 18, 2.5)}<span class="grow">${L.STATUS[status]} on ${esc(L.when(d.statusAt))}${d.statusBy ? ' by ' + esc(d.statusBy) : ''}. The checklist is read-only; chat stays open.</span><button type="button" class="btn sm outline" data-act="setStatus" data-v="open">Reopen</button></div>` : ''}
    <div class="tools" data-key="tools">
      <button type="button" class="btn sm ${d.due ? 'outline' : 'glass'}" data-act="pop" data-pop="due" ${locked ? 'disabled' : ''} title="The deal's due date">${icon('flag', 15)}${d.due ? `<span style="${isOverdue(d.due) ? 'color:var(--tchb-red-500)' : ''}">Due ${esc(L.dueShort(d.due))}</span>` : 'Set Due Date'}</button>
      ${n ? `<button type="button" class="chip ${isOverdue(n.due) ? 'red' : ''}" data-act="jumpTask" data-tid="${esc(n.tid)}" title="${esc(n.title)}">${icon('cal', 13)}Next Due ${esc(L.dueShort(n.due))}</button>` : ''}
      <span class="iconbar"><button type="button" class="mini labelled ${allNotes ? 'has' : ''}" data-act="pop" data-pop="notes" title="Notes: every note and draft on this deal">${icon('note')}Notes${allNotes ? ` ${allNotes}` : ''}</button>
      <button type="button" class="mini labelled ${allFiles ? 'has' : ''}" data-act="pop" data-pop="files" title="Files & Links on this deal">${icon('clip')}Files & Links${allFiles ? ` ${allFiles}` : ''}</button>
      <button type="button" class="mini labelled" data-act="pop" data-pop="activity" title="Activity: every change, who made it and when">${icon('activity')}Activity</button></span>
      <span class="grow"></span>
      <button type="button" class="pick glass-pick glass" data-act="menu" data-menu="agentFilter" title="Show one person's tasks">${icon('filter', 15)}<span>${af === 'All' ? 'All Agents' : esc(label(af))}</span>${icon('down', 14, 2.5)}</button>
      <button type="button" class="btn sm outline" data-act="menu" data-menu="status">${icon('flag', 15)}Status${icon('down', 14, 2.5)}</button>
      <button type="button" class="btn sm secondary" data-act="openInject" ${locked ? 'disabled' : ''}>${icon('plus', 16, 2.5)}Inject Custom Task</button>
    </div></section>`;
}

function phases(d) {
  const locked = L.isLocked(d), structure = new Map();
  d.tasks.forEach((t, i) => {
    if (S.agentFilter !== 'All' && !L.sameAgent(t.assignee, S.agentFilter)) return;
    if (!structure.has(t.phase)) structure.set(t.phase, new Map());
    const g = structure.get(t.phase); if (!g.has(t.mainTask)) g.set(t.mainTask, []);
    g.get(t.mainTask).push({ t, i });
  });
  if (!structure.size) return `<section class="card task-filter-empty" data-key="nofilter">No tasks found for ${esc(label(S.agentFilter))}.</section>`;
  let out = '';
  for (const [phase, groups] of structure) {
    let gh = '';
    for (const [mainTask, items] of groups) {
      const key = L.sectionKeyOf(phase, mainTask), gs = L.groupStats(items.map(x => x.t));
      // finished groups close themselves; reopened ones open again (as before)
      if (S.sectionDone[key] !== undefined && S.sectionDone[key] !== gs.allCompleted) S.sections[key] = gs.allCompleted ? 'closed' : 'open';
      else if (S.sections[key] === undefined) S.sections[key] = gs.allCompleted ? 'closed' : 'open';
      S.sectionDone[key] = gs.allCompleted;
      const open = S.sections[key] === 'open';
      gh += `<div class="group" data-key="g-${key}" data-morph>
        <button type="button" class="group-head" data-key="gh" data-act="toggleGroup" data-sk="${key}" aria-expanded="${open}">${icon('right', 16, 2.5).replace('class="i"', 'class="i chev"')}<h3>${esc(mainTask || 'Tasks')}</h3><span class="gp">${gs.percent}%</span><span class="chip caps ${gs.allCompleted ? 'green' : 'gold'}">${gs.allCompleted ? 'Complete' : 'Pending'}</span></button>
        ${open ? `<div class="group-body" data-key="gb" data-morph>${items.map(({ t, i }) => taskCard(d, t, i, locked)).join('')}</div>` : ''}</div>`;
    }
    out += `<section class="card phase" data-key="p-${esc(phase)}" data-morph><div class="phase-head" data-key="ph"><span class="num">${romanOf(phase)}</span><h2>${esc(phase)}</h2></div>${gh}</section>`;
  }
  return out;
}

function draftLabel(it) { return String(it.title || '').toLowerCase().includes('approved') ? 'Template' : 'Draft'; }
const wantsDraft = it => String(it.title || '').toLowerCase().includes('draft') || it.requiresDraft;
function featureButtons(it, key, tg, locked) {
  let h = '';
  const href = safeUrl(it.hyperlink);
  if (it.requiresLink || it.hyperlink) {
    h += href ? `<a class="mini has" href="${esc(href)}" target="_blank" rel="noopener" title="${esc(it.hyperlink)}">${icon('ext', 16)}Link</a><button type="button" class="mini" data-act="box" data-box="link:${key}" ${locked ? 'disabled' : ''} title="Edit Link">${icon('pen', 14)}</button>`
      : `<button type="button" class="mini labelled" data-act="box" data-box="link:${key}" ${locked ? 'disabled' : ''}>${icon('link', 16)}Add Link</button>`;
  }
  if (wantsDraft(it)) h += `<button type="button" class="mini labelled ${it.templateText ? 'has' : ''}" data-act="box" data-box="draft:${key}">${icon('draft', 16)}${draftLabel(it)}</button>`;
  return h;
}
function featureBoxes(it, key, tg, locked) {
  let h = '';
  if (S.boxes['link:' + key]) h += `<div class="inline-box" data-key="lb"><div class="row" style="flex-wrap:nowrap"><input class="input" id="link_${key}" value="${esc(it.hyperlink || '')}" placeholder="https://..." data-enter="saveLink" ${tg}><button type="button" class="btn sm secondary" data-act="saveLink" ${tg}>Save</button><button type="button" class="mini" data-act="clearLink" ${tg} title="Remove Link">${icon('trash', 16)}</button></div></div>`;
  if (S.boxes['draft:' + key]) h += `<div class="inline-box" data-key="db"><textarea class="input" id="draft_${key}" data-change="saveTemplate" ${tg} ${locked ? 'readonly' : ''} placeholder="Paste text here...">${esc(it.templateText || '')}</textarea>
    <div class="row"><small>${it.templateLastEditedBy ? `Last saved by <b>${esc(label(it.templateLastEditedBy))}</b> · ${esc(L.when(it.templateLastEditedAt))}` : 'Saves automatically when you click away'}</small>${it.templateText ? `<button type="button" class="btn sm ghost" data-act="copy" data-text="${esc(it.templateText)}">${icon('copy', 14)}Copy</button>` : ''}</div></div>`;
  return h;
}
// The Details button: one clipboard (notes + files count, the due date's colour) instead of four separate buttons.
const ICON_DETAILS = '<svg class="i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01"/></svg>';
function detailsBtn(it, tg, done, sub) {
  const k = noteCount(it) + fileCount(it), t = dueTint(it, done);
  const style = t ? `color:${t.color};background:${t.bg}` : `color:${k ? 'var(--tchb-indigo-700)' : 'var(--tchb-gray-500)'}`;
  return `<button type="button" class="details ${sub ? 'sm' : ''}" data-act="details" ${tg} style="${style}" title="${sub ? 'Due date, notes and files' : 'Due date, notes, activity and files'}" aria-label="Details${k ? ', ' + k + ' notes and files' : ''}${t && t.late ? ', overdue' : ''}">${ICON_DETAILS}${k ? `<span>${k}</span>` : ''}</button>`;
}
const dueTag = (o, done, tg) => { const t = dueTint(o, done); return t ? `<button type="button" class="chip due" data-act="details" data-part="due" ${tg} style="background:${t.bg};color:${t.color}" title="Due ${esc(L.when(o.due))}">${icon('cal', 13)}${t.late ? 'Overdue · ' : ''}${esc(L.dueShort(o.due))}</button>` : ''; };
// Who last changed a task or subtask, and when (from the Activity history; nothing for changes made before it existed).
function lastChange(d, tid, sid) {
  const e = [...(d.log || [])].reverse().find(x => sid ? x.sid === sid : x.tid === tid && !x.sid);
  return e ? `${e.by} · ${L.timeSince(e.at, now())}` : '';
}
const subPct = t => { const n = (t.subtasks || []).length; return n ? Math.round(t.subtasks.filter(s => s.completed).length / n * 100) : (t.completed ? 100 : 0); };

function taskCard(d, t, ti, locked) {
  const tg = tgAttrs(t, ti), key = `${t.id}`, done = L.isTaskDone(t), subs = t.subtasks || [];
  const lockedSelect = t.isDropdown && (t.selectedOption === null || t.selectedOption === undefined || t.selectedOption === '');
  const open = S.boxes['col:' + key] === undefined ? subs.length > 0 : !S.boxes['col:' + key];
  const tags = [
    t.isCustom ? '<span class="chip tag person">Custom Task</span>' : '',
    t.isSOW ? '<span class="chip tag upload">CSV Upload SOW</span>' : '',
    t.isDropdown && !lockedSelect ? `<span class="chip tag deploy">${icon('branch', 12)}Path Chosen</span>` : '',
    dueTag(t, done, tg),
    featureButtons(t, key, tg, locked),
    t.isDropdown && !lockedSelect ? `<button type="button" class="mini labelled" data-act="editPath" ${tg} ${locked ? 'disabled' : ''}>${icon('pen', 14)}Edit Path</button>` : ''
  ].join('');
  const pct = subPct(t), meta = lastChange(d, t.id);
  const path = lockedSelect ? `<div class="path-pick"><span>${icon('branch', 13)} Select Path For This Step</span><button type="button" class="pick" data-act="menu" data-menu="path" ${tg} ${locked ? 'disabled' : ''}><span>-- Make A Selection --</span>${icon('down', 14, 2.5)}</button></div>` : '';
  const addSub = S.boxes['add:' + key] ? `<div class="inline-box" data-key="add"><textarea class="input" id="newsub_${key}" placeholder="Describe subtask..." style="min-height:52px"></textarea>
      <div class="row"><span class="row"><label class="check-row"><input type="checkbox" id="newsubLink_${key}">Add Link</label><label class="check-row"><input type="checkbox" id="newsubDraft_${key}">Add Draft</label></span>
      <span class="row"><button type="button" class="btn sm ghost" data-act="box" data-box="add:${key}">Cancel</button><button type="button" class="btn sm secondary" data-act="addSubtask" ${tg}>Save</button></span></div></div>`
    : `<button type="button" class="add-sub-btn" data-act="box" data-box="add:${key}" ${locked ? 'disabled' : ''}>${icon('plus', 15, 2.5)}Add Subtask</button>`;
  const expand = `<button type="button" class="mini xp ${open ? 'on' : ''}" data-act="expand" data-k="${esc(key)}" title="${open ? 'Hide' : 'Show'} subtasks" aria-expanded="${open}">${icon('down', 20, 2)}</button>`;
  const boxes = featureBoxes(t, key, tg, locked);
  return `<article class="task ${done ? 'done' : ''}" id="task_${esc(t.id)}" data-key="t-${esc(t.id)}-${ti}">
    <div class="tcard">
      <button type="button" class="check tk-check ${t.completed ? 'on' : ''}" data-act="toggleTask" ${tg} aria-pressed="${!!t.completed}" ${locked || lockedSelect ? 'disabled' : ''} title="${lockedSelect ? 'Select an option first' : 'Mark task done'}">${t.completed ? icon('check', 16, 3) : ''}</button>
      <span class="tk-ring">${ring(pct)}</span>
      <div class="tk-body"><div class="task-title">${esc(t.title)}</div>${meta ? `<div class="tk-meta">${esc(meta)}</div>` : ''}</div>
      <span class="tk-xm">${expand}</span>
      <div class="tk-prog"><span class="tk-ring-m">${ring(pct, true)}</span>${subs.length ? bar(subs.filter(s => s.completed).length, subs.length, 'Subtasks') : ''}${tags}</div>
      <div class="tk-side">
        <button type="button" class="owner glass" data-act="menu" data-menu="owner" ${tg} ${locked ? 'disabled' : ''} title="Owner">${face(t.assignee)}<span class="nm">${esc(label(t.assignee))}</span>${icon('down', 14, 2.5)}</button>
        <span class="weight ${t.completed ? 'done' : ''}" title="Weight of this task in the deal's progress">+${esc(t.weight)}%</span>
        <span class="grow ph-only"></span>
        ${detailsBtn(t, tg, done, false)}
        <span class="tk-xd">${expand}</span>
        ${t.isCustom ? `<button type="button" class="mini" data-act="openDeleteCustom" ${tg} ${locked ? 'disabled' : ''} title="Delete Custom Task">${icon('trash', 16)}</button>` : ''}
      </div>
    </div>
    ${path || boxes ? `<div class="task-extra">${path}${boxes}</div>` : ''}
    ${open ? `<div class="subs">${subs.map((s, si) => subRow(d, t, ti, s, si, locked)).join('')}${locked ? '' : addSub}</div>` : ''}</article>`;
}

const STAT_LABEL = { todo: 'Not Started', progress: 'In Progress', done: 'Done' };
function subRow(d, t, ti, s, si, locked) {
  const tg = tgAttrs(t, ti, s, si), key = `${t.id}_${s.id}`, st = L.subStatus(s);
  const isDefault = s.isDefault || (t.id === 'p3_6' && s.title.includes('Boost the Post'));
  const sow = t.isSOW ? `<span class="chip">+${(t.weight / t.subtasks.length).toFixed(1).replace(/\.0$/, '')}%</span>` : '';
  const meta = lastChange(d, t.id, s.id);
  const editing = S.boxes['edit:' + key];
  const editBox = editing ? `<div class="inline-box"><textarea class="input" id="subedit_${key}" style="min-height:52px">${esc(s.title)}</textarea>
      <div class="row"><span class="row"><label class="check-row"><input type="checkbox" id="subeditLink_${key}" ${s.requiresLink || s.hyperlink ? 'checked' : ''}>Require Link</label><label class="check-row"><input type="checkbox" id="subeditDraft_${key}" ${s.requiresDraft || s.templateText ? 'checked' : ''}>Require Draft</label></span>
      <span class="row"><button type="button" class="btn sm ghost" data-act="box" data-box="edit:${key}">Cancel</button><button type="button" class="btn sm secondary" data-act="saveSubtask" ${tg}>Save</button></span></div></div>` : '';
  const boxes = featureBoxes(s, key, tg, locked);
  return `<div class="sub ${s.completed ? 'done' : ''}" data-key="s-${esc(s.id)}-${si}">
    <div class="sub-row">
      <button type="button" class="check ${s.completed ? 'on' : ''}" data-act="subStatus" data-v="${s.completed ? 'todo' : 'done'}" ${tg} aria-pressed="${!!s.completed}" ${locked ? 'disabled' : ''} title="Mark subtask done">${s.completed ? icon('check', 13, 3.5) : ''}</button>
      <div class="sub-body"><span class="sub-title">${esc(s.title)}</span><span class="sub-meta">${meta ? esc(meta) : ''}${dueTag(s, s.completed, tg)}${featureButtons(s, key, tg, locked)}${sow}</span></div>
      <div class="sub-tools">
        <span class="owner static glass sm" title="Subtasks belong to their task's owner">${face(t.assignee)}<span class="nm">${esc(label(t.assignee))}</span></span>
        <button type="button" class="status-pill s-${st}" data-act="menu" data-menu="subStatus" ${tg} ${locked ? 'disabled' : ''} title="Subtask status">${STAT_LABEL[st]}${icon('down', 13, 2.5)}</button>
        ${detailsBtn(s, tg, s.completed, true)}
        <button type="button" class="mini" data-act="box" data-box="edit:${key}" ${locked ? 'disabled' : ''} title="Edit Item">${icon('pen', 14)}</button>
        ${isDefault ? '' : `<button type="button" class="mini" data-act="openRemoveSub" ${tg} ${locked ? 'disabled' : ''} title="Remove subtask">${icon('trash', 15)}</button>`}
      </div>
    </div>
    ${editBox || boxes ? `<div class="sub-extra stack">${editBox}${boxes}</div>` : ''}</div>`;
}

export { isOverdue, noteCount, fileCount, LOGO, pageTitle };
