# Going live and rolling back

The revamp has four parts that go live in this order. Each step works with the page that is live at that moment, so the
order is safe and every step can be undone on its own. No step touches the deals themselves.

Run the commands from a checkout of this repository on the `main` branch, after the merge, on a computer that is signed
in to Firebase (`firebase login`) with access to the `dispo-ops` project. Never paste secret values into chat, code or
commits.

## Before you start (once)

1. **Turn on Firebase Storage** (only needed for file uploads): Firebase console, project dispo-ops, Storage, Get
   Started. Keep the bucket `dispo-ops.firebasestorage.app`.
2. **Create the hub connection secret**, a long random value that you keep to yourself:
   - in DISPO OPS: `firebase functions:secrets:set HUB_SYNC_SECRET` (paste the value when asked);
   - in the hub: Vercel, project of hub.totalchb.com, Settings, Environment Variables, add `DISPO_OPS_SECRET`
     with the same value (Production), then redeploy the hub.

   Refresh From Hub needs this. The deal sync also uses it, but stays switched off.

## Steps

### 1. Security rules

```bash
firebase deploy --only firestore:rules,storage --project dispo-ops
```

Same access as before for everything the page already uses. New: only Carlos@ and Systems@ can change the SOP, the
team copy is written by the server only, and files are company accounts only, 25 MB each.

### 2. Cloud Functions

```bash
cd functions && npm ci && cd .. && firebase deploy --only functions --project dispo-ops
```

What changes:
- Closed and Cancelled deals send no alerts.
- Overdue due-date alerts are added.
- `refreshDirectory` is added (Refresh From Hub).
- `hubSyncDaily` is added (does nothing while `HUB_SYNC_ENABLED=false` in `functions/.env`).

Alert texts are unchanged.

### 3. The hub endpoint

Merge the hub's `claude/dispo-ops-sync` branch (adds `/api/dispo-ops`; the team list accepts DISPO OPS's secret).
Vercel redeploys the hub.

### 4. The page

Merge `claude/new-session-s3sx1y` into `main`. Vercel redeploys dispo-ops.totalchb.com in about a minute. Then:

- Everyone does a hard reload (Ctrl+Shift+R, or Cmd+Shift+R on a Mac).
- A Manager opens Team (account menu) and clicks **Refresh From Hub** once.

## Rolling back

| Part | How | Data cleanup |
| --- | --- | --- |
| Page | Revert the merge commit on `main` (one revert); Vercel redeploys the old page | None. The old page ignores the new optional fields and keeps them when it saves. |
| Cloud Functions | Check out the commit before the revamp, then `firebase deploy --only functions` | None. |
| Rules | Paste the old rules (`git show 853a1c8:firebase/firestore.rules`) in the console, or deploy them from that commit | None. |
| Hub endpoint | Revert its merge in the hub | None. Hub tasks it made stay as ordinary tasks. |

## Turning the hub sync on later

1. Decide what moves (see the hub README, DISPO OPS section).
2. Set `HUB_SYNC_ENABLED=true` in `functions/.env`.
3. Run `firebase deploy --only functions`.

The sync only ever creates and updates hub tasks; nothing comes back.
