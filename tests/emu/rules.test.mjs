// Security rules on the emulator (made-up accounts). Every path DISPO OPS used before keeps the same access; the new
// documents are locked down as approved (plan, section E).
//   firebase emulators:exec --only firestore,storage "node --test tests/emu/"
import test, { before, after } from 'node:test';
import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';

let env;
const P = 'artifacts/tchb-dispo-ops/public/data';
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dispo-ops',
    firestore: { rules: fs.readFileSync(new URL('../../firebase/firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: fs.readFileSync(new URL('../../firebase/storage.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 9199 } });
});
after(async () => { await env.clearFirestore(); await env.cleanup(); });
const as = (email, verified = true) => env.authenticatedContext('u-' + email.split('@')[0], { email, email_verified: verified }).firestore();
const doc = (db, p) => db.doc(p);

test('company accounts read and write deals, presence, preferences and notifications, as before', async () => {
  const db = as('moe@totalchb.com');
  for (const p of [`${P}/properties/prop_1`, `${P}/active_users/u-moe`, `${P}/user_preferences/u-moe`, 'artifacts/tchb-dispo-ops/users/u-moe/notifications/n1']) {
    await assertSucceeds(doc(db, p).set({ x: 1 })); await assertSucceeds(doc(db, p).get()); await assertSucceeds(doc(db, p).delete());
  }
  await assertSucceeds(doc(db, 'artifacts/tchb-dispo-ops/users/u-other/notifications/n1').set({ x: 1 }));   // unchanged: not narrowed
});

test('other domains, unverified and signed-out visitors get nothing', async () => {
  for (const db of [as('someone@gmail.com'), as('moe@totalchb.com', false), env.unauthenticatedContext().firestore(), as('crm@kpidriver.com')]) {
    await assertFails(doc(db, `${P}/properties/prop_1`).get());
    await assertFails(doc(db, `${P}/properties/prop_1`).set({ x: 1 }));
  }
});

test('only Carlos and Systems can change the SOP; everyone can read it', async () => {
  await assertSucceeds(doc(as('carlos@totalchb.com'), `${P}/settings/sop`).set({ strategies: [] }));
  await assertSucceeds(doc(as('SYSTEMS@totalchb.com'), `${P}/settings/sop`).set({ strategies: [] }));
  await assertFails(doc(as('moe@totalchb.com'), `${P}/settings/sop`).set({ strategies: [] }));
  await assertFails(doc(as('brandy@totalchb.com'), `${P}/settings/sop`).delete());
  await assertSucceeds(doc(as('moe@totalchb.com'), `${P}/settings/sop`).get());
});

test('the team copy is written by the server only; server bookkeeping is closed to the page', async () => {
  await assertSucceeds(doc(as('moe@totalchb.com'), `${P}/settings/directory`).get());
  await assertFails(doc(as('systems@totalchb.com'), `${P}/settings/directory`).set({ people: {} }));
  await assertFails(doc(as('systems@totalchb.com'), 'artifacts/tchb-dispo-ops/server/overdue-prop_1').get());
  await assertFails(doc(as('systems@totalchb.com'), 'artifacts/tchb-dispo-ops/server/hubsync-prop_1').set({ x: 1 }));
});

test('files: company accounts up to 25 MB, only under files/<deal>/', async () => {
  const st = email => env.authenticatedContext('u-' + email.split('@')[0], { email, email_verified: true }).storage();
  const s = st('moe@totalchb.com');
  await assertSucceeds(s.ref('files/prop_1/f1-test.txt').put(new Uint8Array([1, 2, 3]), { contentType: 'text/plain' }));
  await assertSucceeds(s.ref('files/prop_1/f1-test.txt').getDownloadURL());
  await assertFails(s.ref('other/f.txt').put(new Uint8Array([1])));
  await assertFails(st('x@gmail.com').ref('files/prop_1/f2.txt').put(new Uint8Array([1])));
  await assertSucceeds(s.ref('files/prop_1/f1-test.txt').delete());
});
