// What the page knows: deals (as saved, plus changes still being saved), the team copied from the hub, the SOP in
// effect, and what each person is looking at.
import { edit, legacyFix, normalizeAgent, prefixOf, storedNameFor, initials, ROOT_MANAGERS, SOP_EDITORS, DEPTS } from './logic.js';
import { DEFAULT_SOP, LEGACY_AGENTS } from './sop-default.js';
import { esc } from './ui.js';

const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
export const S = {
  user: null, ready: false,
  saved: new Map(),            // deal id -> deal as last read from the database
  pending: new Map(),          // deal id -> [{ seq, name, args }] changes on their way to the database
  tab: 'dashboard', activeId: null, helpPart: 'user',
  view: Object.assign({ status: 'open', strategy: 'All', sort: 'edited_desc' }, read('tchb_dash_view', {})),
  agentFilter: 'All',
  sections: {},                // group key -> 'open' | 'closed' (as before: finished groups close themselves)
  sectionDone: {},
  boxes: {},                   // which inline boxes are open (draft, link, add subtask, edit subtask)
  sopDoc: null, directory: null,
  notifs: [], selectedNotifs: new Set(),
  online: [], prefs: null,
  chat: { open: false, view: 'hub', search: '', searching: false, overlay: null, focus: null, firstUnread: null },
  menu: null, modal: null, sopEdit: null
};
export const saveView = () => { try { localStorage.setItem('tchb_dash_view', JSON.stringify(S.view)); } catch (e) {} };

// ---------------------------------------------------------------- deals with changes not yet confirmed
let seq = 0;
export function applyPending(d, list, ctx) {
  const c = legacyFix(JSON.parse(JSON.stringify(d)));
  for (const p of list) { try { edit[p.name](c, ctx, ...JSON.parse(JSON.stringify(p.args))); } catch (e) {} }
  return c;
}
let ctxFn = () => ({ now: Date.now(), me: 'agent', name: 'Agent' });
export const setCtx = f => { ctxFn = f; };
const cache = new Map();
export function deal(id) {
  const d = S.saved.get(id); if (!d) return null;
  const list = S.pending.get(id); if (!list || !list.length) return d;
  const key = d.__v + ':' + list.map(p => p.seq).join(',');
  const hit = cache.get(id); if (hit && hit.key === key) return hit.d;
  const out = applyPending(d, list, ctxFn()); cache.set(id, { key, d: out }); return out;
}
export const allDeals = () => [...S.saved.keys()].map(deal).filter(Boolean);
export const addPending = (id, name, args) => { const p = { seq: ++seq, name, args }; S.pending.set(id, [...(S.pending.get(id) || []), p]); return p; };
export const dropPending = (id, p) => S.pending.set(id, (S.pending.get(id) || []).filter(x => x !== p));

// ---------------------------------------------------------------- people (the hub's team directory)
export const people = () => (S.directory && S.directory.people) || {};
export const managers = () => [...new Set([...ROOT_MANAGERS, ...((S.directory && S.directory.managers) || [])])];
const teamEmail = e => /@totalchb\.com$/i.test(e);
export function personOf(stored) {
  let n = normalizeAgent(stored); if (!n || n === 'unassigned') return null;
  if (n === 'systems') n = 'remy';                                  // chat authors and drafts store the email prefix
  const ps = people(), email = Object.keys(ps).find(e => teamEmail(e) && prefixOf(e) === n);
  return email ? { email, ...ps[email] } : null;
}
export const label = stored => { const p = personOf(stored); return p && p.name ? p.name : (stored || 'Unassigned'); };
export function face(stored, cls = '') {
  const p = personOf(stored), name = p && p.name ? p.name : stored;
  if (!stored || normalizeAgent(stored) === 'unassigned') return `<span class="face none ${cls}">?</span>`;
  return `<span class="face ${cls}">${esc(initials(name))}${p && p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy">` : ''}</span>`;
}
export const nameOfEmail = email => { const p = people()[String(email || '').toLowerCase()]; return (p && p.name) || String(email || '').split('@')[0]; };
// Signed in as someone else (Sign In As): changes are recorded as "<their name> (via <Remy's name>)", like the hub.
export const myName = (plain = false) => { const n = S.user ? nameOfEmail(S.user.email) : 'Agent'; return S.imp && !plain ? n + ' (via ' + nameOfEmail(S.imp) + ')' : n; };
export const isManager = () => !!S.user && managers().includes(S.user.email.toLowerCase());
export const canEditSop = () => !!S.user && SOP_EDITORS.includes(S.user.email.toLowerCase());

/** The owner menu: Managers, then TC / DISPO / ACQ / OPS (Team Leaders first), company accounts only. Before the
 *  team is copied from the hub, today's nine names. Each choice is the name stored on the deal (alerts match it). */
export function ownerGroups() {
  const ps = people(), emails = Object.keys(ps).filter(teamEmail);
  if (!emails.length) return [{ label: 'Team', items: LEGACY_AGENTS.map(n => ({ value: n, name: n })) }];
  const ms = managers(), order = e => ps[e].order || 999, by = (a, b) => order(a) - order(b) || (ps[a].name || a).localeCompare(ps[b].name || b);
  const item = e => ({ value: storedNameFor(e), name: ps[e].name || storedNameFor(e), email: e });
  const groups = [{ label: 'Managers', items: emails.filter(e => ms.includes(e)).sort(by).map(item) }];
  for (const d of DEPTS) groups.push({ label: d, items: emails.filter(e => !ms.includes(e) && ps[e].dept === d).sort((a, b) => (ps[b].role === 'lead') - (ps[a].role === 'lead') || by(a, b)).map(item) });
  const other = emails.filter(e => !ms.includes(e) && !DEPTS.includes(ps[e].dept));
  if (other.length) groups.push({ label: 'Other', items: other.sort(by).map(item) });
  return groups.filter(g => g.items.length);
}

// ---------------------------------------------------------------- the SOP in effect
export const STRATEGY_ORDER = ['Wholesale', 'Novation', 'Fix & Flip', 'Creative'];
export function sop() {
  const st = S.sopDoc && Array.isArray(S.sopDoc.strategies) && S.sopDoc.strategies.length ? S.sopDoc.strategies : null;
  if (st) return Object.fromEntries([...st].sort((a, b) => (a.order || 0) - (b.order || 0)).map(s => [s.name, s.tasks || []]));
  const o = {}; STRATEGY_ORDER.forEach(n => { o[n] = DEFAULT_SOP[n]; }); return o;
}
export const strategies = () => Object.keys(sop());
export const strategyClass = s => 'strat-' + String(s || 'Wholesale').replace(/[^A-Za-z]/g, '');
