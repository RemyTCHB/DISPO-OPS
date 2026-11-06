// SOP Reference (everyone, read-only) and its editor (Carlos@ and Systems@ only; saved to public/data/settings/sop,
// used for deals deployed after the save).
import { icon } from './icons.js';
import { esc } from './ui.js';
import { S, sop, label, face, canEditSop } from './state.js';
import { sopProblems } from './logic.js';
import { pageTitle } from './views.js';

// A drag handle (mouse, touch or pen): app.js moves the item within its own level (data-dz) on release.
const grip = title => `<button type="button" class="mini grip" data-grip title="${title}" aria-label="${title}">${icon('grip', 16)}</button>`;
const romanOf = p => { const m = /Phase\s+([IVXL]+)\b/.exec(p || ''); return m ? m[1] : '-'; };
const groupBy = tasks => { const out = new Map(); tasks.forEach((t, i) => { if (!out.has(t.phase)) out.set(t.phase, new Map()); const g = out.get(t.phase); if (!g.has(t.mainTask)) g.set(t.mainTask, []); g.get(t.mainTask).push({ t, i }); }); return out; };

export function sopPage() {
  if (S.sopEdit) return sopEditor();
  const all = sop(), names = Object.keys(all);
  if (!S.sopStrategy || !all[S.sopStrategy]) S.sopStrategy = names[0];
  const tasks = all[S.sopStrategy] || [], structure = groupBy(tasks);
  const saved = S.sopDoc && S.sopDoc.updatedAt ? `Last edited by ${esc(S.sopDoc.updatedBy || 'a manager')} on ${new Date(S.sopDoc.updatedAt).toLocaleDateString('en-US', { timeZone: 'America/New_York' })}.` : 'The original SOP.';
  let body = '';
  for (const [phase, groups] of structure) {
    const total = [...groups.values()].flat().reduce((s, x) => s + x.t.weight, 0);
    body += `<section class="card sop-phase" data-key="sp-${esc(S.sopStrategy)}-${esc(phase)}"><div class="phase-head"><span class="num">${romanOf(phase)}</span><h2>${esc(phase)}</h2><span class="chip">${Math.round(total * 100) / 100}%</span></div>
      ${[...groups].map(([g, items]) => `<div class="sop-group"><h3>${esc(g || 'Tasks')}</h3>${items.map(({ t }) => `<div class="sop-task"><span class="grow">${esc(t.title)}</span>
        ${t.splitWeight ? '<span class="chip gray" title="The weight is split equally across its subtasks">Split Weight</span>' : ''}
        ${t.dropdownOptions ? '<span class="chip gray">' + icon('branch', 12) + 'Choose A Path</span>' : `<span class="owner static glass">${face(t.defaultAssignee)}<span class="nm">${esc(label(t.defaultAssignee || 'Unassigned'))}</span></span>`}
        <span class="weight">${t.weight}%</span>
        ${(t.defaultSubtasks || []).map(s => `<div class="sub-l">Subtask: ${esc(s)}</div>`).join('')}
        ${(t.dropdownOptions || []).map(o => `<div class="sub-l">Path: ${esc(o.title)} · ${esc(label(o.defaultAssignee))}</div>`).join('')}</div>`).join('')}</div>`).join('')}</section>`;
  }
  return `${pageTitle('SOP', 'Reference', 'sop-title')}
    <section class="toolbar" data-key="sop-tabs-${esc(S.sopStrategy)}-${names.length}"><div class="seg" role="group" aria-label="Exit strategy">${names.map(n => `<button type="button" data-act="sopStrategy" data-v="${esc(n)}" aria-pressed="${n === S.sopStrategy}">${esc(n)} <span class="n">${all[n].length}</span></button>`).join('')}</div>
      <span class="spacer"></span><small class="muted">${saved} Edits apply to deals deployed after they are saved.</small>${canEditSop() ? '<button type="button" class="btn secondary sm" data-act="sopEdit">' + icon('pen', 15) + 'Edit SOP</button>' : ''}</section>
    <div class="sop-wrap" data-key="sop-body-${esc(S.sopStrategy)}" data-morph>${body || '<section class="empty" data-key="e"><h3>No Tasks Yet</h3></section>'}</div>`;
}

// ---------------------------------------------------------------- the editor (works on a copy until Save)
function sopEditor() {
  const ed = S.sopEdit, names = Object.keys(ed.data), cur = ed.strategy, tasks = ed.data[cur] || [], structure = groupBy(tasks);
  const total = Math.round(tasks.reduce((s, t) => s + (Number(t.weight) || 0), 0) * 100) / 100, problems = sopProblems(ed.data);
  const inp = (v, k, i, extra = '') => `<input class="input" value="${esc(v)}" data-change="sopField" data-k="${k}" data-i="${i}" ${extra}>`;
  let body = '';
  for (const [phase, groups] of structure) {
    const first = [...groups.values()][0][0].i;
    body += `<section class="card sop-phase sop-edit"><div class="phase-head"><span class="num">${romanOf(phase)}</span><input class="input grow" value="${esc(phase)}" data-change="sopRename" data-what="phase" data-old="${esc(phase)}" aria-label="Phase name" style="font-family:var(--font-display);font-weight:800">
      <button type="button" class="btn sm ghost" data-act="sopAdd" data-what="group" data-phase="${esc(phase)}">${icon('plus', 14, 2.5)}Group</button></div>
      ${[...groups].map(([g, items]) => `<div class="sop-group" data-dz="group:${esc(phase)}" data-dv="${esc(g)}"><div class="row" style="flex-wrap:nowrap">${grip('Drag to reorder this group')}<input class="input grow" value="${esc(g)}" data-change="sopRename" data-what="group" data-phase="${esc(phase)}" data-old="${esc(g)}" aria-label="Group name" style="font-weight:800">
        <button type="button" class="btn sm ghost" data-act="sopAdd" data-what="task" data-phase="${esc(phase)}" data-group="${esc(g)}">${icon('plus', 14, 2.5)}Task</button></div>
        ${items.map(({ t, i }) => `<div class="sop-task" data-dz="task:${esc(phase)}::${esc(g)}" data-dv="${i}">
          ${grip('Drag to reorder this task')}
          <div class="stack grow" style="gap:6px;min-width:220px">${inp(t.title, 'title', i, 'aria-label="Task title" placeholder="Task title"')}
            ${(t.defaultSubtasks || []).length ? `<div class="sop-subs">${t.defaultSubtasks.map((x, si) => `<div class="sop-sub" data-dz="sub:${i}" data-dv="${si}">${grip('Drag to reorder this subtask')}<input class="input grow" value="${esc(x)}" data-change="sopSub" data-i="${i}" data-si="${si}" aria-label="Default subtask" placeholder="Subtask"><button type="button" class="mini" data-act="sopSubRemove" data-i="${i}" data-si="${si}" title="Remove subtask">${icon('x', 16)}</button></div>`).join('')}</div>` : ''}
            ${t.dropdownOptions ? `<div class="stack" style="gap:6px"><small class="muted">Paths (people choose one on the deal):</small>${t.dropdownOptions.map((o, oi) => `<div class="row" style="flex-wrap:nowrap"><input class="input grow" value="${esc(o.title)}" data-change="sopOption" data-i="${i}" data-oi="${oi}" aria-label="Path"><button type="button" class="owner glass" data-act="menu" data-menu="sopOwner" data-i="${i}" data-oi="${oi}">${face(o.defaultAssignee)}<span class="nm">${esc(label(o.defaultAssignee || 'Unassigned'))}</span></button><button type="button" class="mini" data-act="sopOptionRemove" data-i="${i}" data-oi="${oi}" title="Remove path">${icon('x', 16)}</button></div>`).join('')}</div>` : ''}
            <div class="row"><button type="button" class="btn sm ghost" data-act="sopSubAdd" data-i="${i}">${icon('plus', 14, 2.5)}Subtask</button>
              <label class="check-row" title="Each subtask on the deal (default ones and any added later) counts for an equal share of this task's weight, like a CSV SOW task"><input type="checkbox" data-change="sopSplit" data-i="${i}" ${t.splitWeight ? 'checked' : ''}>Split weight equally across subtasks</label>
              <button type="button" class="btn sm ghost" data-act="sopOptionAdd" data-i="${i}">${icon('branch', 14)}${t.dropdownOptions ? 'Add Path' : 'Make It A Path Choice'}</button></div></div>
          ${t.dropdownOptions ? '' : `<button type="button" class="owner glass" data-act="menu" data-menu="sopOwner" data-i="${i}">${face(t.defaultAssignee)}<span class="nm">${esc(label(t.defaultAssignee || 'Unassigned'))}</span>${icon('down', 14, 2.5)}</button>`}
          <input class="input w" type="number" min="0" step="1" value="${esc(t.weight)}" data-change="sopField" data-k="weight" data-i="${i}" aria-label="Weight %">
          <button type="button" class="mini" data-act="sopRemove" data-i="${i}" title="Remove task">${icon('trash', 16)}</button></div>`).join('')}</div>`).join('')}</section>`;
    void first;
  }
  return `${pageTitle('Edit', 'SOP', 'sope-title')}
    <p class="center-note" data-key="sope-note">Changes apply to deals deployed after you save. Deals already in the pipeline keep their own tasks. Drag the handles to reorder groups, tasks and subtasks.</p>
    <section class="card sticky-bar glass" data-key="sope-bar"><div class="seg" role="group">${names.map(n => `<button type="button" data-act="sopEditStrategy" data-v="${esc(n)}" aria-pressed="${n === cur}">${esc(n)}</button>`).join('')}</div>
      <button type="button" class="btn sm ghost" data-act="sopAddStrategy">${icon('plus', 14, 2.5)}Strategy</button>
      <span class="meter ${total === 100 ? 'ok' : 'bad'}">${esc(cur)}: ${total}%</span><span class="grow"></span>
      <button type="button" class="btn sm ghost" data-act="sopCancel">Cancel</button><button type="button" class="btn sm primary" data-act="sopSave" ${problems.length || ed.busy ? 'disabled' : ''} title="${esc(problems.join(' '))}">${ed.busy ? '<span class="spin"></span>Saving…' : 'Save SOP'}</button></section>
    <section class="card" data-key="sope-strat" style="padding:14px 18px"><div class="row"><label class="field grow"><span>Strategy Name</span><input class="input" value="${esc(cur)}" data-change="sopRenameStrategy"></label>
      <button type="button" class="btn sm ghost" data-act="sopAdd" data-what="phase">${icon('plus', 14, 2.5)}Phase</button><button type="button" class="btn sm danger" data-act="sopRemoveStrategy" ${names.length < 2 ? 'disabled' : ''}>${icon('trash', 14)}Remove Strategy</button></div>
      ${problems.length ? `<div class="note red" style="margin-top:10px">${problems.map(esc).join('<br>')}</div>` : ''}</section>
    <div class="sop-wrap" data-key="sope-body">${body || '<section class="empty"><h3>No Tasks Yet</h3><p>Add a phase to start.</p></section>'}</div>`;
}
