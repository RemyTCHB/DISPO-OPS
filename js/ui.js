// Screen helpers: safe text, redrawing only what changed, glass menus and popovers, the date picker, toasts, tooltips.
import { icon } from './icons.js';
import { etYmd, etToMs, etParts } from './logic.js';

export const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
export const attr = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== false)
  .map(([k, v]) => v === true ? k : `${k}="${esc(v)}"`).join(' ');
export const safeUrl = u => { const s = String(u || '').trim(); if (!s) return ''; const full = /^https?:\/\//i.test(s) ? s : 'https://' + s;
  try { const p = new URL(full); return /^https?:$/.test(p.protocol) ? p.href : ''; } catch (e) { return ''; } };

// ---------------------------------------------------------------- redraw only what changed
// Children with data-key are kept when their markup is unchanged, updated in place when marked data-morph, and
// replaced otherwise. A part someone is typing in is left alone until they leave it (then it catches up).
let deferred = false;
export const wasDeferred = () => { const d = deferred; deferred = false; return d; };
const tpl = document.createElement('template');
export function patch(container, html) {
  tpl.innerHTML = html;
  morphChildren(container, tpl.content);
}
function morphChildren(parent, next) {
  const old = new Map();
  for (const c of [...parent.children]) { if (c.dataset && c.dataset.key) old.set(c.dataset.key, c); else c.remove(); }
  let at = 0;
  for (const nc of [...next.children]) {
    const key = nc.dataset && nc.dataset.key, h = nc.outerHTML;
    let node = key && old.get(key);
    if (node) {
      old.delete(key);
      if (node.__h !== h) {
        if (node.hasAttribute('data-morph') && nc.hasAttribute('data-morph') && node.tagName === nc.tagName) {
          syncAttrs(node, nc); morphChildren(node, nc); node.__h = h;
        } else if (document.activeElement && node.contains(document.activeElement) && document.activeElement.matches('input, textarea, select')) {
          deferred = true;
        } else { const fresh = nc.cloneNode(true); fresh.__h = h; node.replaceWith(fresh); node = fresh; }
      }
    } else { node = nc.cloneNode(true); node.__h = h; }
    if (parent.children[at] !== node) parent.insertBefore(node, parent.children[at] || null);
    at++;
  }
  old.forEach(n => n.remove());
}
function syncAttrs(a, b) {
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
}

// ---------------------------------------------------------------- toasts
let toastTimer = null;
export function toast(title, body = '', err = false) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); el.onclick = () => el.hidden = true; }
  el.className = 'toast' + (err ? ' err' : '');
  el.innerHTML = `<span>${esc(title)}</span>${body ? `<small>${esc(body)}</small>` : ''}`;
  el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, err ? 7000 : 4500);
}

// ---------------------------------------------------------------- tooltip (desktop hover, data-tip)
export function startTooltips() {
  const tip = document.createElement('div'); tip.className = 'tooltip'; tip.hidden = true; document.body.appendChild(tip);
  document.addEventListener('mouseover', e => {
    const t = e.target.closest('[data-tip]');
    if (!t || matchMedia('(pointer: coarse)').matches) { tip.hidden = true; return; }
    tip.innerHTML = (t.dataset.tipTitle ? `<b>${esc(t.dataset.tipTitle)}</b>` : '') + esc(t.dataset.tip);
    tip.hidden = false;
    const r = t.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px';
    tip.style.top = (r.bottom + 8 + h > window.innerHeight ? r.top - h - 8 : r.bottom + 8) + 'px';
  });
  document.addEventListener('scroll', () => { tip.hidden = true; }, true);
}

// ---------------------------------------------------------------- menus and popovers
// One floating layer: a scrim to close it, and the glass menu placed under its button (a bottom sheet on phones).
export function placeMenu(menu, anchor) {
  if (!menu || !anchor || !anchor.isConnected) return;
  if (window.innerWidth < 640) { menu.style.left = menu.style.top = ''; return; }
  const r = anchor.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
  let left = Math.min(r.left, window.innerWidth - w - 8), top = r.bottom + 6;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
  menu.style.left = Math.max(8, left) + 'px'; menu.style.top = top + 'px';
}

// ---------------------------------------------------------------- the hub's due date picker (Eastern time)
const WEEK = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const pad = n => String(n).padStart(2, '0');
/** Picker state from a saved time (or the default: 9:00 AM Eastern on the day picked). */
export function dpState(value, nowMs) {
  const base = etYmd(value || nowMs);
  return { y: base.y, m: base.m, pick: value ? { y: base.y, m: base.m, d: base.d } : null, hh: value ? base.hh : 9, mm: value ? base.mm : 0 };
}
export function dpHtml(st, { label = 'Due Date', title = '', hasValue = false, nowMs }) {
  const today = etYmd(nowMs), first = new Date(Date.UTC(st.y, st.m - 1, 1)).getUTCDay(), days = new Date(Date.UTC(st.y, st.m, 0)).getUTCDate();
  const month = new Date(Date.UTC(st.y, st.m - 1, 15)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const key = (y, m, d) => y * 10000 + m * 100 + d, tk = key(today.y, today.m, today.d), pk = st.pick ? key(st.pick.y, st.pick.m, st.pick.d) : 0;
  let cells = WEEK.map(w => `<span class="dp-week">${w}</span>`).join('') + '<span></span>'.repeat(first);
  for (let d = 1; d <= days; d++) {
    const k = key(st.y, st.m, d);
    cells += `<button type="button" class="dp-day${k === pk ? ' on' : ''}${k === tk ? ' today' : ''}${k < tk ? ' past' : ''}" data-act="dpDay" data-d="${d}" aria-pressed="${k === pk}">${d}</button>`;
  }
  const h12 = `${((st.hh + 11) % 12) + 1}:${pad(st.mm)} ${st.hh < 12 ? 'AM' : 'PM'}`;
  const ms = st.pick ? etToMs(st.pick.y, st.pick.m, st.pick.d, st.hh, st.mm) : null;
  const summary = ms ? `${label.replace(' Date', '')} ${new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'America/New_York' })}, ${pad(st.hh)}:${pad(st.mm)} (${h12}) ${etParts(ms).timeZoneName}` : 'Pick a day on the calendar.';
  const stepper = (unit, val) => `<div class="dp-step" role="group" aria-label="${unit}"><button type="button" class="dp-round" data-act="dpStep" data-unit="${unit}" data-n="-1" aria-label="Earlier ${unit.toLowerCase()}">${icon('minus', 16, 2.5)}</button><b>${pad(val)}</b><button type="button" class="dp-round" data-act="dpStep" data-unit="${unit}" data-n="1" aria-label="Later ${unit.toLowerCase()}">${icon('plus', 16, 2.5)}</button></div>`;
  return `<div class="dp-title"><b>${esc(label)}</b>${title ? `<span>${esc(title)}</span>` : ''}</div>
    <div class="dp-nav"><button type="button" class="dp-round" data-act="dpMonth" data-n="-1" aria-label="Previous month">${icon('back', 18, 2.5)}</button><span>${month}</span><button type="button" class="dp-round" data-act="dpMonth" data-n="1" aria-label="Next month">${icon('right', 18, 2.5)}</button></div>
    <div class="dp-grid">${cells}</div>
    <div class="dp-time"><div class="dp-clock">${stepper('Hour', st.hh)}<b>:</b>${stepper('Minutes', st.mm)}</div><span>${h12} ET</span></div>
    <div class="dp-summary">${esc(summary)}</div>
    <div class="dp-actions">${hasValue ? '<button type="button" class="dp-remove" data-act="dpClear">Remove</button>' : ''}<button type="button" class="dp-set" data-act="dpSet" ${ms ? '' : 'disabled'}>Set ${esc(label)}</button></div>`;
}
export function dpStep(st, unit, n) {
  if (unit === 'Hour') st.hh = (st.hh + n + 24) % 24;
  else st.mm = n > 0 ? (Math.floor(st.mm / 5) * 5 + 5) % 60 : (Math.ceil(st.mm / 5) * 5 + 55) % 60;
}
export function dpMonth(st, n) { const m = st.m - 1 + n; st.y += Math.floor(m / 12); st.m = ((m % 12) + 12) % 12 + 1; }
export const dpValue = st => st.pick ? etToMs(st.pick.y, st.pick.m, st.pick.d, st.hh, st.mm) : null;
