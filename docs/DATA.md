# DISPO OPS data contract

Firebase project `dispo-ops`. Every path starts with `artifacts/tchb-dispo-ops/`.
These shapes are frozen. The 2026-11 revamp added only the optional fields marked **new**. Older deals without them
work exactly as before.

`tests/compare.mjs` checks this. It runs the same actions on the pre-revamp page and the current page, then compares
every saved field name and type.

## `public/data/properties/{propId}`: one document per deal

- **Read by:** everyone signed in (live), and the Cloud Functions.
- **Written by:** the page, each change in a transaction on the latest copy.

| Field | Type |
| --- | --- |
| `id` | `prop_<ms><random>` (same as the document id) |
| `address` | string |
| `exitStrategy` | strategy name (`Wholesale`, `Novation`, `Fix & Flip`, `Creative` or one added in the SOP editor); missing = Wholesale |
| `dateStarted`, `dateLastEdited` | ms since epoch (ticks and pins don't change `dateLastEdited`, as before) |
| `lastEditedBy`, `lastEditedByName` | uid, email prefix |
| `comments[]` | `{ id: 'cmt_…', text, author (email prefix), timestamp, pinned }` |
| `readBy` | `{ <email prefix, lower case>: ms }` |
| `tasks[]` | see below |
| **new** `status`, `statusAt`, `statusBy` | `'closed'` or `'cancelled'`, when, who (display name); missing = Open |
| **new** `due`, `dueSet` | the deal's due date (ms) and when it was set |
| **new** `notes[]` | `{ id, text, by (display name), at }` |
| **new** `files[]` | `{ id, kind: 'file' \| 'link', name, url, path?, size?, type?, by, at }` |
| **new** `log[]` | activity: `{ at, by, ev, tid?, sid?, title?, … }`, last 300 kept |

**`tasks[]`:**

- **Stored before the revamp:**
  - `id`;
  - `phase`, `mainTask`, `title`, `weight`;
  - `assignee`: the stored first name, matched by the Cloud Functions to email prefixes (`Sarah` = sara@, `Remy` = systems@);
  - `completed`, `subtasks[]`;
  - `templateText`, `templateLastEditedBy`, `templateLastEditedAt`, `hyperlink`;
  - `requiresDraft`, `requiresLink`;
  - `isDropdown`, `dropdownOptions`, `selectedOption`;
  - `isSOW`;
  - `isCustom`, `borrowedWeight`, `deductionsHistory`, `borrowedFromId`.
- **New:** `due`, `dueSet`, `notes[]`, `files[]`, `startedAt`, `doneAt`.

**`subtasks[]`:**

- **Stored before the revamp:**
  - `id`, `title`, `completed`, `isDefault`;
  - `requiresDraft`, `requiresLink`;
  - `hyperlink`, `templateText`, `templateLastEditedBy`, `templateLastEditedAt`.
- **New:**
  - `status`: `'todo'`, `'progress'` or `'done'`. `completed` stays the truth;
  - `createdAt`, `startedAt`, `doneAt`;
  - `due`, `dueSet`, `notes[]`, `files[]`.

The page has always applied a fix-up to every deal it reads: it drops task `p3_7` and adds "Boost the Post (If
Needed)" to task `p3_6`. That fix-up is kept unchanged (`legacyFix` in `js/logic.js`).

## Other documents

| Path | Fields | Written by |
| --- | --- | --- |
| `public/data/active_users/{uid}` | `email`, `sessions: { <deviceId>: { lastActive, type: 'Mobile' \| 'Desktop' } }` | the page, every minute |
| `public/data/user_preferences/{uid}` | `email`, `comments`, `new_assets`, `completions_phase`, `completions_task`, `completions_subtask`, `drafts_links`, `task_turns`, `daily_brief`, `reminders`, `reminder_interval` (`'2'`/`'4'`/`'8'`/`'24'`), `updatedAt`, `fcmTokens[]` | the page; read by the Cloud Functions |
| `users/{uid}/notifications/{id}` | `id`, `title`, `body`, `read`, `createdAt`, `extraData: { action, propId, commentId? }` | the Cloud Functions; the page marks read and deletes |
| **new** `public/data/settings/sop` | `strategies: [{ name, order, tasks: [<blueprint task>] }]`, `version`, `updatedAt`, `updatedBy` | Carlos@ and Systems@ only (rules) |
| **new** `public/data/settings/directory` | `people: { <email>: { name, role, dept, photo, order } }`, `managers[]`, `copiedAt`, `copiedBy` | the `refreshDirectory` function only |
| **new** `server/overdue-{propId}` | when each overdue alert was last sent | the Cloud Functions only |
| **new** `server/hubsync-{propId}` | what was last sent to the hub | the Cloud Functions only |

A blueprint task is `{ id, phase, mainTask, title, weight, defaultAssignee?, draftsAndHyperlinks?: ['Draft', 'Hyperlink'],
dropdownOptions?: [{ title, defaultAssignee }], defaultSubtasks?: [title] }`. This is the same shape as the built-in SOP
in `js/sop-default.js`.

## Elsewhere

- **Storage (new):** `files/{propId}/{fileId}-{name}`, at most 25 MB each.
- **Browser storage:**
  - `tchb_device_id`: as before;
  - **new** `tchb_theme`, `tchb_dash_view`, `tchb_clock` (the server clock's offset);
  - the Firestore offline cache (IndexedDB).
- **Links:** `/` and `/index.html` as before. **New:** `/?deal=<propId>` opens a deal (used by the hub's link back).
- **Push:** `/firebase-messaging-sw.js` (unchanged).
