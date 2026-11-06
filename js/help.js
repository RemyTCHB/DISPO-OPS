// Help: the User Guide (everyone) and the Manager Guide (Managers, Carlos and Systems). Plain language, made-up
// examples only. Keep in step with docs/USER-GUIDE.md and docs/MANAGER-GUIDE.md.
import { S, isManager, canEditSop } from './state.js';
import { pageTitle } from './views.js';

const USER = `
<h2>User Guide</h2>
<p>DISPO OPS tracks every property in the dispositions pipeline as a checklist (the SOP for its exit strategy). Every change shows for the whole team straight away.</p>

<h3>Signing In</h3>
<p>Click <b>Sign In With Google</b> and use your @totalchb.com account. Other accounts are refused.</p>

<h3>The Top Of Every Screen</h3>
<ul>
  <li><b>Light / Dark</b> switches the look; your choice is remembered on that device.</li>
  <li><b>Active</b> shows who is online now, on phone or desktop.</li>
  <li>The two tabs: <b>Master Dashboard</b> and <b>Active Deal Tracker</b>. <b>SOP Reference</b> is in the menu under your photo. On a phone the two tabs are in the bar at the bottom, with <b>Chat</b>, and SOP Reference is in the photo menu too.</li>
  <li>The bell opens your <b>Notifications</b>; your photo opens <b>Notification Settings</b>, <b>Team</b>, <b>Help</b> and <b>Sign Out</b>.</li>
  <li>Under the title, the badge says <b>Live</b> when everything is saved, <b>Saving…</b> while a change is on its way, and <b>Not Saved · Retry</b> if a change could not be saved (click it to try again). The clock is Eastern time.</li>
</ul>

<h3>Master Dashboard</h3>
<ul>
  <li>Deals are <b>Open</b> by default. Use <b>Closed</b> and <b>Cancelled</b> to see finished or dropped deals.</li>
  <li>Filter by exit strategy and sort by Recently Edited, Oldest Edited, Newest Added, Oldest Added or <b>Due Soonest</b>.</li>
  <li>Each row shows the address, strategy, when it started, how long since the last edit, the <b>Next Agent</b>, the <b>Next Step</b>, the due date and the % complete.</li>
  <li>Click a row to open the deal. Click the <b>Next Step</b> to jump straight to that task.</li>
  <li><b>Deploy New Asset Tracker</b> starts a new deal: type the address, pick the exit strategy and, for Fix &amp; Flip, optionally attach a SOW CSV (Task, Cost, Notes): each row becomes a subtask of Create SOW.</li>
</ul>

<h3>The Deal Tracker</h3>
<ul>
  <li><b>Back To Master Dashboard</b> returns to the list. The arrows go to the <b>Previous</b> and <b>Next</b> deal in the order and filter the dashboard is showing (for example "3 of 18").</li>
  <li>The header shows the address, strategy, status, when it was created and last updated, and the <b>Total Progress</b> with the next step.</li>
  <li><b>Set Due Date</b> gives the whole deal a due date (for example the target closing). <b>Next Due</b> shows the earliest open task or subtask due date; click it to jump there. Anything overdue turns red.</li>
  <li><b>Notes</b>, <b>Files &amp; Links</b> and <b>Activity</b> in the header gather everything on the deal: every note and draft, every link and file, and every change with who made it and when, each tagged with its task.</li>
  <li><b>All Agents</b> shows one person's tasks only.</li>
</ul>

<h3>Working The Checklist</h3>
<p>The checklist is grouped by phase, then by group (for example Underwriting). A group shows its % and <b>Complete</b> or <b>Pending</b>; finished groups fold away by themselves. Click a group to open or close it.</p>
<ul>
  <li><b>Tick the box</b> on a task to mark it done. The <b>+%</b> pill is how much the task counts toward the deal's progress.</li>
  <li>Click the <b>owner</b> to give the task to someone else. People are grouped by department, as in the Universal Team Hub.</li>
  <li>Some steps ask you to <b>Select Path For This Step</b> first (for example Local or Non-Local Contractor): the path sets the title and the owner. <b>Edit Path</b> lets you choose again.</li>
  <li><b>Add Subtask</b> adds your own item under a task. Each subtask is <b>Not Started</b>, <b>In Progress</b> or <b>Done</b>; when every subtask is Done, the task is done. The pencil edits a subtask; <b>Remove</b> asks you to type Confirm.</li>
  <li>Message drafts and links go in <b>Details</b>: write them as a <b>Note</b>, add links under <b>Files</b>. Drafts and links saved before are still listed there, with <b>Copy</b> and <b>Open</b>, and can be removed.</li>
  <li>The small icons on every task and subtask: <b>Notes</b> (who wrote each and when; on a task, switch on <b>Include Subtask Notes</b> to see its subtasks' notes too), <b>Files &amp; Links</b> (Upload Files, up to 25 MB each, or Add Link), the <b>calendar</b> (due date and time, Eastern, 9:00 AM unless you change it) and <b>Activity</b>.</li>
</ul>

<h3>Inject Custom Task</h3>
<p>Adds a task that only this deal needs. Choose the phase, an existing group or a new one (and where it goes), the title, the owner and, if it should count toward progress, a weight. A weight has to be taken from other tasks so the deal still totals 100%: add the tasks to borrow from until the badge says <b>100% Balanced</b>. Tick <b>Split this task's weight equally across its subtasks</b> to have each of its subtasks count for an equal share of its weight (as a CSV SOW task does). Deleting a custom task gives its weight back.</p>

<h3>Closing Or Cancelling A Deal</h3>
<p>Use <b>Status</b> in the deal header: <b>Mark As Closed</b> or <b>Mark As Cancelled</b>. The deal moves to that view on the dashboard, its checklist becomes read-only (chat stays open) and it stops sending alerts. <b>Reopen</b> brings it back to Open.</p>

<h3>Chat</h3>
<p>The round button (or <b>Chat</b> on a phone) opens the discussions. Without a deal open you see every deal's chat with its unread count. In a deal's chat you can pin messages, search, see <b>Pinned Messages</b>, and open <b>Links &amp; Attachments</b> (every link and draft on the deal, with Copy). "Read by" shows who has seen a message.</p>

<h3>Notifications</h3>
<ul>
  <li>The bell lists your alerts; click one to open the deal (or the chat message). Select several to mark them read or delete them.</li>
  <li><b>Notification Settings</b>: <b>Enable Push On This Device</b> for phone and desktop alerts, choose which alerts you get, and how often <b>Overdue Reminders</b> repeat. Overdue Reminders cover tasks waiting on you and due dates that have passed: you get one when a due date passes, then one on your interval until it is done.</li>
  <li><b>Wipe Devices</b> stops push on devices you no longer use; <b>Defaults</b> restores the standard settings for your role.</li>
</ul>

<h3>If Something Looks Wrong</h3>
<p>If the badge says <b>Not Saved</b>, click it to try again. After an update, reload the page with <b>Ctrl+Shift+R</b> (Cmd+Shift+R on a Mac).</p>`;

const MANAGER = `
<h2>Manager Guide</h2>
<p>Everything in the User Guide, plus what Managers, Carlos and Systems look after.</p>

<h3>Who Can Do What</h3>
<ul>
  <li>Everyone signed in with a @totalchb.com account can do everything on a deal, as before (including closing, cancelling and reopening it). Every change is in the deal's Activity.</li>
  <li><b>Managers</b> (from the Universal Team Hub) can refresh the team from the hub.</li>
  <li><b>Carlos</b> and <b>Systems</b> can edit the SOP. This is enforced by the database rules, not only hidden.</li>
</ul>

<h3>The Team</h3>
<p>Names, photos, roles and departments come from the Universal Team Hub. Open <b>Team</b> from your photo and click <b>Refresh From Hub</b> after people change in the hub. Deals keep storing first names (Carlos, Sarah, Remy and so on) because the alerts use them; the screen shows the hub's full names. Manage people in the hub, not here.</p>

<h3>Editing The SOP</h3>
<ol>
  <li>Open <b>SOP Reference</b> (the menu under your photo) and click <b>Edit SOP</b>.</li>
  <li>Pick the strategy. Rename phases and groups in their headers; add a phase, a group or a task with the <b>+</b> buttons.</li>
  <li>For each task set the title, the default owner, the weight and its default subtasks (<b>+ Subtask</b>). Tick <b>Split weight equally across subtasks</b> to have each subtask on a deal (the default ones and any added later) count for an equal share of the task's weight, as a CSV SOW task does. <b>Make It A Path Choice</b> turns a task into a choice of paths, each with its own owner.</li>
  <li>Drag the handles to reorder groups inside a phase, tasks inside a group and subtasks inside a task. The bin removes a task.</li>
  <li>The badge shows the strategy's total. <b>Save SOP</b> stays off until every strategy totals exactly 100%.</li>
</ol>
<p>Saving changes the SOP for deals deployed from then on. Deals already in the pipeline keep their own tasks. <b>+ Strategy</b> adds a new exit strategy; it then appears when deploying and in the filters.</p>

<h3>Removing A Deal</h3>
<p><b>Remove Asset From Pipeline</b> at the bottom of a deal asks for the deletion password and removes the deal for good. Prefer <b>Mark As Cancelled</b> when a deal falls through: it keeps the history.</p>

<h3>Alerts</h3>
<ul>
  <li>Alerts are sent by the server: new deals, completions (subtask, task, group, phase, whole deal), comments, drafts and links, Your Turn, hourly reminders, overdue due dates and the 10 AM briefing. Each person chooses theirs in Notification Settings.</li>
  <li>Closed and Cancelled deals send nothing. Reopening a deal turns its alerts back on.</li>
</ul>

<h3>The Universal Team Hub Sync</h3>
<p>DISPO OPS can send each deal to the hub as "DISPO - &lt;address&gt;" in Carlos's list, with the overall % and one subtask per phase. It is built but <b>switched off</b> until the owner decides what moves. Nothing comes back from the hub.</p>

<h3>If Something Goes Wrong</h3>
<ul>
  <li><b>Not Saved</b>: someone's change could not reach the database (often the connection). Clicking the badge retries.</li>
  <li>Sign-in says the domain is not authorized: the website's address has to be added in Firebase Authentication, Authorized Domains.</li>
  <li>After an update, a hard reload (Ctrl+Shift+R) loads the new version.</li>
</ul>`;

export function helpPage() {
  const mgr = isManager() || canEditSop(), part = mgr ? S.helpPart : 'user';
  return `${pageTitle('Help', '&amp; Guides', 'help-title')}
    ${mgr ? `<section class="toolbar" data-key="help-tabs-${part}"><div class="seg" role="group"><button type="button" data-act="helpPart" data-v="user" aria-pressed="${part === 'user'}">User Guide</button><button type="button" data-act="helpPart" data-v="manager" aria-pressed="${part === 'manager'}">Manager Guide</button></div></section>` : ''}
    <section class="help" data-key="help-${part}"><div class="card">${part === 'manager' ? MANAGER : USER}</div></section>`;
}
export const GUIDES = { USER, MANAGER };
