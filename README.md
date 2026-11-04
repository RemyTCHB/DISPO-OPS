<p align="center"><img src="assets/logo-full.png" alt="Total Cash Home Buyers" height="64"></p>

<h1 align="center">DISPO OPS</h1>

<p align="center"><strong>The dispositions pipeline for Total Cash Home Buyers: every property as a live, weighted SOP checklist.</strong></p>

<p align="center">Live at <b>dispo-ops.totalchb.com</b> · Universal Team Hub design · Internal use only</p>

---

## What It Does

- **Master Dashboard:** every deal with its strategy, start date, last edit, Next Agent, Next Step, due date and %.
  - Open, Closed and Cancelled views, strategy filter and sorting.
- **Deploy:** a new deal gets the SOP for its exit strategy (Wholesale, Novation, Fix & Flip, Creative, or any
  strategy added in the SOP editor). A Fix & Flip SOW CSV becomes subtasks.
- **Deal tracker:** phases, groups and weighted tasks, as in the hub's task cards.
  - Each task and subtask has an owner, a status (Not Started / In Progress / Done), a due date (Eastern time), notes,
    files and links, drafts, and an activity history.
  - Inject Custom Task borrows weight so a deal always totals 100%.
  - Previous and Next move through the deals in the dashboard's current view.
- **Closed and Cancelled:** a deal can be marked Closed or Cancelled. It becomes read-only and stops sending alerts
  until it is reopened.
- **Chat** per deal with pins, search, read receipts, and every link and draft in one place.
- **Alerts** (Cloud Functions): new deals, completions, comments, drafts and links, Your Turn, reminders, overdue due
  dates and the 10 AM briefing, by push and in the Notifications list. Each person chooses theirs.
- **Team** copied from the Universal Team Hub (names, photos, roles, departments). Carlos and Systems edit the SOP.
- **Light and dark**, phone-ready, live for everyone without reloading. Saving shows Live / Saving… / Not Saved with
  Retry, and nobody's change overwrites anyone else's.

User and Manager Guides are inside the app (account menu, Help & Guides).

## Repository

```
index.html, styles.css, js/   The page (static; js/app.js starts it). Hosted on Vercel; every push to main deploys.
assets/                       TCHB logos
firebase-messaging-sw.js      Push notifications (must stay at the site root)
functions/                    Cloud Functions (Firebase project dispo-ops), deployed with the Firebase CLI
firebase/                     Firestore and Storage security rules
docs/DATA.md                  The data contract (paths and fields; what may never change)
docs/GO-LIVE.md               How a release goes live and how to roll it back
tests/                        Checks with made-up data against the Firebase emulators (never the real project)
```

## Working On It

The page has no build step: edit `index.html`, `styles.css` or `js/`.

- `js/logic.js` holds every calculation and every change to a deal, as plain functions.
- `js/store.js` talks to Firebase.
- The screens are in `js/views.js`, `js/views2.js`, `js/sopview.js` and `js/help.js`.

Checks (Node 20+, Java for the emulators):

```bash
cd tests && npm ci && cd ..
```

```bash
node --test tests/unit/*.test.mjs
```

```bash
tests/node_modules/.bin/firebase emulators:exec --project demo-dispo-ops "node --test tests/emu/*.test.mjs && node tests/e2e.mjs && node tests/scenario.mjs new && node tests/compare.mjs"
```

```bash
tests/node_modules/.bin/firebase emulators:exec --project demo-dispo-ops --only firestore,auth "node tests/look.mjs"
```

What each one does:
- `tests/unit`: the calculations, compared with the pre-revamp page's own code on many made-up deals, and the Cloud
  Functions' rules.
- `tests/emu`: the security rules.
- `tests/e2e.mjs`: every action through the real buttons, as several made-up people, with the Cloud Functions running.
- `tests/compare.mjs`: what the page saves, field by field, against the pre-revamp page.
- `tests/look.mjs`: screenshots in light and dark, desktop and phone.

For the functions emulator, put `HUB_URL=http://127.0.0.1:5399` and `APP_URL=http://127.0.0.1:5330` in
`functions/.env.local`, and `HUB_SYNC_SECRET=test-only-secret` in `functions/.secret.local`. Both files are git-ignored.

**Privacy.** This repository is public. Real deals, addresses, people and amounts never go into code, tests, commits
or logs. Tests use made-up data, and the Cloud Functions log counts only. Secrets live in Firebase (Secret Manager)
and Vercel settings, never in the code.

## Security

- Google sign-in with company accounts only (@totalchb.com, verified).
- The Firestore and Storage rules in `firebase/` enforce this on the server.
- Only Carlos and Systems can change the SOP.
- Only the server writes the team copy.

## Connected Apps

- **Universal Team Hub** (hub.totalchb.com). DISPO OPS asks the hub's signed team endpoint for every department when a
  Manager clicks Refresh From Hub.
- **Hub deal sync** (one way, built, switched off). It sends each deal as "DISPO - &lt;address&gt;" to the hub's
  `/api/dispo-ops`. To turn it on, set `HUB_SYNC_ENABLED=true` in `functions/.env` and redeploy the functions.
- Both use the shared secret `HUB_SYNC_SECRET` (Firebase secret). The hub has the same value as `DISPO_OPS_SYNC_SECRET`.

---

<p align="center"><sub>© Total Cash Home Buyers. Internal use only.</sub></p>
