# Turning On the DISPO OPS → Hub Sync

The code is live on both sides (DISPO OPS `main` and the hub's `main`). The sync starts working once the DISPO OPS
Cloud Functions are deployed. Until then nothing is sent and nothing in the hub changes.

## What it does

- Every open deal becomes **DISPO OPS - &lt;address&gt;** in Carlos's list in the hub (Team › DISPO), tagged
  *Added by DISPO OPS*, with an **Open** link back to the deal. The ring shows the deal's overall % in DISPO OPS.
- One subtask per phase, on two lines: `Phase I: Deal Intake · 60%` then `Working On: TC Prep › Next: Confirming Access`
  (`Starts With:` before the phase has begun, `Complete` at 100%). The phase's owner is the owner of that task in
  DISPO OPS. Status: Not Started, In Progress, Done at 100%.
- Closed in DISPO OPS = the task and every phase Done. Cancelled = Cancelled in the hub. Reopened = open again.
- The hub is a mirror: anything changed on these tasks in the hub is put back at the next sync, and a deleted task is
  made again. Subtasks people add in the hub are left alone. Closed or cancelled deals that were never sent get no task.
- It sends right after each change that moves a deal's progress, plus a full catch-up every day at 7:15 AM Eastern.

## Steps (about 10 minutes)

### 1. Check both sites deployed

- Vercel, DISPO OPS project: the top deployment is `20526bd` and **Ready**.
- Vercel, HUB project: the top deployment is `84e44eb` and **Ready**.

### 2. Check the shared secret

The sync uses the same secret as the **Refresh From Hub** button, so this is a quick test:
open DISPO OPS → your photo → **Team Members** → **Refresh From Hub**.

- It works (names update): the secret is right. Go to step 3.
- It fails: the two copies differ. Pick a new long random value and put it in **both** places:
  1. Google Cloud console, project **dispo-ops** → **Security › Secret Manager** → `HUB_SYNC_SECRET` →
     **+ New Version** → paste the value → **Add New Version**.
  2. Vercel → **HUB** project → **Settings › Environment Variables** → `DISPO_OPS_SECRET` → **Edit** → paste the same
     value → **Save**, then **Deployments** → top deployment → **⋯ › Redeploy**.

  Never paste the value into a chat, a commit or a document.

### 3. Deploy the Cloud Functions

Google Cloud console, project **dispo-ops** → **Activate Cloud Shell** (`>_`, top right). Run each line:

```bash
cd ~/DISPO-OPS && git checkout main && git pull
```
(If it says `No such file or directory`: `git clone https://github.com/RemyTCHB/DISPO-OPS.git`, then the line above.)

```bash
npm --prefix functions install
```

```bash
firebase deploy --only functions --project dispo-ops
```

- If it asks to give the functions access to the secret `HUB_SYNC_SECRET`, answer **Y**.
- If it asks you to sign in: `firebase login --no-localhost`, open the link, approve, paste the code back (in the
  terminal only), then run the deploy again.
- Wait for **Deploy complete!**

### 4. Send the open deals now

Google Cloud console → **Cloud Scheduler** → the job named **firebase-schedule-hubSyncDaily-us-central1** → **⋮ › Force run**.
(Skip this and they arrive by 7:15 AM Eastern the next day. New deals and changes are sent straight away either way.)

### 5. Check it worked

- Hub → **Team › DISPO** → Carlos's list: a **DISPO OPS - &lt;address&gt;** task for each open deal.
- Firebase console → **Functions › Logs**: `hubSyncDaily: N deals, sent X, failed 0`.

## If something is wrong

| Log says | Meaning | Fix |
| --- | --- | --- |
| `hub sync failed: hub answered 401` | the two secrets differ | step 2 (new value in both places) |
| `hub sync failed: hub answered 503` | the hub has no `DISPO_OPS_SECRET` | add it in Vercel (step 2.2) and redeploy the hub |
| `hub sync failed: hub answered 500` | the hub could not save | check the hub's Vercel logs; the daily run tries again |
| nothing at all | the functions were not deployed | step 3 |

## Switching it off

Set `HUB_SYNC_ENABLED=false` in `functions/.env` and redeploy the functions (step 3). Hub tasks already made stay as
they are.
