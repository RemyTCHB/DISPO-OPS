# Manager Guide

Everything in the User Guide, plus what Managers, Carlos and Systems look after.

## Who Can Do What

- Everyone signed in with a @totalchb.com account can do everything on a deal, as before (including closing, cancelling and reopening it). Every change is in the deal's Activity.
- **Managers** (from the Universal Team Hub) can refresh the team from the hub.
- **Carlos** and **Systems** can edit the SOP. This is enforced by the database rules, not only hidden.

## The Team

Names, photos, roles and departments come from the Universal Team Hub. Open **Team** from your photo and click **Refresh From Hub** after people change in the hub. Deals keep storing first names (Carlos, Sarah, Remy and so on) because the alerts use them; the screen shows the hub's full names. Manage people in the hub, not here.

## Editing The SOP

1. Open **SOP Reference** (the menu under your photo) and click **Edit SOP**.
2. Pick the strategy. Rename phases and groups in their headers; add a phase, a group or a task with the **+** buttons.
3. For each task set the title, the default owner, the weight, whether it needs a Draft or a Link, and its default subtasks (one per line). **Make It A Path Choice** turns a task into a choice of paths, each with its own owner.
4. Use the arrows to reorder tasks inside a group, and the bin to remove a task.
5. The badge shows the strategy's total. **Save SOP** stays off until every strategy totals exactly 100%.

Saving changes the SOP for deals deployed from then on. Deals already in the pipeline keep their own tasks. **+ Strategy** adds a new exit strategy; it then appears when deploying and in the filters.

## Removing A Deal

**Remove Asset From Pipeline** at the bottom of a deal asks for the deletion password and removes the deal for good. Prefer **Mark As Cancelled** when a deal falls through: it keeps the history.

## Alerts

- Alerts are sent by the server: new deals, completions (subtask, task, group, phase, whole deal), comments, drafts and links, Your Turn, hourly reminders, overdue due dates and the 10 AM briefing. Each person chooses theirs in Notification Settings.
- Closed and Cancelled deals send nothing. Reopening a deal turns its alerts back on.

## The Universal Team Hub Sync

DISPO OPS can send each deal to the hub as "DISPO - <address>" in Carlos's list, with the overall % and one subtask per phase. It is built but **switched off** until the owner decides what moves. Nothing comes back from the hub.

## If Something Goes Wrong

- **Not Saved**: someone's change could not reach the database (often the connection). Clicking the badge retries.
- Sign-in says the domain is not authorized: the website's address has to be added in Firebase Authentication, Authorized Domains.
- After an update, a hard reload (Ctrl+Shift+R) loads the new version.
