// The screens, as markup built from the state. Buttons carry data-act (what to do) and the ids of what they act on;
// app.js handles them. Everything shown from the database goes through esc().
import { icon } from './icons.js';
import { esc, attr, safeUrl, dpHtml } from './ui.js';
import { S, deal, allDeals, label, face, ownerGroups, myName, isManager, canEditSop, sop, strategies, strategyClass, people, managers, personOf } from './state.js';
import * as L from './logic.js';
import { now } from './store.js';

const LOGO = `<img class="logo-light" src="assets/logo-full.png" alt="Total Cash Home Buyers"><img class="logo-dark" src="assets/logo-full-white.png" alt="Total Cash Home Buyers">`;
const tgAttrs = (t, ti, s, si) => attr({ 'data-tid': t.id, 'data-ti': ti, 'data-sid': s ? s.id : undefined, 'data-si': s ? si : undefined });
const isOverdue = due => due && due < now();
const dueChip = (due, act, extra = '') => due
  ? `<button type="button" class="chip ${isOverdue(due) ? 'red' : ''}" data-act="${act}" ${extra} title="Due ${esc(L.when(due))}">${icon('cal', 13)}${esc(L.dueShort(due))}</button>` : '';
const romanOf = phase => { const m = /Phase\s+([IVXL]+)\b/.exec(phase || ''); return m ? m[1] : '-'; };
const noteCount = it => (it.notes || []).length + (it.templateText ? 1 : 0);
const fileCount = it => (it.files || []).length + (it.hyperlink ? 1 : 0);
export const pctClass = p => p === 100 ? 'done' : '';

// ---------------------------------------------------------------- header, hero
export function header() {
  const unread = S.notifs.filter(n => !n.read).length, u = S.user, name = myName(), photo = u && personOf(L.storedNameFor(u.email));
  const tab = (k, txt, ic) => `<button type="button" data-act="tab" data-tab="${k}" aria-pressed="${S.tab === k}">${icon(ic, 16)}${txt}</button>`;
  const dark = document.documentElement.dataset.theme === 'dark';
  return `<div class="header-row">
    <button type="button" class="brand" data-act="tab" data-tab="dashboard" aria-label="Master Dashboard">${LOGO}<span class="app">DISPO <span>OPS</span></span></button>
    <div class="head-tools">
      <div class="seg glass theme" role="group" aria-label="Theme"><button type="button" data-act="theme" data-v="light" aria-pressed="${!dark}" title="Light theme">${icon('sun', 16)}<span class="lbl">Light</span></button><button type="button" data-act="theme" data-v="dark" aria-pressed="${dark}" title="Dark theme">${icon('moon', 16)}<span class="lbl">Dark</span></button></div>
      ${u ? `<button type="button" class="active-pill glass" data-act="menu" data-menu="active" title="Who's online now"><span class="dot"></span><span class="lbl">Active</span><b>${S.online.length || 1}</b></button>
      <nav class="seg tabs caps" aria-label="Screens">${tab('dashboard', 'Master Dashboard', 'layers')}${tab('tracker', 'Active Deal Tracker', 'list')}${tab('sop', 'SOP Reference', 'book')}</nav>
      <button type="button" class="icon-btn glass" data-act="menu" data-menu="notifs" title="Notifications" aria-label="Notifications, ${unread} unread">${icon('bell', 19)}${unread ? `<span class="badge">${unread > 99 ? '99+' : unread}</span>` : ''}</button>
      <button type="button" class="avatar" data-act="menu" data-menu="user" title="${esc(name)}" aria-label="Account">${esc(L.initials(name))}${photo && photo.photo ? `<img src="${esc(photo.photo)}" alt="">` : ''}</button>` : ''}
    </div></div>`;
}

export function syncBadge(st) {
  const lbl = { ready: 'Live', saving: 'Saving…', unsaved: 'Not Saved', offline: 'Offline' }[st.state];
  const tip = { ready: 'Every change is saved for the whole team', saving: 'Saving your changes for the whole team…', unsaved: (st.error || 'Could not save') + ' Click to try again.', offline: 'No connection: changes will not save until you are back online.' }[st.state];
  return `<button type="button" class="sync ${st.state}" ${st.state === 'unsaved' ? 'data-act="retrySave"' : 'tabindex="-1"'} title="${esc(tip)}"><i></i>${lbl}${st.state === 'unsaved' ? ' · Retry' : ''}</button>`;
}
const eyebrow = () => `<div class="eyebrow-row"><span class="eyebrow">Total Cash Home Buyers</span><span id="syncSlot"></span><span class="clock" title="Eastern time, from the server clock" aria-label="Clock, Eastern time"><b id="clockA"></b><span id="clockB"></span></span></div>`;

// ---------------------------------------------------------------- Master Dashboard
export function dashboard() {
  const deals = allDeals(), counts = { open: 0, closed: 0, cancelled: 0 };
  deals.forEach(d => counts[L.statusOf(d)]++);
  const list = L.viewDeals(deals, S.view), open = deals.filter(d => L.statusOf(d) === 'open');
  const overdue = open.reduce((n, d) => n + L.openDues(d).filter(x => isOverdue(x.due)).length + (isOverdue(d.due) ? 1 : 0), 0);
  const sorts = { edited_desc: 'Recently Edited', edited_asc: 'Oldest Edited', started_desc: 'Newest Added', started_asc: 'Oldest Added', due_asc: 'Due Soonest' };
  const views = ['open', 'closed', 'cancelled'].map(k => `<button type="button" data-act="view" data-v="${k}" aria-pressed="${S.view.status === k}">${L.STATUS[k]} <span class="n">${counts[k]}</span></button>`).join('');
  const rows = list.map(d => dealRow(d)).join(''), cards = list.map(d => dealCard(d)).join('');
  return `<section class="hero" data-key="hero"><div class="hero-text">${eyebrow()}<h1 class="title">Live <span class="accent">Pipeline</span></h1><p class="lede">Every Deal In The Dispositions Pipeline, Live For The Whole Team.</p></div>
      <div class="stats"><div class="stat"><b>${counts.open}</b><span>Open Deals</span></div><div class="stat"><b style="${overdue ? 'color:var(--tchb-red-500)' : ''}">${overdue}</b><span>Overdue Items</span></div></div></section>
    <section class="toolbar" data-key="tools-${S.view.status}-${S.view.strategy}-${S.view.sort}-${counts.open}-${counts.closed}-${counts.cancelled}">
      <div class="seg" role="group" aria-label="Deal status">${views}</div>
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
    <td><div class="pct-cell"><span class="pct ${pctClass(st.percent)}">${st.percent}%</span><div class="progress ${st.percent === 100 ? 'done' : ''}"><i style="width:${st.percent}%"></i></div></div></td></tr>`;
}
function dealCard(d) {
  const st = L.getPropStats(d), strategy = d.exitStrategy || 'Wholesale';
  return `<article class="card deal-card" data-key="${esc(d.id)}" data-act="openDeal" data-id="${esc(d.id)}">
    <div class="row"><span class="addr-cell">${esc(d.address)}</span><span class="pct ${pctClass(st.percent)}">${st.percent}%</span></div>
    <div class="progress ${st.percent === 100 ? 'done' : ''}"><i style="width:${st.percent}%"></i></div>
    <div class="row" style="justify-content:flex-start;flex-wrap:wrap"><span class="chip caps ${strategyClass(strategy)}">${esc(strategy)}</span>${agentCell(st)}${d.due ? `<span class="chip ${isOverdue(d.due) ? 'red' : ''}">${icon('flag', 13)}${esc(L.dueShort(d.due))}</span>` : ''}</div>
    ${nextStepCell(d, st)}<small class="muted">Edited ${esc(L.timeSince(d.dateLastEdited, now()))} · Started ${esc(L.whenShort(d.dateStarted))}</small></article>`;
}

// ---------------------------------------------------------------- Active Deal Tracker
export function trackerList() { return L.viewDeals(allDeals(), S.view); }
export function tracker() {
  const d = S.activeId && deal(S.activeId);
  const list = trackerList(), idx = d ? list.findIndex(x => x.id === d.id) : -1;
  const nav = `<section class="nav-row" data-key="nav-${S.activeId}-${idx}-${list.length}">
    <button type="button" class="btn outline" data-act="tab" data-tab="dashboard">${icon('back', 18, 2.5)}Back<span class="long">&nbsp;To Master Dashboard</span></button>
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
    <div class="top" data-key="top"><div class="hero-text" style="flex:1 1 420px">${eyebrow()}
      <div class="tagrow" style="margin:0"><span class="chip caps ${strategyClass(strategy)}">${esc(strategy)}</span>${status !== 'open' ? `<span class="chip caps ${status === 'closed' ? 'green' : 'red'}">${L.STATUS[status]}</span>` : '<span class="chip caps gray">Open</span>'}</div>
      <h1 class="title addr" id="tracker-address">${esc(d.address)}</h1>
      <div class="meta"><span>Created <b>${esc(L.when(d.dateStarted))}</b></span><span>Updated <b>${esc(L.when(d.dateLastEdited))}</b>${d.lastEditedByName ? ` by <b>${esc(label(d.lastEditedByName))}</b>` : ''}</span></div></div>
      <div class="deal-progress"><div class="row"><span>Total Progress</span><b class="pct ${pctClass(st.percent)}">${st.percent}%</b></div><div class="progress ${st.percent === 100 ? 'done' : ''}"><i style="width:${st.percent}%"></i></div>
        <small class="muted">${st.nextTaskId ? `Next: <b>${esc(st.nextTaskDetail)}</b> · ${esc(label(st.nextAgent))}` : 'All workflow tasks finished'}</small></div></div>
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
const iconRow = (it, tg, locked, kind) => `
  <button type="button" class="mini ${noteCount(it) ? 'has' : ''}" data-act="pop" data-pop="notes" ${tg} title="Notes">${icon('note')}${noteCount(it) ? `<span>${noteCount(it)}</span>` : ''}</button>
  <button type="button" class="mini ${fileCount(it) ? 'has' : ''}" data-act="pop" data-pop="files" ${tg} title="Files & Links">${icon('clip')}${fileCount(it) ? `<span>${fileCount(it)}</span>` : ''}</button>
  <button type="button" class="mini ${it.due ? 'has' : ''} ${isOverdue(it.due) ? 'red' : ''}" data-act="pop" data-pop="due" ${tg} ${locked ? 'disabled' : ''} title="${it.due ? 'Due ' + esc(L.when(it.due)) : 'Set a due date'}">${icon('cal')}</button>
  <button type="button" class="mini" data-act="pop" data-pop="activity" ${tg} title="Activity: every change on this ${kind}">${icon('activity')}</button>`;

function taskCard(d, t, ti, locked) {
  const tg = tgAttrs(t, ti), key = `${t.id}`, done = L.isTaskDone(t);
  const lockedSelect = t.isDropdown && (t.selectedOption === null || t.selectedOption === undefined || t.selectedOption === '');
  const tags = [
    t.isCustom ? '<span class="chip tag person">Custom Task</span>' : '',
    t.isSOW ? '<span class="chip tag upload">CSV Upload SOW</span>' : '',
    t.isDropdown && !lockedSelect ? `<span class="chip tag deploy">${icon('branch', 12)}Path Chosen</span>` : '',
    dueChip(t.due, 'pop', `data-pop="due" ${tg}`)
  ].join('');
  const path = lockedSelect ? `<div class="path-pick"><span>${icon('branch', 13)} Select Path For This Step</span><button type="button" class="pick" data-act="menu" data-menu="path" ${tg} ${locked ? 'disabled' : ''}><span>-- Make A Selection --</span>${icon('down', 14, 2.5)}</button></div>` : '';
  const subs = (t.subtasks || []).map((s, si) => subRow(d, t, ti, s, si, locked)).join('');
  const addSub = S.boxes['add:' + key] ? `<div class="inline-box" data-key="add"><textarea class="input" id="newsub_${key}" placeholder="Describe subtask..." style="min-height:52px"></textarea>
      <div class="row"><span class="row"><label class="check-row"><input type="checkbox" id="newsubLink_${key}">Add Link</label><label class="check-row"><input type="checkbox" id="newsubDraft_${key}">Add Draft</label></span>
      <span class="row"><button type="button" class="btn sm ghost" data-act="box" data-box="add:${key}">Cancel</button><button type="button" class="btn sm secondary" data-act="addSubtask" ${tg}>Save</button></span></div></div>` : '';
  return `<article class="task ${done ? 'done' : ''}" id="task_${esc(t.id)}" data-key="t-${esc(t.id)}-${ti}">
    <div class="task-main">
      <button type="button" class="check ${t.completed ? 'on' : ''}" data-act="toggleTask" ${tg} aria-pressed="${!!t.completed}" ${locked || lockedSelect ? 'disabled' : ''} title="${lockedSelect ? 'Select an option first' : 'Mark task done'}">${t.completed ? icon('check', 16, 3) : ''}</button>
      <div class="grow"><div class="task-title">${esc(t.title)}</div>${tags.trim() ? `<div class="tagrow">${tags}</div>` : ''}</div>
      <div class="task-side"><button type="button" class="owner glass" data-act="menu" data-menu="owner" ${tg} ${locked ? 'disabled' : ''} title="Owner">${face(t.assignee)}<span class="nm">${esc(label(t.assignee))}</span>${icon('down', 14, 2.5)}</button>
        <span class="weight ${t.completed ? 'done' : ''}" title="Weight of this task in the deal's progress">+${esc(t.weight)}%</span>
        ${t.isCustom ? `<button type="button" class="mini" data-act="openDeleteCustom" ${tg} ${locked ? 'disabled' : ''} title="Delete Custom Task">${icon('trash', 16)}</button>` : ''}</div>
      ${path ? `<div class="task-extra">${path}</div>` : ''}
      <div class="task-actions">${iconRow(t, tg, locked, 'task')}
        <button type="button" class="mini labelled" data-act="box" data-box="add:${key}" ${locked ? 'disabled' : ''}>${icon('plus', 16, 2.5)}Add Subtask</button>
        ${featureButtons(t, key, tg, locked)}
        ${t.isDropdown && !lockedSelect ? `<button type="button" class="mini labelled" data-act="editPath" ${tg} ${locked ? 'disabled' : ''}>${icon('pen', 14)}Edit Path</button>` : ''}</div>
      ${featureBoxes(t, key, tg, locked) || addSub ? `<div class="task-extra">${featureBoxes(t, key, tg, locked)}${addSub}</div>` : ''}
    </div>
    ${subs ? `<div class="subs">${subs}</div>` : ''}</article>`;
}

function subRow(d, t, ti, s, si, locked) {
  const tg = tgAttrs(t, ti, s, si), key = `${t.id}_${s.id}`, st = L.subStatus(s);
  const isDefault = s.isDefault || (t.id === 'p3_6' && s.title.includes('Boost the Post'));
  const sow = t.isSOW ? `<span class="chip">+${(t.weight / t.subtasks.length).toFixed(1).replace(/\.0$/, '')}%</span>` : '';
  const pick = ['todo', 'progress', 'done'].map(k => `<button type="button" class="st-${k}" data-act="subStatus" data-v="${k}" ${tg} aria-pressed="${st === k}" ${locked ? 'disabled' : ''}>${{ todo: 'Not Started', progress: 'In Progress', done: 'Done' }[k]}</button>`).join('');
  const editing = S.boxes['edit:' + key];
  const editBox = editing ? `<div class="inline-box"><textarea class="input" id="subedit_${key}" style="min-height:52px">${esc(s.title)}</textarea>
      <div class="row"><span class="row"><label class="check-row"><input type="checkbox" id="subeditLink_${key}" ${s.requiresLink || s.hyperlink ? 'checked' : ''}>Require Link</label><label class="check-row"><input type="checkbox" id="subeditDraft_${key}" ${s.requiresDraft || s.templateText ? 'checked' : ''}>Require Draft</label></span>
      <span class="row">${isDefault ? '' : `<button type="button" class="btn sm danger" data-act="openRemoveSub" ${tg}>${icon('trash', 14)}Remove</button>`}<button type="button" class="btn sm ghost" data-act="box" data-box="edit:${key}">Cancel</button><button type="button" class="btn sm secondary" data-act="saveSubtask" ${tg}>Save</button></span></div></div>` : '';
  return `<div class="sub ${s.completed ? 'done' : ''}" data-key="s-${esc(s.id)}-${si}">
    <div class="sub-row"><button type="button" class="check ${s.completed ? 'on' : ''}" data-act="subStatus" data-v="${s.completed ? 'todo' : 'done'}" ${tg} aria-pressed="${!!s.completed}" ${locked ? 'disabled' : ''} title="Mark subtask done">${s.completed ? icon('check', 13, 3.5) : ''}</button>
      <span class="sub-title">${esc(s.title)}</span>${sow}<span class="stat-pick" role="group" aria-label="Subtask status" ${locked ? 'aria-disabled="true"' : ''}>${pick}</span>
      <button type="button" class="mini" data-act="box" data-box="edit:${key}" ${locked ? 'disabled' : ''} title="Edit Item">${icon('pen', 14)}</button></div>
    <div class="sub-tools">${iconRow(s, tg, locked, 'subtask')}${dueChip(s.due, 'pop', `data-pop="due" ${tg}`)}${featureButtons(s, key, tg, locked)}</div>
    ${editBox || featureBoxes(s, key, tg, locked) ? `<div style="padding-left:26px" class="stack">${editBox}${featureBoxes(s, key, tg, locked)}</div>` : ''}</div>`;
}

export { isOverdue, noteCount, fileCount, LOGO, eyebrow };
