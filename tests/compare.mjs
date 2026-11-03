// Compare what today's page and the revamped page saved for the same actions: every field name and value type, per
// document kind, with every task and subtask merged. Fields only the new page writes must be on the approved list
// (the plan, section D); nothing the old page wrote may go missing or change type.
import fs from 'node:fs';
const OUT = new URL('./out/', import.meta.url);
const A = JSON.parse(fs.readFileSync(new URL('data-old.json', OUT))), B = JSON.parse(fs.readFileSync(new URL('data-new.json', OUT)));
const APPROVED = new Set(['log', 'startedAt', 'doneAt', 'status', 'createdAt', 'due', 'dueSet', 'notes', 'files', 'statusAt', 'statusBy']);
const RANDOM_KEYS = /^(sessions|readBy)$/;     // maps keyed by device id / person: compare their values only

function shape(v, into = { t: new Set() }) {
  if (Array.isArray(v)) { into.t.add('array'); into.items = into.items || { t: new Set() }; v.forEach(x => shape(x, into.items)); }
  else if (v && typeof v === 'object') { into.t.add('object'); into.keys = into.keys || {}; for (const [k, x] of Object.entries(v)) shape(x, into.keys[k] = into.keys[k] || { t: new Set() }); }
  else into.t.add(v === null ? 'null' : typeof v);
  return into;
}
function collapse(s) {      // maps keyed by ids: merge all values under one key '*'
  if (s.keys) { for (const [k, v] of Object.entries(s.keys)) { if (RANDOM_KEYS.test(k) && v.keys) { const m = { t: new Set() }; Object.values(v.keys).forEach(x => merge(m, x)); v.keys = { '*': m }; } collapse(v); } }
  if (s.items) collapse(s.items);
  return s;
}
function merge(a, b) { b.t.forEach(x => a.t.add(x)); if (b.items) merge(a.items = a.items || { t: new Set() }, b.items); if (b.keys) { a.keys = a.keys || {}; for (const [k, v] of Object.entries(b.keys)) merge(a.keys[k] = a.keys[k] || { t: new Set() }, v); } }
const kindOf = p => p.split('/').filter((_, i) => i % 2 === 0).join('/');
const byKind = data => { const o = {}; for (const [p, d] of Object.entries(data)) shape(d, o[kindOf(p)] = o[kindOf(p)] || { t: new Set() }); Object.values(o).forEach(collapse); return o; };
const a = byKind(A), b = byKind(B), out = { missing: [], added: [], unapproved: [], types: [] };
function walk(x, y, p) {
  const extra = [...y.t].filter(t => !x.t.has(t) && !(t === 'null' && /doneAt|startedAt/.test(p)));
  if (extra.length) out.types.push(`${p}: ${[...x.t].join('|')} -> also ${extra.join('|')}`);
  if (x.items && y.items) walk(x.items, y.items, p + '[]');
  if (x.keys || y.keys) {
    const xk = x.keys || {}, yk = y.keys || {};
    for (const k of Object.keys(xk)) { if (!(k in yk)) out.missing.push(p + '.' + k); else walk(xk[k], yk[k], p + '.' + k); }
    for (const k of Object.keys(yk)) if (!(k in xk)) (APPROVED.has(k) ? out.added : out.unapproved).push(p + '.' + k);
  }
}
for (const kind of new Set([...Object.keys(a), ...Object.keys(b)])) {
  if (!a[kind]) { out.unapproved.push('NEW DOCUMENT KIND ' + kind); continue; }
  if (!b[kind]) { out.missing.push('DOCUMENT KIND ' + kind); continue; }
  walk(a[kind], b[kind], kind);
}
for (const [k, v] of Object.entries(out)) { console.log(`${k}: ${v.length}`); v.forEach(x => console.log('   ', x)); }
process.exit(out.missing.length || out.unapproved.length || out.types.length ? 1 : 0);
