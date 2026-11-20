// One-time clean-up: delete the in-app notifications (the bell) created before a day, for every person.
// Run by the owner in Cloud Shell; it prints counts only (no names, deals or texts).
//
//   node scripts/clear-old-notifications.js                      count what would go (before today, Eastern)
//   node scripts/clear-old-notifications.js --before=2026-11-20  count, before that day (Eastern midnight)
//   node scripts/clear-old-notifications.js --yes [--before=…]   delete them
//
// Only notification documents are removed (artifacts/<app>/users/<uid>/notifications/<id>); people, deals,
// settings and push-device registrations are not touched. Uses firebase-admin from functions/node_modules
// (run `npm --prefix functions install` first) and the Cloud Shell's Google sign-in.
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

const args = process.argv.slice(2), yes = args.includes('--yes');
const project = (args.find(a => a.startsWith('--project=')) || '--project=dispo-ops').split('=')[1];
const day = (args.find(a => a.startsWith('--before=')) || '').split('=')[1] ||
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { console.error('Use --before=YYYY-MM-DD'); process.exit(1); }

/** Midnight Eastern at the start of `day`, in milliseconds. */
function easternMidnight(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  for (const off of [4, 5]) {                       // EDT is UTC-4, EST is UTC-5
    const ms = Date.UTC(y, m - 1, d, off), p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
    if (p === '00') return ms;
  }
  throw new Error('could not work out Eastern midnight');
}
const toMs = v => typeof v === 'number' ? v : v && typeof v.toMillis === 'function' ? v.toMillis() : null;

async function main() {
  if (!admin.apps.length) admin.initializeApp({ projectId: project });
  const db = admin.firestore(), cutoff = easternMidnight(day);
  console.log(`${yes ? 'Deleting' : 'Counting'} notifications created before ${day} 12:00 AM Eastern (project ${project}).`);
  let people = 0, old = 0, kept = 0, undated = 0, deleted = 0;
  for (const app of await db.collection('artifacts').listDocuments()) {
    for (const user of await app.collection('users').listDocuments()) {
      const snap = await user.collection('notifications').get(); if (snap.empty) continue;
      people++;
      const gone = [];
      snap.docs.forEach(d => { const at = toMs(d.get('createdAt')); if (at === null) undated++; else if (at < cutoff) gone.push(d.ref); else kept++; });
      old += gone.length;
      if (yes) for (let i = 0; i < gone.length; i += 400) { const b = db.batch(); gone.slice(i, i + 400).forEach(r => b.delete(r)); await b.commit(); deleted += Math.min(400, gone.length - i); }
    }
  }
  console.log(`People with notifications: ${people}. Before the cut-off: ${old}. From ${day} on (kept): ${kept}. Without a date (kept): ${undated}.`);
  console.log(yes ? `Deleted: ${deleted}.` : 'Nothing was deleted. Run again with --yes to delete them.');
}
main().catch(e => { console.error('Failed:', e.message); process.exit(1); });
