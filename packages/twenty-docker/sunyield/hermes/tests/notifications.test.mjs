import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/ledger.mjs';
import { Dispatcher, observe } from '../src/dispatcher.mjs';
import { normalizePhone, formatLead } from '../src/policy.mjs';
const lead = {
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: '2026-11-04T00:00:01Z',
  assignedSalespersonId: 'sales-a',
  assignmentState: 'ASSIGNED',
  assignedAt: '2026-11-04T00:00:02Z',
  name: 'Sample',
  phone: '60111111111',
  area: 'Area',
  bill: 'RM 500–700',
  source: 'FACEBOOK',
  recipient: '+60123456789',
  salespersonName: 'A',
  workspaceMemberId: 'member',
  mappingCount: 1,
  deletedAt: null,
};
const fixture = () => {
  const ledger = new Ledger(':memory:');
  ledger.activate('2026-11-04T00:00:00Z');
  let current = { ...lead },
    calls = 0;
  const bridge = {
    health: async () => ({ connected: true, sender: '+60199999999' }),
    send: async () => {
      calls++;
      return 'message-1';
    },
    receipts: async () => [],
  };
  const reader = { recipientsConfigured: true, get: async () => current };
  const dispatcher = new Dispatcher({
    ledger,
    reader,
    bridge,
    enabled: true,
    expectedSender: '+60199999999',
    now: () => Date.parse('2026-11-04T00:01:00Z'),
  });
  ledger.pause(false);
  return {
    ledger,
    dispatcher,
    bridge,
    reader,
    setLead: (value) => {
      current = value;
    },
    calls: () => calls,
  };
};
test('phone normalization requires an explicit international number', () => {
  assert.equal(normalizePhone('+60 12-345 6789'), '+60123456789');
  assert.equal(normalizePhone('0123456789'), null);
  assert.equal(normalizePhone(''), null);
});
test('notification preserves the original bill response and removes control characters', () => {
  const text = formatLead({ ...lead, name: 'Sample\nspoofed' });
  assert.match(text, /Bill: RM 500–700/);
  assert.match(text, /Name: Sample spoofed/);
  assert.ok(text.length < 3500);
});
test('pre-activation leads are excluded and duplicate observations persist only once', () => {
  const { ledger } = fixture();
  observe(ledger, { ...lead, createdAt: '2026-11-03T00:00:00Z' });
  assert.equal(ledger.list().length, 0);
  observe(ledger, lead);
  observe(ledger, lead);
  assert.equal(ledger.list().length, 1);
});
test('missing recipient remains held and becomes pending when configured', () => {
  const { ledger } = fixture();
  observe(ledger, { ...lead, recipient: null });
  assert.equal(ledger.list()[0].state, 'held');
  observe(ledger, lead);
  assert.equal(ledger.list()[0].state, 'pending');
});
test('disabled sending never calls the transport', async () => {
  const f = fixture();
  observe(f.ledger, lead);
  f.dispatcher.enabled = false;
  await f.dispatcher.tick();
  assert.equal(f.calls(), 0);
  assert.equal(f.ledger.list()[0].state, 'pending');
});
test('persisted pause and wrong sender both prevent a send', async () => {
  const f = fixture();
  observe(f.ledger, lead);
  f.ledger.pause(true);
  await f.dispatcher.tick();
  assert.equal(f.calls(), 0);
  f.ledger.pause(false);
  f.dispatcher.expectedSender = '+60188888888';
  await f.dispatcher.tick();
  assert.equal(f.calls(), 0);
});
test('a reassigned pending lead is cancelled without disclosure to its former assignee', async () => {
  const f = fixture();
  observe(f.ledger, lead);
  f.setLead({ ...lead, assignedSalespersonId: 'sales-b' });
  await f.dispatcher.tick();
  assert.equal(f.calls(), 0);
  assert.equal(f.ledger.list()[0].state, 'cancelled');
});
test('revoked or changed recipient cancels the stale notification', async () => {
  const f = fixture();
  observe(f.ledger, lead);
  f.setLead({ ...lead, recipient: null });
  await f.dispatcher.tick();
  assert.equal(f.calls(), 0);
  assert.equal(f.ledger.list()[0].state, 'cancelled');
});
test('submission is not delivery, and repeated ticks cannot send again', async () => {
  const f = fixture();
  observe(f.ledger, lead);
  await f.dispatcher.tick();
  await f.dispatcher.tick();
  assert.equal(f.calls(), 1);
  assert.equal(f.ledger.list()[0].state, 'submitted');
  f.ledger.receipt('message-1', 'delivered');
  assert.equal(f.ledger.list()[0].state, 'delivered');
});
test('an ambiguous failure is never automatically retried', async () => {
  const f = fixture();
  observe(f.ledger, lead);
  f.bridge.send = async () => {
    throw Error('timeout');
  };
  await f.dispatcher.tick();
  assert.equal(f.ledger.list()[0].state, 'delivery-unknown');
  await f.dispatcher.tick();
  assert.equal(f.ledger.list()[0].state, 'delivery-unknown');
  assert.throws(() => f.ledger.retry(lead.id, false));
  f.ledger.retry(lead.id, true);
  assert.equal(f.ledger.list()[0].state, 'pending');
});
test('a disconnected bridge leaves work pending without a transport call', async () => {
  const f = fixture();
  observe(f.ledger, lead);
  f.bridge.health = async () => ({ connected: false, sender: null });
  await f.dispatcher.tick();
  assert.equal(f.calls(), 0);
  assert.equal(f.ledger.list()[0].state, 'pending');
});
test('status edits after a successful submission do not queue another message', async () => {
  const f = fixture();
  observe(f.ledger, lead);
  await f.dispatcher.tick();
  observe(f.ledger, { ...lead, status: 'FOLLOW_UP' });
  await f.dispatcher.tick();
  assert.equal(f.calls(), 1);
});
test('an admin pause while preflight is awaiting CRM data prevents the pending send', async () => {
  const f = fixture();
  observe(f.ledger, lead);
  f.reader.get = async () => {
    f.ledger.pause(true);
    return lead;
  };
  await f.dispatcher.tick();
  assert.equal(f.calls(), 0);
  assert.equal(f.ledger.list()[0].state, 'pending');
});
test('exhausted bridge retries remain held across ordinary observations', async () => {
  const f = fixture();
  observe(f.ledger, lead);
  let now = Date.parse('2026-11-04T00:01:00Z');
  f.dispatcher.now = () => now;
  f.bridge.health = async () => ({ connected: false });
  for (let i = 0; i < 4; i++) {
    await f.dispatcher.tick();
    now = f.ledger.list()[0].nextAttempt + 1;
  }
  assert.equal(f.ledger.list()[0].state, 'held');
  observe(f.ledger, lead);
  assert.equal(f.ledger.list()[0].state, 'held');
  assert.equal(f.ledger.list()[0].reason, 'bridge_unavailable');
});
test('unknown mapping uniqueness cannot authorize a notification', () => {
  const f = fixture();
  observe(f.ledger, { ...lead, mappingCount: undefined });
  assert.equal(f.ledger.list()[0].state, 'held');
});
