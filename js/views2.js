// Menus, popovers (notes, files & links, due date, activity), chat, notifications and dialogs.
import { icon } from './icons.js';
import { esc, attr, safeUrl, dpHtml } from './ui.js';
import { S, deal, allDeals, label, face, myName, isManager, people, managers, sop, strategies } from './state.js';
import * as L from './logic.js';
import { now, myPrefix, MAX_FILE } from './store.js';
import { noteCount, fileCount, syncPanel, wantsDraft, draftLabel } from './views.js';

const tgAttrs = tg => tg ? attr({ 'data-tid': tg.tid, 'data-ti': tg.ti, 'data-sid': tg.sid, 'data-si': tg.si }) : '';
const itemAt = (d, tg) => { try { return !tg ? d : tg.sid ? L.findSub(d, tg).s : L.findTask(d, tg); } catch (e) { return null; } };
const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

// ---------------------------------------------------------------- the floating layer
export function menuHtml() {
  const m = S.menu; if (!m) return '';
  if (m.kind === 'choose') return `<div class="menu" data-key="menu" role="menu">${m.options.map(o => o.header ? `<div class="label">${esc(o.header)}</div>`
    : o.hr ? '<hr>' : `<button type="button" class="mi" role="menuitem" data-act="choose" data-i="${o.i}" aria-selected="${!!o.selected}">${o.face || ''}<span class="grow">${esc(o.label)}</span>${o.hint ? `<small class="muted">${esc(o.hint)}</small>` : ''}${o.selected ? '<span class="tick"></span>' : ''}</button>`).join('')}</div>`;
  if (m.kind === 'user') {
    // The photo menu (header standard, section 4): you, then My Settings, Team Members (managers), SOP Reference, Help & Guides, Sign Out.
    // On phones Active and light/dark live here too: a Light / Dark switch at the top and Who's Online.
    const u = S.user, dark = document.documentElement.dataset.theme === 'dark', me = L.storedNameFor(u.email);
    const ps = people(), rec = ps[u.email.toLowerCase()] || {}, mgr = isManager();
    const role = mgr ? 'Manager' : rec.role === 'lead' ? 'Team Leader' + (rec.dept ? ' · ' + rec.dept : '') : rec.dept ? 'Member · ' + rec.dept : 'Member';
    const phone = window.innerWidth < 640;
    return `<div class="menu acct" data-key="menu" role="menu">
      ${phone ? `<div class="seg theme-words" role="group" aria-label="Theme"><button type="button" data-act="theme" data-v="light" aria-pressed="${!dark}">${icon('sun', 15)}Light</button><button type="button" data-act="theme" data-v="dark" aria-pressed="${dark}">${icon('moon', 15)}Dark</button></div>` : ''}
      <div class="acct-me">${face(me, 'xl')}<div class="grow"><b>${esc(myName())}</b><small>${esc(u.email)}</small><span class="role">${esc(role)}</span></div></div><hr>
      ${phone ? `<button type="button" class="mi" data-act="menu" data-menu="active">${icon('users', 16)}<span class="grow">Who's Online</span><small class="muted">${S.online.length || 1}</small></button>` : ''}
      <button type="button" class="mi" data-act="openPrefs">${icon('gear', 16)}My Settings</button>
      ${mgr ? `<button type="button" class="mi" data-act="openTeam">${icon('users', 16)}Team Members</button>` : ''}
      <button type="button" class="mi" data-act="tab" data-tab="sop">${icon('book', 16)}SOP Reference</button>
      <button type="button" class="mi" data-act="tab" data-tab="help">${icon('help', 16)}Help & Guides</button>
      <button type="button" class="mi" data-act="askSignOut">${icon('out', 16)}Sign Out</button></div>`;
  }
  if (m.kind === 'sync') return syncPanel(S.syncSt || { state: 'ready' }, S.lastSaved);
  if (m.kind === 'active') {
    const list = S.online.length ? S.online : [{ email: S.user.email, sessions: { x: { lastActive: Date.now(), type: 'Desktop' } } }];
    return `<div class="menu" data-key="menu" role="menu"><div class="label">Personnel Online · ${list.length}</div>${list.map(u => {
      const t = Date.now(), ss = Object.values(u.sessions || {}).filter(s => t - s.lastActive < 300000);
      const mob = ss.some(s => s.type === 'Mobile'), desk = ss.some(s => s.type !== 'Mobile'), stored = L.storedNameFor(u.email);
      return `<div class="mi" style="cursor:default">${face(stored)}<span class="grow">${esc(label(stored) === stored ? u.email.split('@')[0] : label(stored))}</span><span title="Phone" style="opacity:${mob ? 1 : 0.25}">${icon('phone', 15)}</span><span title="Desktop" style="opacity:${desk ? 1 : 0.25}">${icon('desktop', 15)}</span></div>`;
    }).join('')}</div>`;
  }
  if (m.kind === 'notifs') return notifsHtml();
  if (m.kind === 'pop') {
    const html = popHtml(m); if (!html || !m.details) return html;
    // Details: one panel with Due · Notes · Activity · Files at the top (subtasks: Due · Notes · Files)
    const d = deal(m.dealId), it = itemAt(d, m.tg); if (!it) return html;
    const parts = m.tg.sid ? ['due', 'notes', 'files'] : ['due', 'notes', 'activity', 'files'];
    const n = { due: it.due ? 1 : 0, notes: noteCount(it), files: fileCount(it), activity: (d.log || []).filter(e => m.tg.sid ? e.sid === m.tg.sid : e.tid === m.tg.tid).length };
    const seg = `<div class="seg small det-parts" data-key="parts" role="group" aria-label="Details">${parts.map(p => `<button type="button" data-act="detailsPart" data-v="${p}" aria-pressed="${m.pop === p}">${{ due: 'Due', notes: 'Notes', activity: 'Activity', files: 'Files' }[p]}${n[p] && p !== 'due' ? ` <span class="n">${n[p]}</span>` : ''}</button>`).join('')}</div>`;
    const i = html.indexOf('>') + 1;
    return html.slice(0, i).replace('class="menu', 'class="menu det') + seg + html.slice(i);
  }
  return '';
}

function notifsHtml() {
  const list = S.notifs, sel = S.selectedNotifs, n = sel.size;
  const head = n ? `<div class="pop-head"><input type="checkbox" data-change="notifAll" ${n === list.length ? 'checked' : ''} aria-label="Select all"><b>${n} Selected</b><button type="button" class="mini" data-act="notifRead" title="Mark Read">${icon('check', 17)}</button><button type="button" class="mini" data-act="notifDelete" title="Delete">${icon('trash', 17)}</button></div>`
    : `<div class="pop-head">${list.length ? '<input type="checkbox" data-change="notifAll" aria-label="Select all">' : ''}<b>Notifications</b>${list.some(x => !x.read) ? `<button type="button" class="mini labelled" data-act="notifAllRead" title="Mark All Read">${icon('check', 16)}All Read</button>` : ''}<button type="button" class="mini" data-act="openPrefs" title="Notification Settings">${icon('gear', 17)}</button></div>`;
  const items = list.length ? list.map(x => `<div class="notif ${x.read ? '' : 'unread'}"><input type="checkbox" data-change="notifPick" data-id="${esc(x.id)}" ${sel.has(x.id) ? 'checked' : ''} aria-label="Select">
      <div class="body" data-act="notifOpen" data-id="${esc(x.id)}"><b>${esc(x.title)}</b><p>${esc(x.body)}</p><small>${esc(L.timeSince(x.createdAt, now()))} · ${esc(L.whenShort(x.createdAt))}</small></div>
      <button type="button" class="mini" data-act="notifDelete" data-id="${esc(x.id)}" title="Delete">${icon('trash', 15)}</button></div>`).join('')
    : `<div class="pop-empty">You're all caught up!</div>`;
  return `<div class="menu pop" data-key="menu" role="dialog" aria-label="Notifications" style="width:420px">${head}<div class="pop-list" style="gap:2px">${items}</div></div>`;
}

// ---------------------------------------------------------------- popovers
function popHtml(m) {
  const d = deal(m.dealId); if (!d) return '';
  const it = itemAt(d, m.tg); if (!it) return '';
  const locked = L.isLocked(d), title = m.tg ? it.title : d.address;
  const head = (name, extra = '') => `<div class="pop-head" data-key="head"><b>${name}<small>${esc(title)}</small></b>${extra}<button type="button" class="mini" data-act="closeMenu" aria-label="Close">${icon('x', 18)}</button></div>`;
  if (m.pop === 'due') return `<div class="menu dp-menu" data-key="menu" role="dialog" aria-label="Due date">${dpHtml(m.dp, { label: 'Due Date', title, hasValue: !!it.due, nowMs: now() })}</div>`;
  if (m.pop === 'activity') {
    const logs = (d.log || []).filter(e => !m.tg ? true : m.tg.sid ? e.sid === m.tg.sid : e.tid === m.tg.tid).slice().reverse();
    const line = e => {
      const what = e.ev === 'owner' ? `changed the owner of <b>${esc(e.title)}</b> from ${esc(label(e.from))} to ${esc(label(e.to))}`
        : e.ev === 'due date set' ? `set the due date${e.title ? ` of <b>${esc(e.title)}</b>` : ''} to ${esc(L.when(e.due))}`
        : `${esc(e.ev)}${e.title ? ` <b>${esc(e.title)}</b>` : ''}${e.name ? ` (${esc(e.name)})` : ''}`;
      return `<div class="pop-item"><div class="by">${esc(e.by)} · ${esc(L.when(e.at))}</div><div class="txt">${what}</div></div>`;
    };
    return `<div class="menu pop" data-key="menu" data-morph role="dialog" aria-label="Activity">${head('Activity')}<div class="pop-list" data-key="list">${logs.length ? logs.map(line).join('') : '<div class="pop-empty">No changes recorded yet. Changes made from today on are listed here, with who and when.</div>'}</div></div>`;
  }
  // notes and files: on the deal, everything on it; on a task, its own (and its subtasks' with the switch)
  const sources = [];
  const tagOf = (t, s) => s ? `${t.title} › ${s.title}` : t.title;
  if (!m.tg) { sources.push({ it: d, tg: null, tag: 'Deal' }); d.tasks.forEach((t, ti) => { sources.push({ it: t, tg: { tid: t.id, ti }, tag: tagOf(t) }); (t.subtasks || []).forEach((s, si) => sources.push({ it: s, tg: { tid: t.id, ti, sid: s.id, si }, tag: tagOf(t, s) })); }); }
  else if (!m.tg.sid) { const t = it; sources.push({ it: t, tg: m.tg, tag: null }); if (m.withSubs) (t.subtasks || []).forEach((s, si) => sources.push({ it: s, tg: { ...m.tg, sid: s.id, si }, tag: s.title })); }
  else sources.push({ it, tg: m.tg, tag: null });
  if (m.pop === 'notes') {
    const entries = [];
    sources.forEach(src => {
      (src.it.notes || []).forEach(n => entries.push({ kind: 'note', n, src }));
      if (src.it.templateText && !(m.tg && src.tag === null)) entries.push({ kind: 'draft', src });
    });
    entries.sort((a, b) => (a.kind === 'note' ? a.n.at : a.src.it.templateLastEditedAt || 0) - (b.kind === 'note' ? b.n.at : b.src.it.templateLastEditedAt || 0));
    const row = e => e.kind === 'note'
      ? `<div class="pop-item"><div class="by">${esc(e.n.by)} · ${esc(L.when(e.n.at))}${e.src.tag ? ` <span class="chip">${esc(e.src.tag)}</span>` : ''}<span class="grow"></span>${e.n.by === myName() && !locked ? `<button type="button" class="mini" data-act="deleteNote" data-nid="${esc(e.n.id)}" ${tgAttrs(e.src.tg)} title="Delete note">${icon('trash', 14)}</button>` : ''}</div><div class="txt">${esc(e.n.text)}</div></div>`
      : `<div class="pop-item"><div class="by"><span class="chip gold">${String(e.src.it.title || '').toLowerCase().includes('approved') ? 'Template' : 'Draft'}</span>${e.src.it.templateLastEditedBy ? `${esc(label(e.src.it.templateLastEditedBy))} · ${esc(L.when(e.src.it.templateLastEditedAt))}` : ''}${e.src.tag ? ` <span class="chip">${esc(e.src.tag)}</span>` : ''}<span class="grow"></span><button type="button" class="mini" data-act="copy" data-text="${esc(e.src.it.templateText)}" title="Copy">${icon('copy', 14)}</button></div><div class="txt">${esc(e.src.it.templateText)}</div></div>`;
    const sw = m.tg && !m.tg.sid && (it.subtasks || []).length ? `<label class="check-row" data-key="sw" style="font-size:13px"><button type="button" class="switch" role="switch" aria-checked="${!!m.withSubs}" data-act="popSubs"></button>Include Subtask Notes</label>` : '';
    // the task's own draft (it used to open from a Draft button on the card): edit it here, saved on leaving the box
    const own = m.tg && (wantsDraft(it) || it.templateText) ? `<div class="own-box" data-key="own-draft"><div class="by"><span class="chip gold">${draftLabel(it)}</span>${it.templateLastEditedBy ? `${esc(label(it.templateLastEditedBy))} · ${esc(L.when(it.templateLastEditedAt))}` : '<span class="muted">Saves when you click away</span>'}<span class="grow"></span>${it.templateText ? `<button type="button" class="mini" data-act="copy" data-text="${esc(it.templateText)}" title="Copy">${icon('copy', 14)}</button>` : ''}</div>
      <textarea class="input" id="draft_own" data-change="saveTemplate" ${tgAttrs(m.tg)} ${locked ? 'readonly' : ''} placeholder="Paste text here...">${esc(it.templateText || '')}</textarea></div>` : '';
    return `<div class="menu pop" data-key="menu" data-morph role="dialog" aria-label="Notes">${head('Notes')}${own}${sw}<div class="pop-list" data-key="list">${entries.length ? entries.map(row).join('') : '<div class="pop-empty">No notes yet.</div>'}</div>
      ${locked ? '' : `<div class="pop-foot" data-key="foot"><textarea class="input" id="noteText" placeholder="Write a note..." rows="2"></textarea><button type="button" class="btn sm primary" data-act="addNote" ${tgAttrs(m.tg)}>Add</button></div>`}</div>`;
  }
  // files & links
  const entries = [];
  sources.forEach(src => {
    if (src.it.hyperlink && !(m.tg && src.tag === null)) entries.push({ kind: 'field', src, at: 0 });
    (src.it.files || []).forEach(f => entries.push({ kind: 'file', f, src, at: f.at }));
  });
  const row = e => {
    if (e.kind === 'field') { const href = safeUrl(e.src.it.hyperlink);
      return `<div class="pop-item"><div class="by"><span class="chip">${icon('link', 12)}Link</span>${e.src.tag ? ` <span class="chip">${esc(e.src.tag)}</span>` : ''}</div>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(e.src.it.hyperlink)}</a>` : `<span class="txt">${esc(e.src.it.hyperlink)}</span>`}</div>`; }
    const f = e.f, href = safeUrl(f.url);
    return `<div class="pop-item"><div class="by">${icon(f.kind === 'link' ? 'link' : 'file', 14)}${esc(f.by)} · ${esc(L.when(f.at))}${f.size ? ' · ' + kb(f.size) : ''}${e.src.tag ? ` <span class="chip">${esc(e.src.tag)}</span>` : ''}<span class="grow"></span>${locked ? '' : `<button type="button" class="mini" data-act="removeFile" data-fid="${esc(f.id)}" ${tgAttrs(e.src.tg)} title="Remove">${icon('trash', 14)}</button>`}</div>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(f.name)}</a>` : esc(f.name)}</div>`;
  };
  const mode = m.mode || 'file';
  const add = locked ? '' : `<div class="seg small" data-key="mode" role="group"><button type="button" data-act="popMode" data-v="file" aria-pressed="${mode === 'file'}">${icon('upload', 15)}Upload Files</button><button type="button" data-act="popMode" data-v="link" aria-pressed="${mode === 'link'}">${icon('link', 15)}Add Link</button></div>
    ${mode === 'file' ? `<label class="drop" data-key="add-file">${m.uploading ? '<span class="spin"></span><b>Uploading…</b>' : `${icon('upload', 22)}<b>Choose Files</b><small class="muted">Up to ${MAX_FILE / 1048576} MB each</small>`}<input type="file" multiple class="sr" data-change="uploadFiles" ${tgAttrs(m.tg)}></label>`
      : `<div class="stack" data-key="add-link" style="gap:8px"><input class="input" id="linkName" placeholder="Name (optional)"><input class="input" id="linkUrl" placeholder="https://..." data-enter="addLinkFile" ${tgAttrs(m.tg)}><button type="button" class="btn sm primary" data-act="addLinkFile" ${tgAttrs(m.tg)}>Add Link</button></div>`}`;
  // the task's own link (it used to open from a Link button on the card)
  const lk = m.tg ? (m.tg.sid ? `${m.tg.tid}_${m.tg.sid}` : m.tg.tid) : '', ownHref = safeUrl(it.hyperlink);
  const own = m.tg && (it.requiresLink || it.hyperlink) ? `<div class="own-box" data-key="own-link"><div class="by"><span class="chip">${icon('link', 12)}${m.tg.sid ? 'Subtask' : 'Task'} Link</span>${it.requiresLink && !it.hyperlink ? '<span class="muted">This step needs a link</span>' : ''}<span class="grow"></span>${ownHref ? `<a class="mini labelled" href="${esc(ownHref)}" target="_blank" rel="noopener" title="${esc(it.hyperlink)}">${icon('ext', 14)}Open</a>` : ''}</div>
    ${locked ? (it.hyperlink ? `<span class="txt">${esc(it.hyperlink)}</span>` : '') : `<div class="row" style="flex-wrap:nowrap"><input class="input" id="link_${esc(lk)}" value="${esc(it.hyperlink || '')}" placeholder="https://..." data-enter="saveLink" ${tgAttrs(m.tg)}><button type="button" class="btn sm secondary" data-act="saveLink" ${tgAttrs(m.tg)}>Save</button>${it.hyperlink ? `<button type="button" class="mini" data-act="clearLink" ${tgAttrs(m.tg)} title="Remove Link">${icon('trash', 16)}</button>` : ''}</div>`}</div>` : '';
  return `<div class="menu pop" data-key="menu" data-morph role="dialog" aria-label="Files and links">${head('Files & Links')}${own}${add}<div class="pop-list" data-key="list">${entries.length ? entries.map(row).join('') : '<div class="pop-empty">No files or links yet.</div>'}</div></div>`;
}

// ---------------------------------------------------------------- chat (stored as before: comments, readBy, pins)
const authorLabel = a => label(String(a || '').toLowerCase() === 'systems' ? 'Remy' : a);
export function unreadFor(d) {
  const mine = myPrefix().toLowerCase(), lastRead = (d.readBy || {})[mine] || 0;
  return (d.comments || []).filter(c => c.timestamp > lastRead && String(c.author).toLowerCase() !== mine).length;
}
export function chatHtml() {
  const c = S.chat, d = S.activeId && deal(S.activeId);
  const close = `<button type="button" class="mini" data-act="chatClose" aria-label="Close chat">${icon('x', 20)}</button>`;
  if (!d || c.view === 'hub') {
    const items = allDeals().map(p => { const cm = p.comments || [], last = cm[cm.length - 1]; return { p, last, unread: unreadFor(p), at: last ? last.timestamp : p.dateStarted }; }).sort((a, b) => b.at - a.at);
    return `<div class="chat-head" data-key="hub-head"><div class="grow"><b>Active Discussions</b><small>Every deal's chat</small></div>${close}</div>
      <div class="chat-body" data-key="hub-body">${items.length ? items.map(x => `<button type="button" class="hub-item" data-act="chatOpenDeal" data-id="${esc(x.p.id)}"><div class="row"><b>${esc(x.p.address)}</b>${x.unread ? `<span class="chip red">${x.unread} New</span>` : ''}</div>
        <p>${x.last ? `<b style="font-size:13px">${esc(authorLabel(x.last.author))}:</b> ${esc(x.last.text)}` : '<span class="muted">No messages yet</span>'}</p><small>${esc(L.timeSince(x.at, now()))}</small></button>`).join('') : '<div class="pop-empty">No active discussions. Deploy a new asset to begin tracking!</div>'}</div>`;
  }
  const mine = myPrefix().toLowerCase(), term = c.searching ? c.search.toLowerCase() : '';
  const list = (d.comments || []).filter(m => !term || m.text.toLowerCase().includes(term) || String(m.author).toLowerCase().includes(term));
  const msgs = list.length ? list.map(m => {
    const a = String(m.author).toLowerCase(), me = a === mine;
    const readers = Object.entries(d.readBy || {}).filter(([u, t]) => t >= m.timestamp && u !== a).map(([u]) => authorLabel(u));
    return `<div class="msg ${me ? 'me' : ''} ${c.focus === m.id ? 'flash' : ''} ${term ? 'searching' : ''}" id="chat_msg_${esc(m.id)}" ${term ? `data-act="chatJump" data-cid="${esc(m.id)}"` : ''}>
      <div class="who">${face(a === 'systems' ? 'Remy' : m.author)}${esc(authorLabel(m.author))} · ${esc(L.whenShort(m.timestamp))}<button type="button" class="pin ${m.pinned ? 'on' : ''}" data-act="chatPin" data-cid="${esc(m.id)}" title="${m.pinned ? 'Unpin' : 'Pin'} Message">${icon('pin', 13)}</button></div>
      <div class="bubble">${esc(m.text)}</div>${readers.length ? `<div class="read">${icon('check', 11, 3)} Read by: ${esc(readers.join(', '))}</div>` : ''}</div>`;
  }).join('') : `<div class="pop-empty">${term ? 'No matching messages.' : 'No messages yet.'}</div>`;
  let overlay = '';
  if (c.overlay === 'pins') {
    const pins = (d.comments || []).filter(m => m.pinned);
    overlay = `<div class="overlay" data-key="ov-pins"><div class="chat-head"><div class="grow"><b>Pinned Messages</b><small>${esc(d.address)}</small></div><button type="button" class="mini" data-act="chatOverlay" data-v="" aria-label="Close">${icon('x', 20)}</button></div>
      <div class="chat-body">${pins.length ? pins.map(m => `<button type="button" class="hub-item" data-act="chatJump" data-cid="${esc(m.id)}"><div class="row"><b>${esc(authorLabel(m.author))}</b><small>${esc(L.whenShort(m.timestamp))}</small></div><p style="white-space:pre-wrap">${esc(m.text)}</p></button>`).join('') : '<div class="pop-empty">No pinned messages yet.</div>'}</div></div>`;
  } else if (c.overlay === 'links') {
    const items = [];
    d.tasks.forEach(t => {
      if (t.hyperlink || t.templateText) items.push({ phase: t.phase, title: t.title, link: t.hyperlink, template: t.templateText });
      (t.subtasks || []).forEach(s => { if (s.hyperlink || s.templateText) items.push({ phase: t.phase, title: `${t.title} › ${s.title}`, link: s.hyperlink, template: s.templateText }); });
    });
    const body = items.map(x => {
      const href = safeUrl(x.link), urls = x.template ? (x.template.match(/(https?:\/\/[^\s]+)/g) || []) : [];
      return `<div class="pop-item"><div class="by"><span class="chip">${esc(x.phase)}</span></div><b style="font-size:13px">${esc(x.title)}</b>
        ${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${icon('link', 12)} ${esc(x.link)}</a>` : ''}${urls.map(u => `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${icon('ext', 12)} ${esc(u)}</a>`).join('')}
        ${x.template ? `<div class="inline-box"><div class="row"><small><b>Draft Content</b></small><button type="button" class="btn sm ghost" data-act="copy" data-text="${esc(x.template.trim())}">${icon('copy', 14)}Copy</button></div><div class="txt" style="font-size:13px">${esc(x.template.trim())}</div></div>` : ''}</div>`;
    }).join('');
    overlay = `<div class="overlay" data-key="ov-links"><div class="chat-head"><div class="grow"><b>Links & Attachments</b><small>${esc(d.address)}</small></div><button type="button" class="mini" data-act="chatOverlay" data-v="" aria-label="Close">${icon('x', 20)}</button></div><div class="chat-body">${body || '<div class="pop-empty">No links or templates found for this asset.</div>'}</div></div>`;
  }
  return `${overlay}<div class="chat-head" data-key="head-${esc(d.id)}"><button type="button" class="mini" data-act="chatHub" title="Back to all discussions" aria-label="Back to all discussions">${icon('back', 20, 2.5)}</button><div class="grow"><b>Property Discussion</b><small>${esc(d.address)}</small></div>
      <button type="button" class="mini" data-act="chatOverlay" data-v="pins" title="Pinned Messages">${icon('pin', 18)}</button><button type="button" class="mini" data-act="chatSearch" title="Search">${icon('search', 18)}</button><button type="button" class="mini" data-act="chatOverlay" data-v="links" title="View Links & Files">${icon('clip', 18)}</button>${close}</div>
    ${c.searching ? `<div class="chat-search" data-key="search"><input class="input" id="chatSearch" data-input="chatSearch" placeholder="Search discussion..." style="padding:8px 12px"></div>` : ''}
    <div class="chat-body" id="chatMessages" data-key="body-${esc(d.id)}">${msgs}</div>
    <div class="chat-foot" data-key="foot-${esc(d.id)}"><input class="input" id="chatInput" placeholder="Type a message..." data-enter="chatSend" autocomplete="off"><button type="button" class="btn primary" data-act="chatSend" aria-label="Send" style="padding:0 14px">${icon('right', 20, 2.5)}</button></div>`;
}

// ---------------------------------------------------------------- dialogs
export function modalHtml() {
  const m = S.modal; if (!m) return '';
  const wrap = (title, body, actions, wide = false, lede = '') => `<div class="modal-scrim" data-act="modalScrim"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2>${esc(title)}</h2>${lede ? `<p class="lede">${esc(lede)}</p>` : ''}${body}<div class="actions">${actions}</div></div></div>`;
  const cancel = '<button type="button" class="btn ghost" data-act="closeModal">Cancel</button>';
  if (m.kind === 'deploy') {
    const csv = m.strategy === 'Fix & Flip' ? `<label class="drop ${m.csvName ? 'has' : ''}">${icon('upload', 22)}<b>${m.csvName ? esc(m.csvName) + ' loaded' : 'SOW CSV Upload (Optional)'}</b><small class="muted">A CSV file: Task, Cost, Notes</small><input type="file" accept=".csv" class="sr" data-change="deployCsv"></label>` : '';
    return wrap('Deploy Asset Tracker', `<label class="field"><span>Subject Property Address</span><input class="input ${m.bad ? 'bad' : ''}" id="deployAddress" data-input="deployAddress" data-enter="deploy" value="${esc(m.address)}" placeholder="e.g. 123 Example Street" autocomplete="off"></label>
      <div class="field"><span>Exit Strategy Profile</span><button type="button" class="pick" data-act="menu" data-menu="deployStrategy"><span>${esc(m.strategy)}</span>${icon('down', 14, 2.5)}</button></div>${csv}`,
      `${cancel}<button type="button" class="btn primary" data-act="deploy" ${m.busy ? 'disabled' : ''}>${m.busy ? '<span class="spin"></span>Deploying…' : 'Deploy Tracker'}</button>`, false, 'Start a new SOP pipeline for an incoming property.');
  }
  if (m.kind === 'removeDeal') return wrap('Authorization Required', `<label class="field"><span>Deletion Password</span><input class="input ${m.error ? 'bad' : ''}" type="password" id="deletePassword" data-enter="removeDeal" autocomplete="off"></label>${m.error ? '<p class="note red">Invalid Password.</p>' : ''}`,
    `${cancel}<button type="button" class="btn primary" data-act="removeDeal">Confirm Deletion</button>`, false, 'Enter the deletion password to permanently remove this asset.');
  if (m.kind === 'removeSub') return wrap('Confirm Removal', `<label class="field"><span>Type "Confirm" below to verify</span><input class="input" id="confirmWord" data-input="confirmWord" placeholder="Confirm" autocomplete="off"></label>`,
    `${cancel}<button type="button" class="btn primary" data-act="removeSub" ${m.ok ? '' : 'disabled'}>Remove Task</button>`, false, 'This will permanently delete this subtask.');
  if (m.kind === 'confirm') return wrap(m.title, m.body ? `<p style="margin:0">${esc(m.body)}</p>` : '', `${cancel}<button type="button" class="btn ${m.danger ? 'primary' : 'secondary'}" data-act="confirmOk">${esc(m.ok || 'Confirm')}</button>`);
  if (m.kind === 'inject') return injectHtml(m, wrap, cancel);
  if (m.kind === 'prefs') return prefsHtml(m, wrap);
  if (m.kind === 'team') return teamHtml(m, wrap);
  return '';
}

function injectHtml(m, wrap, cancel) {
  const d = deal(S.activeId); if (!d) return '';
  const st = m.state, catsInPhase = st.phase ? [...new Set(d.tasks.filter(t => t.phase === st.phase).map(t => t.mainTask))] : [];
  const pick = (menu, text, extra = '') => `<button type="button" class="pick" data-act="menu" data-menu="${menu}" ${extra}><span>${esc(text)}</span>${icon('down', 14, 2.5)}</button>`;
  const weight = parseFloat(st.weight) || 0, deducted = st.deductions.reduce((s, x) => s + (parseFloat(x.weight) || 0), 0), diff = parseFloat((weight - deducted).toFixed(2));
  const meter = diff === 0 ? `<span class="meter ok">${icon('check', 14, 3)}100% Balanced</span>` : diff > 0 ? `<span class="meter bad">Need ${diff}% more</span>` : `<span class="meter bad">Over by ${Math.abs(diff)}%</span>`;
  const deductions = weight > 0 ? `<div class="stack" style="border-top:1px solid var(--border-default);padding-top:14px"><div class="row" style="justify-content:space-between"><div><b style="font-family:var(--font-display);color:var(--tchb-red-500)">Weight Reallocation Required</b><br><small class="muted">To keep the total at 100%, take weight from existing tasks.</small></div>${meter}</div>
    ${st.deductions.map((x, i) => { const t = d.tasks.find(z => z.id === x.taskId);
      return `<div class="row" style="flex-wrap:nowrap">${pick('deductTask', t ? `[${t.weight}%] ${t.title} (${t.mainTask})` : '-- Select Task To Borrow From --', `data-i="${i}" style="flex:1;min-width:0"`)}<input class="input" type="number" min="0" step="1" style="width:96px" value="${esc(x.weight)}" data-change="deductWeight" data-i="${i}" placeholder="Weight %"><button type="button" class="mini" data-act="deductRemove" data-i="${i}" title="Remove">${icon('trash', 16)}</button></div>`; }).join('')}
    <button type="button" class="btn sm danger" data-act="deductAdd" style="align-self:flex-start">${icon('plus', 14, 2.5)}Add Task To Deduct From</button></div>` : '';
  const group = st.categoryMode === 'existing' ? `<div class="field"><span>Select Group</span>${pick('injCategory', st.category || '-- Select Group --')}</div>`
    : st.categoryMode === 'new' ? `<label class="field"><span>New Group Name</span><input class="input" data-input="inj" data-k="newCategoryName" value="${esc(st.newCategoryName)}" placeholder="e.g. Closing"></label><div class="field"><span>Position (Order)</span>${pick('injPosition', st.insertGroupAfter === 'top' ? 'At The Top (Beginning)' : st.insertGroupAfter ? 'Insert After: ' + st.insertGroupAfter : '-- Select Position --')}</div>` : '';
  return wrap('Inject Custom Task', `<div class="two"><div class="field"><span>Target Phase</span>${pick('injPhase', st.phase || '-- Select Phase --')}</div><div class="field"><span>Group Mode</span>${pick('injMode', { existing: 'Assign To Existing Group', new: 'Create New Group' }[st.categoryMode] || '-- Select Mode --')}</div>${group}</div>
    <label class="field"><span>Task Title</span><input class="input" data-input="inj" data-k="title" value="${esc(st.title)}" placeholder="Enter task description..."></label>
    <div class="two"><div class="field"><span>Assignee</span>${pick('injAssignee', st.assignee ? label(st.assignee) : '-- Select Assignee --')}</div>
      <label class="field"><span>Weight % (Optional)</span><div class="row" style="flex-wrap:nowrap"><button type="button" class="dp-round" data-act="injWeight" data-n="-1" aria-label="Less">${icon('minus', 16, 2.5)}</button><input class="input" type="number" min="0" max="100" step="1" value="${esc(st.weight)}" data-change="injWeightSet" placeholder="0" style="text-align:center"><button type="button" class="dp-round" data-act="injWeight" data-n="1" aria-label="More">${icon('plus', 16, 2.5)}</button></div></label></div>
    <div class="row"><label class="check-row"><input type="checkbox" data-change="injCheck" data-k="requireLink" ${st.requireLink ? 'checked' : ''}>Require Link</label><label class="check-row"><input type="checkbox" data-change="injCheck" data-k="requireDraft" ${st.requireDraft ? 'checked' : ''}>Require Draft</label></div>${deductions}`,
    `${cancel}<button type="button" class="btn outline" data-act="inject" data-another="1" ${m.busy ? 'disabled' : ''}>Save & Add Another</button><button type="button" class="btn primary" data-act="inject" ${m.busy ? 'disabled' : ''}>Save Task</button>`, true, 'Add property-specific tasks, create custom groups, and balance weights.');
}

const PREFS = [['comments', 'Offline Comment Alerts', 'Alerts for new unread property discussions.'], ['new_assets', 'New Asset Deployments', 'When a new property tracker is started.'],
  ['completions_phase', 'Phase & Tracker Completions', 'When a section, a phase or a whole pipeline reaches 100%.'], ['completions_task', 'Task Completions', 'When a main workflow task is checked off.'],
  ['completions_subtask', 'Subtask Completions', 'Every individual subtask checkmark.'], ['drafts_links', 'Drafts & Link Updates', 'When a task link or template draft is saved.'],
  ['task_turns', 'Task Turn Alerts', 'As soon as the next workflow step is yours.'], ['daily_brief', '10 AM Daily Briefing', 'A morning summary of your pending tasks.'],
  ['reminders', 'Overdue Reminders', 'Recurring nudges for tasks waiting on you, and for due dates that have passed.']];
function prefsHtml(m, wrap) {
  if (!m.prefs) return wrap('My Settings', '<div class="row"><span class="spin"></span>Loading…</div>', '<button type="button" class="btn ghost" data-act="closeModal">Close</button>');
  const p = m.prefs, iv = { 2: 'Every 2 Hours', 4: 'Every 4 Hours', 8: 'Every 8 Hours', 24: 'Once A Day (24 Hours)' };
  return wrap('My Settings', `<h3 class="sec-h">Notification Settings</h3>${S.imp ? '<p class="note">Push devices can\'t be changed while you are signed in as someone else.</p>' : ''}<div class="row"><button type="button" class="btn ${m.push === 'ok' ? 'outline' : 'secondary'} grow" data-act="enablePush" ${S.imp ? 'disabled' : ''}>${icon('bell', 16)}${{ ok: 'Device Linked Successfully!', fail: 'Setup Failed', busy: 'Authorizing…', wiped: 'Wiped! Click To Link This Device' }[m.push] || 'Enable Push On This Device'}</button>
      <button type="button" class="btn outline" data-act="resetPrefs" title="Reset Settings To Default">${icon('rotate', 16)}Defaults</button><button type="button" class="btn outline" data-act="wipeDevices" title="Wipe Old Devices" ${S.imp ? 'disabled' : ''}>${icon('phone', 16)}Wipe Devices</button></div>
    <div>${PREFS.map(([k, t, s]) => `<div class="pref"><div class="grow"><b>${t}</b><small>${s}</small></div><button type="button" class="switch" role="switch" aria-checked="${!!p[k]}" data-act="prefToggle" data-k="${k}" aria-label="${t}"></button></div>`).join('')}
      <div class="pref"><div class="grow"><b>Reminder Interval</b><small>How often Overdue Reminders repeat.</small></div><button type="button" class="pick" style="width:auto" data-act="menu" data-menu="interval" ${p.reminders ? '' : 'disabled'}><span>${iv[p.reminder_interval] || iv[4]}</span>${icon('down', 14, 2.5)}</button></div></div>`,
    `<button type="button" class="btn ghost" data-act="closeModal">Close</button><button type="button" class="btn primary" data-act="savePrefs" ${m.busy ? 'disabled' : ''}>${m.saved ? icon('check', 16, 3) + 'Preferences Saved' : 'Save Settings'}</button>`);
}

function teamHtml(m, wrap) {
  const ps = people(), ms = managers(), emails = Object.keys(ps);
  // Sign In As (Remy only, like the hub's Login As User): see and work in DISPO OPS exactly as that person does.
  const canAs = S.user && S.user.email.toLowerCase() === 'systems@totalchb.com' && !S.imp;
  const row = e => `<div class="team-row">${face(L.storedNameFor(e), 'lg')}<div class="grow"><b>${esc(ps[e].name || e)}</b><small>${esc(e)}</small></div><span class="chip">${ms.includes(e) ? 'Manager' : ps[e].role === 'lead' ? 'Team Leader' : 'Member'}</span>${canAs && e !== 'systems@totalchb.com' && /@totalchb\.com$/.test(e) ? `<button type="button" class="btn sm outline" data-act="loginAs" data-email="${esc(e)}" ${m.asBusy ? 'disabled' : ''}>${m.asBusy === e ? '<span class="spin"></span>Signing In…' : 'Sign In As'}</button>` : ''}</div>`;
  const groups = [['Managers', emails.filter(e => ms.includes(e))], ...L.DEPTS.map(dp => [dp, emails.filter(e => !ms.includes(e) && ps[e].dept === dp)]), ['Other', emails.filter(e => !ms.includes(e) && !L.DEPTS.includes(ps[e].dept))]].filter(g => g[1].length);
  const when = S.directory && S.directory.copiedAt ? `Copied from the Universal Team Hub ${L.when(S.directory.copiedAt)}${S.directory.copiedBy ? ' by ' + S.directory.copiedBy : ''}.` : 'Not copied from the Universal Team Hub yet. Until then, owners are today\'s nine names.';
  return wrap('Team Members', `<p class="note">${esc(when)} Names, photos, roles and departments come from the hub; manage people there.</p>
    ${groups.map(([g, list]) => `<div class="team-group"><span class="eyebrow">${esc(g)}</span>${list.sort((a, b) => (ps[a].order || 999) - (ps[b].order || 999)).map(row).join('')}</div>`).join('')}`,
    `<button type="button" class="btn ghost" data-act="closeModal">Close</button>${isManager() ? `<button type="button" class="btn primary" data-act="refreshTeam" ${m.busy ? 'disabled' : ''}>${m.busy ? '<span class="spin"></span>Copying…' : icon('rotate', 16) + 'Refresh From Hub'}</button>` : ''}`, true);
}
