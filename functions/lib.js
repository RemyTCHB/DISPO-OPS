// DISPO OPS Cloud Functions: the rules added in the revamp, as plain functions (no Firebase) so they can be tested.
//  - Closed / Cancelled deals send no alerts.
//  - Overdue alerts: a task or subtask past its due date nudges the task's owner once, then on their reminder interval.
//  - The team copied from the Universal Team Hub (its signed team endpoint).
//  - The one-way sync into the hub (the hub mirrors each deal; HUB_SYNC_ENABLED in functions/.env).
const crypto = require('crypto');

const isClosed = d => !!d && (d.status === 'closed' || d.status === 'cancelled');

// ---------------------------------------------------------------- overdue alerts
const isTaskDone = t => !!(t.completed && (!t.subtasks || t.subtasks.every(s => s.completed)));
/** Every open item past its due date: [{ key, due, title, owner, task }]. Subtasks belong to their task's owner. */
function overdueItems(prop, now) {
  const out = [];
  if (isClosed(prop)) return out;
  for (const t of prop.tasks || []) {
    if (t.due && t.due <= now && !isTaskDone(t)) out.push({ key: t.id, due: t.due, title: t.title, owner: t.assignee, task: null });
    for (const s of t.subtasks || []) if (s.due && s.due <= now && !s.completed) out.push({ key: t.id + '/' + s.id, due: s.due, title: s.title, owner: t.assignee, task: t.title });
  }
  return out;
}
/** Should this overdue item nudge now? Once when it first becomes overdue, then every `intervalHours`.
 *  `last` is what was sent before for the item ({ due, at }), or null. A moved due date starts over. */
function overdueDue(last, item, now, intervalHours) {
  if (!last || last.due !== item.due) return true;
  return now - last.at >= intervalHours * 3600 * 1000 - 5 * 60 * 1000;   // 5 minutes' leeway for the hourly run
}

// ---------------------------------------------------------------- the team from the hub
const DEPTS = ['TC', 'DISPO', 'ACQ', 'OPS'];
/** The hub's team answer ({ people: [{ name, email, role, dept, photo }] }) as DISPO OPS stores it. */
function directoryFrom(answer, now, by) {
  const people = {}, managers = [];
  (answer && answer.people || []).forEach((p, i) => {
    const email = String(p.email || '').trim().toLowerCase(); if (!email || !email.includes('@')) return;
    people[email] = { name: String(p.name || '').trim() || email.split('@')[0], role: ['manager', 'lead', 'member'].includes(p.role) ? p.role : 'member',
      dept: DEPTS.includes(p.dept) ? p.dept : '', photo: /^https:\/\//.test(p.photo || '') ? p.photo : '', order: i + 1 };
    if (p.role === 'manager') managers.push(email);
  });
  return { people, managers, copiedAt: now, copiedBy: by || 'DISPO OPS' };
}

// ---------------------------------------------------------------- signing (the hub's scheme)
// HMAC-SHA256 of "<unix seconds>.<raw body>" in X-Hub-Timestamp / X-Hub-Signature, 5 minutes' leeway.
function sign(secret, body, ts = Math.floor(Date.now() / 1000)) {
  return { 'X-Hub-Timestamp': String(ts), 'X-Hub-Signature': 'sha256=' + crypto.createHmac('sha256', secret).update(ts + '.' + body).digest('hex') };
}

// ---------------------------------------------------------------- the one-way sync into the hub (a mirror)
// One hub task per deal ("DISPO OPS - <address>" in Carlos's list, ring = overall %); one hub subtask per phase (its %,
// the group being worked on and that group's next task, owned by that task's owner). Closed = Done in the hub, Cancelled = the hub's Cancelled status.
function phaseStats(prop) {
  const out = [];
  for (const t of prop.tasks || []) {
    let p = out.find(x => x.phase === t.phase); if (!p) out.push(p = { phase: t.phase, weight: 0, done: 0, next: null, started: false });
    const isSOW = t.isSOW && t.subtasks && t.subtasks.length > 0, fully = isSOW ? t.subtasks.every(s => s.completed) : isTaskDone(t);
    p.weight += t.weight;
    p.done += isSOW ? (t.subtasks.filter(s => s.completed).length / t.subtasks.length) * t.weight : fully ? t.weight : 0;
    if (!fully && !p.next) p.next = { group: t.mainTask || '', title: t.title, owner: t.assignee || 'Unassigned' };   // the group being worked on and its next task
    if (t.completed || (t.subtasks || []).some(s => s.completed || s.status === 'progress')) p.started = true;
  }
  return out.map(p => ({ phase: p.phase, percent: p.weight > 0 ? Math.min(100, Math.round((p.done / p.weight) * 100)) : (p.next ? 0 : 100), complete: !p.next, started: p.started, next: p.next }));
}
function overallPercent(prop) {   // same as the page's getPropStats
  let percent = 0;
  (prop.tasks || []).forEach(t => {
    const isSOW = t.isSOW && t.subtasks && t.subtasks.length > 0;
    if (isSOW) percent += (t.subtasks.filter(s => s.completed).length / t.subtasks.length) * t.weight;
    else if (isTaskDone(t)) percent += t.weight;
  });
  return Math.min(Math.round(percent), 100);
}
/** What the hub gets for a deal (nothing about chat, drafts, links or files). `prop` null = the deal was removed. */
function hubPayload(id, prop, appUrl) {
  if (!prop) return { deal: { id, removed: true } };
  const phases = phaseStats(prop), next = phases.find(p => !p.complete);
  return { deal: { id: prop.id || id, address: prop.address || '', url: `${appUrl}/?deal=${encodeURIComponent(prop.id || id)}`, strategy: prop.exitStrategy || 'Wholesale',
    status: isClosed(prop) ? prop.status : 'open', percent: overallPercent(prop), next: next ? next.next : null },
    phases: phases.map(p => ({ phase: p.phase, percent: p.percent, complete: p.complete, started: p.started, next: p.next })) };
}
/** Only send when what the hub would show changed (not for chat, drafts or read receipts). */
const payloadKey = p => crypto.createHash('sha1').update(JSON.stringify(p)).digest('hex');

module.exports = { isClosed, overdueItems, overdueDue, directoryFrom, sign, hubPayload, payloadKey, phaseStats, overallPercent, DEPTS };
