// The Cloud Functions' new rules (functions/lib.js), on made-up deals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
const F = createRequire(import.meta.url)('../../functions/lib.js');

const deal = (extra = {}) => ({ id: 'prop_1', address: '1 Test St', exitStrategy: 'Wholesale', tasks: [
  { id: 'a', phase: 'Phase I: X', mainTask: 'G', title: 'A', weight: 40, assignee: 'Carlos', completed: true, subtasks: [] },
  { id: 'b', phase: 'Phase I: X', mainTask: 'G', title: 'B', weight: 10, assignee: 'Sarah', completed: false, due: 1000, subtasks: [{ id: 's1', title: 'S1', completed: false, due: 500 }, { id: 's2', title: 'S2', completed: true, due: 400 }] },
  { id: 'c', phase: 'Phase II: Y', mainTask: 'H', title: 'C', weight: 50, assignee: 'Moe', completed: false, isSOW: true, subtasks: [{ id: 'x', title: 'X', completed: true }, { id: 'y', title: 'Y', completed: false }] }], ...extra });

test('closed and cancelled deals are recognised; open deals and old deals without status are not', () => {
  assert.equal(F.isClosed({ status: 'closed' }), true); assert.equal(F.isClosed({ status: 'cancelled' }), true);
  assert.equal(F.isClosed({}), false); assert.equal(F.isClosed(null), false);
});

test('overdue items: open tasks and subtasks past due, owned by the task owner; none on closed deals', () => {
  const items = F.overdueItems(deal(), 2000);
  assert.deepEqual(items.map(i => [i.key, i.owner]), [['b', 'Sarah'], ['b/s1', 'Sarah']]);
  assert.deepEqual(F.overdueItems(deal(), 700).map(i => i.key), ['b/s1']);
  assert.deepEqual(F.overdueItems(deal({ status: 'closed' }), 2000), []);
});

test('overdue cadence: once when due, then on the interval, again from scratch when the date moves', () => {
  const item = { due: 1000 }, h = 3600e3;
  assert.equal(F.overdueDue(null, item, 2000, 4), true);
  assert.equal(F.overdueDue({ due: 1000, at: 2000 }, item, 2000 + 3 * h, 4), false);
  assert.equal(F.overdueDue({ due: 1000, at: 2000 }, item, 2000 + 4 * h, 4), true);
  assert.equal(F.overdueDue({ due: 999, at: 2000 }, item, 2001, 4), true);
});

test('team from the hub: emails lower-cased, roles and departments checked, only https photos', () => {
  const d = F.directoryFrom({ people: [{ name: 'A Test', email: 'A@totalchb.com', role: 'manager', dept: '', photo: 'https://x/y.jpg' },
    { name: 'B Test', email: 'b@totalchb.com', role: 'lead', dept: 'DISPO', photo: 'javascript:alert(1)' }, { email: 'bad' }] }, 5, 'Remy');
  assert.deepEqual(Object.keys(d.people), ['a@totalchb.com', 'b@totalchb.com']);
  assert.deepEqual(d.managers, ['a@totalchb.com']); assert.equal(d.people['b@totalchb.com'].photo, ''); assert.equal(d.people['b@totalchb.com'].dept, 'DISPO');
});

test('signature matches the hub (HMAC-SHA256 of "<seconds>.<body>")', () => {
  const h = F.sign('s3cret-for-tests', '{"a":1}', 1700000000);
  assert.equal(h['X-Hub-Signature'], 'sha256=' + crypto.createHmac('sha256', 's3cret-for-tests').update('1700000000.{"a":1}').digest('hex'));
});

test('hub payload: overall %, one entry per phase with its % and next step, no chat or drafts', () => {
  const p = F.hubPayload('prop_1', { ...deal(), comments: [{ text: 'private' }] }, 'https://dispo-ops.totalchb.com');
  assert.equal(p.deal.percent, 65); assert.equal(p.deal.status, 'open'); assert.equal(p.deal.url, 'https://dispo-ops.totalchb.com/?deal=prop_1');
  assert.deepEqual(p.phases.map(x => [x.phase, x.percent, x.complete]), [['Phase I: X', 80, false], ['Phase II: Y', 50, false]]);
  assert.deepEqual(p.phases[0].next, { title: 'S1', task: 'B', owner: 'Sarah' });
  assert.ok(!JSON.stringify(p).includes('private'));
  assert.deepEqual(F.hubPayload('prop_9', null, 'x'), { deal: { id: 'prop_9', removed: true } });
  assert.equal(F.hubPayload('prop_1', deal({ status: 'cancelled' }), 'x').deal.status, 'cancelled');
});
