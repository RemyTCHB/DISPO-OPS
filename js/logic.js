// DISPO OPS: the rules, as plain functions (no page, no Firebase), so they can be tested on their own.
// Calculations and changes keep the exact behaviour of the page before the revamp; new fields are optional and
// additive (see docs/DATA.md). Every change to a deal goes through one of the `edit` functions below.

// ---------------------------------------------------------------- people
export const ROOT_MANAGERS = ['brandy@totalchb.com', 'systems@totalchb.com'];
export const SOP_EDITORS = ['carlos@totalchb.com', 'systems@totalchb.com'];
export const DEPTS = ['TC', 'DISPO', 'ACQ', 'OPS'];
// Same matching as the Cloud Functions: an owner's stored first name to an email prefix ("Sarah" = sara@, "Remy" = systems@).
export const normalizeAgent = name => { const v = String(name || '').trim().toLowerCase(); return v === 'sarah' ? 'sara' : v; };
export const prefixOf = email => { const p = String(email || '').split('@')[0].toLowerCase(); return p === 'systems' ? 'remy' : p; };
// The stored owner name for a person: today's spelling for the original nine, otherwise the email prefix capitalised.
const LEGACY_NAME = { sara: 'Sarah', remy: 'Remy' };
export const storedNameFor = email => { const p = prefixOf(email); return LEGACY_NAME[p] || (p.charAt(0).toUpperCase() + p.slice(1)); };
export const sameAgent = (a, b) => normalizeAgent(a) === normalizeAgent(b);
export const initials = n => String(n || '').trim().split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

// ---------------------------------------------------------------- dates (always Eastern time, like the hub)
const ET_PARTS = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', year: 'numeric', month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short' });
const ET_12 = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit' });
const ET_12S = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
export const etParts = ts => Object.fromEntries(ET_PARTS.formatToParts(new Date(ts)).map(p => [p.type, p.value]));
export const etDate = ts => { const p = etParts(ts); return p.weekday + ' ' + p.month + '/' + p.day + '/' + p.year; };   // Wed 10/28/2026
export const etDay = ts => { const p = etParts(ts); return p.month + '/' + p.day + '/' + p.year; };                       // 10/28/2026
export const et24 = ts => { const p = etParts(ts); return p.hour + ':' + p.minute + ':' + p.second; };                  // 21:30:15
export const et12 = ts => ET_12.format(new Date(ts));                                                                     // 9:30:15 PM
export const etZone = ts => etParts(ts).timeZoneName;                                                                     // EST / EDT
export const when = ts => ts ? etDay(ts) + ' ' + et24(ts).slice(0, 5) + ' (' + ET_12S.format(new Date(ts)) + ') ' + etZone(ts) : '-';
export const whenShort = ts => ts ? etDay(ts) + ' ' + ET_12S.format(new Date(ts)) : '-';
export const dueShort = ts => { const p = etParts(ts); return p.weekday + ' ' + p.month + '/' + p.day + ' ' + ET_12S.format(new Date(ts)); };
// A day and time picked in Eastern time, whatever the device's time zone -> ms.
export function etToMs(y, m, d, hh = 9, mm = 0) {
  const want = Date.UTC(y, m - 1, d, hh, mm); let ts = want;
  for (let i = 0; i < 3; i++) { const p = etParts(ts); ts += want - Date.UTC(+p.year, p.month - 1, +p.day, +p.hour % 24, +p.minute); }
  return ts;
}
export const etYmd = ts => { const p = etParts(ts); return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute }; };

/** "2 Days - 3 Hrs - 5 Mins Ago", exactly as before (the dashboard's Time Last Edited). Returns [top, bottom|null]. */
export function timeSinceParts(ms, now = Date.now(), splitLines = false) {
  const diffInSeconds = Math.floor((now - ms) / 1000);
  if (diffInSeconds < 60) return ['Just now', null];
  let mins = Math.floor(diffInSeconds / 60); let hrs = Math.floor(mins / 60);
  let days = Math.floor(hrs / 24); const yrs = Math.floor(days / 365);
  mins = mins % 60; hrs = hrs % 24; days = days % 365;
  const parts = [];
  if (yrs > 0) parts.push(`${yrs} ${yrs === 1 ? 'Yr' : 'Yrs'}`);
  if (days > 0) parts.push(`${days} ${days === 1 ? 'Day' : 'Days'}`);
  if (hrs > 0) parts.push(`${hrs} ${hrs === 1 ? 'Hr' : 'Hrs'}`);
  if (mins > 0) parts.push(`${mins} ${mins === 1 ? 'Min' : 'Mins'}`);
  if (parts.length === 0) return ['Just now', null];
  if (splitLines && parts.length > 2) return [parts.slice(0, 2).join(' - '), parts.slice(2).join(' - ') + ' Ago'];
  return [parts.join(' - ') + ' Ago', null];
}
export const timeSince = (ms, now) => timeSinceParts(ms, now)[0];

// ---------------------------------------------------------------- deals as stored
/** The fix-up the page has always applied to every deal it reads (legacy task ids), kept exactly. */
export function legacyFix(data) {
  if (data && data.tasks) {
    data.tasks = data.tasks.filter(t => t.id !== 'p3_7');
    const p36 = data.tasks.find(t => t.id === 'p3_6');
    if (p36) {
      p36.subtasks = p36.subtasks || [];
      if (!p36.subtasks.some(s => s.title.includes('Boost the Post'))) {
        p36.subtasks.unshift({ id: 'sub_default_boost', title: 'Boost the Post (If Needed)', completed: false, isDefault: true });
      }
    }
  }
  return data;
}

export const isTaskDone = t => !!(t.completed && (!t.subtasks || t.subtasks.every(s => s.completed)));
export const sectionKeyOf = (phase, mainTask) => btoa(encodeURIComponent(phase + '_' + mainTask)).replace(/=/g, '');

/** Progress %, next step and next agent, exactly as the dashboard always worked them out. */
export function getPropStats(prop) {
  let percent = 0, nextStep = 'Fully Complete', nextTaskDetail = 'All workflow tasks finished', nextAgent = '-', nextTaskId = null,
    nextSectionKey = null, foundNext = false, nextSubtask = null;
  (prop.tasks || []).forEach(t => {
    const isSOW = t.isSOW && t.subtasks && t.subtasks.length > 0;
    const subLen = isSOW ? t.subtasks.length : 0;
    const completedCount = isSOW ? t.subtasks.filter(s => s.completed).length : 0;
    const isTaskFullyCompleted = isSOW ? (completedCount === subLen) : (t.completed && (!t.subtasks || t.subtasks.every(s => s.completed)));
    if (isSOW) percent += (completedCount / subLen) * t.weight;
    else if (isTaskFullyCompleted) percent += t.weight;
    if (!isTaskFullyCompleted && !foundNext) {
      nextStep = t.phase;
      nextTaskDetail = t.title;
      const pendingSub = (t.subtasks || []).find(s => !s.completed);
      if (pendingSub) { nextTaskDetail = `Subtask: ${pendingSub.title}`; nextSubtask = pendingSub.title; }
      nextAgent = t.assignee;
      nextTaskId = t.id;
      nextSectionKey = sectionKeyOf(t.phase, t.mainTask);
      foundNext = true;
    }
  });
  percent = Math.min(Math.round(percent), 100);
  if (percent === 100) nextAgent = 'Completed';
  return { percent, nextStep, nextTaskDetail, nextAgent, nextTaskId, nextSectionKey, nextTitle: foundNext ? nextTaskDetail : null, nextSubtask };
}

/** A group's %, Complete/Pending (as before: a ticked task counts its weight). */
export function groupStats(tasks) {
  const allCompleted = tasks.length > 0 && tasks.every(isTaskDone);
  const totalWeight = tasks.reduce((s, t) => s + t.weight, 0);
  const completedWeight = tasks.reduce((s, t) => s + (t.completed ? t.weight : 0), 0);
  const percent = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : (allCompleted ? 100 : 0);
  return { allCompleted, percent };
}

/** A phase's % (for the hub sync): the same weighting as the overall %, within the phase. */
export function phaseStats(prop) {
  const out = [];
  for (const t of prop.tasks || []) {
    let p = out.find(x => x.phase === t.phase); if (!p) out.push(p = { phase: t.phase, weight: 0, done: 0, next: null });
    const isSOW = t.isSOW && t.subtasks && t.subtasks.length > 0;
    const fully = isSOW ? t.subtasks.every(s => s.completed) : isTaskDone(t);
    p.weight += t.weight;
    p.done += isSOW ? (t.subtasks.filter(s => s.completed).length / t.subtasks.length) * t.weight : fully ? t.weight : 0;
    if (!fully && !p.next) { const sub = (t.subtasks || []).find(s => !s.completed); p.next = { title: sub ? sub.title : t.title, task: t.title, owner: t.assignee }; }
    p.anyDone = p.anyDone || t.completed || (t.subtasks || []).some(s => s.completed || s.status === 'progress');
  }
  return out.map(p => ({ phase: p.phase, percent: p.weight > 0 ? Math.min(100, Math.round((p.done / p.weight) * 100)) : (p.next ? 0 : 100),
    complete: !p.next, started: !!p.anyDone, next: p.next }));
}

// ---------------------------------------------------------------- deploying a deal (as before)
export function parseSOWCSV(csvText) {
  if (!csvText) return [];
  const rows = csvText.split('\n').filter(r => r.trim().length > 0);
  if (rows.length <= 1) return [];
  return rows.slice(1).map((row, i) => {
    const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.trim().replace(/^"|"$/g, ''));
    const task = cols[0] || `SOW Item ${i + 1}`;
    const detail = cols[1] ? ` - ${cols[1]}` : '';
    const price = cols[2] ? ` - ${cols[2]}` : '';
    return task + detail + price;
  });
}

const rnd = n => Math.random().toString(36).substr(2, n);

/** A deal's tasks from its strategy's blueprint (the saved SOP, or the built-in one), exactly as before. */
export function generateTaskInstances(sop, strategy, csvContent, now = Date.now()) {
  const blueprint = sop[strategy] || sop['Wholesale'] || [];
  const tasks = blueprint.map(task => {
    const subtasks = task.defaultSubtasks ? task.defaultSubtasks.map((stTitle, i) => ({
      id: 'sub_' + now + i + rnd(5), title: stTitle, completed: false, isDefault: true, requiresDraft: false, requiresLink: false
    })) : [];
    const requiresDraft = !!(task.draftsAndHyperlinks && task.draftsAndHyperlinks.includes('Draft'));
    const requiresLink = !!(task.draftsAndHyperlinks && task.draftsAndHyperlinks.includes('Hyperlink'));
    return {
      id: task.id, phase: task.phase, mainTask: task.mainTask, title: task.title,
      weight: task.weight, assignee: task.defaultAssignee || 'Unassigned', completed: false,
      subtasks, templateText: '', templateLastEditedBy: null, templateLastEditedAt: null,
      isDropdown: task.dropdownOptions ? true : false, dropdownOptions: task.dropdownOptions || null, selectedOption: null,
      requiresDraft, requiresLink,
      ...(task.splitWeight ? { isSOW: true } : {})   // the SOP says: split the weight equally across its subtasks (as a CSV SOW task does)
    };
  });
  if (strategy === 'Fix & Flip' && csvContent) {
    const sowItems = parseSOWCSV(csvContent);
    if (sowItems.length > 0) {
      const subtasks = sowItems.map((item, i) => ({ id: 'sub_sow_' + now + i, title: item, completed: false, isDefault: true, requiresLink: false, requiresDraft: false }));
      const sowTask = tasks.find(t => t.id === 'ff_3');
      if (sowTask) { sowTask.subtasks = [...(sowTask.subtasks || []), ...subtasks]; sowTask.isSOW = true; }
    }
  }
  return tasks;
}

export function newDeal(sop, address, strategy, csv, now = Date.now()) {
  return { id: 'prop_' + now + rnd(5), address: address.trim(), exitStrategy: strategy, dateStarted: now,
    dateLastEdited: now, comments: [], readBy: {}, tasks: generateTaskInstances(sop, strategy, csv, now) };
}

// ---------------------------------------------------------------- status, due dates
export const STATUS = { open: 'Open', closed: 'Closed', cancelled: 'Cancelled' };
export const statusOf = d => d.status === 'closed' || d.status === 'cancelled' ? d.status : 'open';
export const isLocked = d => statusOf(d) !== 'open';
export const subStatus = s => s.completed ? 'done' : s.status === 'progress' ? 'progress' : 'todo';

/** Every open due date in a deal (tasks and subtasks), earliest first: [{ due, tid, sid, title }]. */
export function openDues(d) {
  const out = [];
  for (const t of d.tasks || []) {
    if (t.due && !isTaskDone(t)) out.push({ due: t.due, tid: t.id, title: t.title, owner: t.assignee });
    for (const s of t.subtasks || []) if (s.due && !s.completed) out.push({ due: s.due, tid: t.id, sid: s.id, title: s.title, task: t.title, owner: t.assignee });
  }
  return out.sort((a, b) => a.due - b.due);
}
export const nextDue = d => openDues(d)[0] || null;

// ---------------------------------------------------------------- the dashboard's views (and Previous / Next)
export function viewDeals(deals, view) {
  const status = view.status || 'open', strat = view.strategy || 'All', sort = view.sort || 'edited_desc';
  const list = deals.filter(p => statusOf(p) === status && (strat === 'All' || (p.exitStrategy || 'Wholesale') === strat));
  const dueOf = p => { const n = nextDue(p), own = p.due || null, m = [own, n && n.due].filter(Boolean); return m.length ? Math.min(...m) : Infinity; };
  list.sort((a, b) => {
    if (sort === 'started_desc') return b.dateStarted - a.dateStarted;
    if (sort === 'started_asc') return a.dateStarted - b.dateStarted;
    if (sort === 'edited_desc') return b.dateLastEdited - a.dateLastEdited;
    if (sort === 'edited_asc') return a.dateLastEdited - b.dateLastEdited;
    if (sort === 'due_asc') return dueOf(a) - dueOf(b) || b.dateLastEdited - a.dateLastEdited;
    return 0;
  });
  return list;
}

// ---------------------------------------------------------------- changes to a deal
// Each edit changes the deal object in place. `x` = { now, me (email prefix, as stored before), name (display name) }.
// A target is { tid, ti } for a task or { tid, ti, sid, si } for a subtask (id first, the list position only to break
// ties in old deals that repeat an id).
export class EditError extends Error {}
export function findTask(d, { tid, ti }) {
  const byIdx = d.tasks[ti];
  const t = byIdx && byIdx.id === tid ? byIdx : d.tasks.find(x => x.id === tid);
  if (!t) throw new EditError('That task is no longer on this deal.');
  return t;
}
export function findSub(d, target) {
  const t = findTask(d, target), subs = t.subtasks || [];
  const byIdx = subs[target.si];
  const s = byIdx && byIdx.id === target.sid ? byIdx : subs.find(x => x.id === target.sid);
  if (!s) throw new EditError('That subtask is no longer on this task.');
  return { t, s };
}
const itemOf = (d, target) => target.sid ? findSub(d, target).s : target.tid ? findTask(d, target) : d;
const defined = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));   // Firestore refuses undefined
const log = (d, x, ev, extra = {}) => { d.log = [...(d.log || []), defined({ at: x.now, by: x.name, ev, ...extra })].slice(-300); };
const mark = (o, done, x) => { if (done) { if (!o.startedAt) o.startedAt = x.now; o.doneAt = x.now; } else if (o.doneAt) o.doneAt = null; };

export const edit = {
  // -- tasks
  toggleTask(d, x, tg, checked) {
    const t = findTask(d, tg); t.completed = checked; mark(t, checked, x);
    log(d, x, checked ? 'marked done' : 'reopened', { tid: t.id, title: t.title });
  },
  changeAssignee(d, x, tg, name) {
    const t = findTask(d, tg), was = t.assignee; t.assignee = name;
    log(d, x, 'owner', { tid: t.id, title: t.title, from: was, to: name });
  },
  selectOption(d, x, tg, optionIndex) {
    const t = findTask(d, tg);
    if (optionIndex === '' || optionIndex === null) { t.selectedOption = null; t.completed = false; log(d, x, 'path cleared', { tid: t.id, title: t.title }); return; }
    const opt = t.dropdownOptions[optionIndex];
    t.title = opt.title; t.assignee = opt.defaultAssignee; t.selectedOption = optionIndex;
    log(d, x, 'path chosen', { tid: t.id, title: opt.title });
  },
  editOption(d, x, tg) { const t = findTask(d, tg); t.selectedOption = null; t.completed = false; log(d, x, 'path reopened', { tid: t.id, title: t.title }); },
  addSubtask(d, x, tg, { title, link, draft }) {
    const t = findTask(d, tg); if (!t.subtasks) t.subtasks = [];
    const s = { id: 'sub_' + x.now + rnd(5), title, completed: false, requiresLink: !!link, requiresDraft: !!draft, hyperlink: '', templateText: '', status: 'todo', createdAt: x.now };
    t.subtasks.push(s); t.completed = false;
    log(d, x, 'subtask added', { tid: t.id, sid: s.id, title });
  },
  // -- subtasks
  setSubStatus(d, x, tg, status) {
    const { t, s } = findSub(d, tg), was = subStatus(s);
    if (was === status) return false;
    s.completed = status === 'done'; s.status = status;
    if (status !== 'todo' && !s.startedAt) s.startedAt = x.now;
    s.doneAt = status === 'done' ? x.now : null;
    // the task follows its subtasks, exactly as before
    const allDone = t.subtasks.every(z => z.completed);
    t.completed = allDone; mark(t, allDone, x);
    log(d, x, { done: 'marked done', progress: 'moved to In Progress', todo: 'set to Not Started' }[status], { tid: t.id, sid: s.id, title: s.title });
  },
  editSubtask(d, x, tg, { title, link, draft }) {
    const { s } = findSub(d, tg);
    s.title = title;
    s.requiresLink = link; if (!link) s.hyperlink = '';
    s.requiresDraft = draft; if (!draft) s.templateText = '';
    log(d, x, 'subtask edited', { tid: tg.tid, sid: s.id, title });
  },
  removeSubtask(d, x, tg) {
    const { t, s } = findSub(d, tg);
    t.subtasks.splice(t.subtasks.indexOf(s), 1);
    if (t.subtasks.length > 0) { if (t.subtasks.every(z => z.completed)) t.completed = true; }
    else t.completed = false;
    log(d, x, 'subtask removed', { tid: t.id, title: s.title });
  },
  // -- drafts and links (tasks or subtasks, stored as before)
  saveTemplate(d, x, tg, text) {
    const it = itemOf(d, tg); it.templateText = text; it.templateLastEditedBy = x.me; it.templateLastEditedAt = x.now;
    log(d, x, 'draft saved', { tid: tg.tid, sid: tg.sid, title: it.title });
  },
  saveLink(d, x, tg, url) { const it = itemOf(d, tg); it.hyperlink = String(url || '').trim(); log(d, x, 'link saved', { tid: tg.tid, sid: tg.sid, title: it.title }); },
  clearLink(d, x, tg) { const it = itemOf(d, tg); it.hyperlink = ''; log(d, x, 'link removed', { tid: tg.tid, sid: tg.sid, title: it.title }); },
  // -- custom tasks (Inject Custom Task), exactly as before
  injectTask(d, x, state) {
    const title = (state.title || '').trim(), weight = parseFloat(state.weight) || 0;
    const mainTask = state.categoryMode === 'existing' ? state.category : (state.newCategoryName || '').trim();
    if (!state.phase) throw new EditError('Target Phase is required.');
    if (!state.categoryMode) throw new EditError('Group Mode is required.');
    if (!mainTask) throw new EditError(state.categoryMode === 'new' ? 'New Group Name is required.' : 'Select an existing group.');
    if (!title) throw new EditError('Task Title is required.');
    if (!state.assignee) throw new EditError('Assignee is required.');
    let totalDeducted = 0; const updates = [];
    if (weight > 0) {
      for (const dd of state.deductions || []) {
        const dWeight = parseFloat(dd.weight) || 0;
        if (dWeight <= 0) continue;
        if (!dd.taskId) throw new EditError('Please select a task for all deduction rows.');
        const donor = d.tasks.find(t => t.id === dd.taskId);
        if (!donor) continue;
        if (donor.weight < dWeight) throw new EditError(`Cannot borrow ${dWeight}% from "${donor.title}" (only has ${donor.weight}%).`);
        totalDeducted += dWeight; updates.push({ task: donor, amount: dWeight });
      }
      if (Math.abs(totalDeducted - weight) > 0.01) throw new EditError(`Deductions (${totalDeducted.toFixed(1)}%) must exactly match the Task Weight (${weight}%).`);
    }
    updates.forEach(u => { u.task.weight = parseFloat((u.task.weight - u.amount).toFixed(2)); });
    const task = { id: 'custom_' + x.now + rnd(5), phase: state.phase, mainTask, title, weight, assignee: state.assignee,
      completed: false, subtasks: [], templateText: '', hyperlink: '', requiresDraft: !!state.requireDraft, requiresLink: !!state.requireLink,
      isCustom: true, borrowedWeight: weight, deductionsHistory: JSON.parse(JSON.stringify(state.deductions || [])),
      ...(state.splitWeight ? { isSOW: true } : {}) };   // weight split equally across its subtasks, like a CSV SOW task
    let at = d.tasks.length;
    if (state.categoryMode === 'existing') {
      for (let i = d.tasks.length - 1; i >= 0; i--) if (d.tasks[i].phase === state.phase && d.tasks[i].mainTask === mainTask) { at = i + 1; break; }
    } else if (state.insertGroupAfter === 'top') {
      for (let i = 0; i < d.tasks.length; i++) if (d.tasks[i].phase === state.phase) { at = i; break; }
    } else {
      for (let i = d.tasks.length - 1; i >= 0; i--) if (d.tasks[i].phase === state.phase && d.tasks[i].mainTask === state.insertGroupAfter) { at = i + 1; break; }
    }
    d.tasks.splice(at, 0, task);
    log(d, x, 'custom task added', { tid: task.id, title });
    return task;
  },
  deleteCustomTask(d, x, tg) {
    const t = findTask(d, tg);
    if (t.deductionsHistory) {
      t.deductionsHistory.forEach(dd => { const donor = d.tasks.find(z => z.id === dd.taskId); if (donor) donor.weight = parseFloat((donor.weight + (parseFloat(dd.weight) || 0)).toFixed(2)); });
    } else if (t.borrowedWeight > 0 && t.borrowedFromId) {
      const donor = d.tasks.find(z => z.id === t.borrowedFromId); if (donor) donor.weight = parseFloat((donor.weight + t.borrowedWeight).toFixed(2));
    }
    d.tasks.splice(d.tasks.indexOf(t), 1);
    log(d, x, 'custom task deleted', { title: t.title });
  },
  // -- chat (stored as before)
  comment(d, x, text) {
    if (!d.comments) d.comments = [];
    d.comments.push({ id: 'cmt_' + x.now + rnd(5), text, author: x.me, timestamp: x.now, pinned: false });
    d.readBy = d.readBy || {}; d.readBy[x.me.toLowerCase()] = x.now;
  },
  pin(d, x, cid) { const c = (d.comments || []).find(z => z.id === cid); if (!c) return false; c.pinned = !c.pinned; },
  // -- new: status, due dates, notes, files
  setStatus(d, x, status) {
    const was = statusOf(d);
    if (status === 'open') { delete d.status; delete d.statusAt; delete d.statusBy; }
    else { d.status = status; d.statusAt = x.now; d.statusBy = x.name; }
    log(d, x, status === 'open' ? 'reopened deal' : status === 'closed' ? 'marked deal Closed' : 'marked deal Cancelled', { from: was });
  },
  setDue(d, x, tg, due) {
    const it = itemOf(d, tg);
    if (due) { it.due = due; it.dueSet = x.now; } else { delete it.due; delete it.dueSet; }
    log(d, x, due ? 'due date set' : 'due date removed', { tid: tg.tid, sid: tg.sid, title: it.title || d.address, due: due || null });
  },
  addNote(d, x, tg, text) {
    const it = itemOf(d, tg), n = { id: 'note_' + x.now + rnd(5), text, by: x.name, at: x.now };
    it.notes = [...(it.notes || []), n];
    log(d, x, 'note added', { tid: tg.tid, sid: tg.sid, title: it.title || d.address });
  },
  deleteNote(d, x, tg, nid) {
    const it = itemOf(d, tg), n = (it.notes || []).find(z => z.id === nid);
    if (!n) return false;
    if (n.by !== x.name) throw new EditError('Only the person who wrote a note can delete it.');
    it.notes = it.notes.filter(z => z.id !== nid);
    log(d, x, 'note deleted', { tid: tg.tid, sid: tg.sid, title: it.title || d.address });
  },
  addFile(d, x, tg, file) {
    const it = itemOf(d, tg), f = { id: file.id || 'file_' + x.now + rnd(5), kind: file.kind, name: file.name, url: file.url,
      ...(file.path ? { path: file.path, size: file.size, type: file.type } : {}), by: x.name, at: x.now };
    it.files = [...(it.files || []), f];
    log(d, x, file.kind === 'link' ? 'link added' : 'file added', { tid: tg.tid, sid: tg.sid, title: it.title || d.address, name: file.name });
    return f;
  },
  removeFile(d, x, tg, fid) {
    const it = itemOf(d, tg), f = (it.files || []).find(z => z.id === fid);
    if (!f) return false;
    it.files = it.files.filter(z => z.id !== fid);
    log(d, x, f.kind === 'link' ? 'link removed' : 'file removed', { tid: tg.tid, sid: tg.sid, title: it.title || d.address, name: f.name });
    return f;
  }
};
// Edits that leave "Time Last Edited" alone, as before (task ticks and pins were quiet saves).
export const QUIET = new Set(['toggleTask', 'pin']);
// Edits still allowed on a Closed or Cancelled deal.
export const WHEN_LOCKED = new Set(['comment', 'pin', 'setStatus']);

// ---------------------------------------------------------------- the SOP editor
/** Problems that block saving an edited SOP (each strategy must total exactly 100%). */
export function sopProblems(sop) {
  const out = [];
  for (const [name, tasks] of Object.entries(sop)) {
    if (!name.trim()) out.push('A strategy has no name.');
    const total = Math.round(tasks.reduce((s, t) => s + (Number(t.weight) || 0), 0) * 100) / 100;
    if (total !== 100) out.push(`${name} totals ${total}%, it must be exactly 100%.`);
    tasks.forEach(t => {
      if (!String(t.title || '').trim() && !(t.dropdownOptions || []).length) out.push(`${name}: a task has no title.`);
      if (!String(t.phase || '').trim()) out.push(`${name}: "${t.title}" has no phase.`);
      if (Number(t.weight) < 0) out.push(`${name}: "${t.title}" has a negative weight.`);
    });
    const ids = tasks.map(t => t.id); if (new Set(ids).size !== ids.length) out.push(`${name}: two tasks share an id.`);
  }
  if (!Object.keys(sop).length) out.push('There must be at least one strategy.');
  return [...new Set(out)];
}
