import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ledger } from '../src/ledger.mjs';
import { Dispatcher, observe } from '../src/dispatcher.mjs';

const cutoff = '2030-01-01T00:00:00Z';
const sender = '+60199999999';
const commercial = {
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: '2030-01-01T00:00:01Z',
  leadType: 'COMMERCIAL',
  assignedSalespersonId: null,
  assignmentState: 'PENDING',
  assignedAt: null,
  name: 'Synthetic commercial',
  phone: 'TEST ONLY',
  area: 'Area',
  bill: 'RM 500–700',
  source: 'FACEBOOK',
  recipient: '+60123456789',
  salespersonName: null,
  workspaceMemberId: null,
  mappingCount: 0,
  deletedAt: null,
};
const assigned = () => ({
  ...commercial,
  assignedSalespersonId: 'sales-a',
  assignedAt: '2030-01-01T00:01:00Z',
  assignmentState: 'ASSIGNED',
  salespersonName: 'A',
  workspaceMemberId: 'member-a',
  mappingCount: 1,
});
const fixture = () => {
  const ledger = new Ledger(':memory:');
  ledger.activate(cutoff);
  ledger.set('commercial-alert-cutoff', cutoff);
  ledger.pause(false);
  let current = { ...commercial },
    now = Date.parse('2030-01-01T00:02:00Z');
  const sends = [];
  const reader = { recipientsConfigured: true, get: async () => current };
  const bridge = {
    health: async () => ({ connected: true, sender }),
    send: async (recipient, message) => {
      sends.push({ recipient, message });
      return 'message-' + sends.length;
    },
  };
  const dispatcher = new Dispatcher({
    ledger,
    reader,
    bridge,
    enabled: true,
    expectedSender: sender,
    now: () => now,
  });
  return {
    ledger,
    reader,
    bridge,
    dispatcher,
    sends,
    setLead: (value) => {
      current = value;
    },
    advance: () => {
      now += 3000;
    },
  };
};
const adminJob = (ledger) =>
  ledger.list().find((job) => job.kind === 'commercial-awaiting-assignment');

test('new unassigned Commercial lead sends once to configured marketing number without sales mapping', async () => {
  const f = fixture();
  observe(f.ledger, commercial, sender);
  observe(f.ledger, commercial, sender);
  await f.dispatcher.tick();
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].recipient, sender);
  assert.match(
    f.sends[0].message,
    /^New Commercial lead — manual assignment required/,
  );
  assert.match(f.sends[0].message, /Bill: RM 500–700/);
  assert.doesNotMatch(f.sends[0].message, /Assigned to:/);
  assert.match(
    adminJob(f.ledger).id,
    /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
  );
  f.advance();
  observe(f.ledger, commercial, sender);
  await f.dispatcher.tick();
  assert.equal(f.sends.length, 1);
});
test('admin alert does not suppress later normal salesperson assignment notification', async () => {
  const f = fixture();
  observe(f.ledger, commercial, sender);
  await f.dispatcher.tick();
  f.setLead(assigned());
  observe(f.ledger, assigned(), sender);
  f.advance();
  await f.dispatcher.tick();
  assert.deepEqual(
    f.sends.map((send) => send.recipient),
    [sender, commercial.recipient],
  );
  assert.match(f.sends[1].message, /Assigned to: A/);
  assert.equal(
    f.ledger.list().filter((job) => job.state === 'submitted').length,
    2,
  );
});
for (const change of [
  assigned(),
  { ...commercial, deletedAt: '2030-01-01' },
  { ...commercial, leadType: 'RESIDENTIAL' },
  null,
]) {
  test(
    'stale pending Commercial alert is cancelled before sending: ' +
      JSON.stringify(change?.leadType ?? 'deleted'),
    async () => {
      const f = fixture();
      observe(f.ledger, commercial, sender);
      f.setLead(change);
      await f.dispatcher.tick();
      assert.equal(f.sends.length, 0);
      assert.equal(adminJob(f.ledger).state, 'cancelled');
    },
  );
}
test('Residential, Unknown, missing type, assigned or inconsistent Commercial records do not create admin alerts', () => {
  for (const lead of [
    { ...commercial, leadType: 'RESIDENTIAL' },
    { ...commercial, leadType: 'UNKNOWN' },
    { ...commercial, leadType: undefined },
    assigned(),
    { ...commercial, assignedAt: '2030-01-01' },
    { ...commercial, assignmentState: 'ASSIGNED' },
  ]) {
    const f = fixture();
    observe(f.ledger, lead, sender);
    assert.equal(adminJob(f.ledger), undefined);
  }
});
test('admin alert honors both activation and feature cutoffs, ignoring invalid timestamps', () => {
  for (const createdAt of ['2029-12-31T23:59:59Z', 'invalid']) {
    const f = fixture();
    observe(f.ledger, { ...commercial, createdAt }, sender);
    assert.equal(adminJob(f.ledger), undefined);
  }
  const f = fixture();
  f.ledger.set('commercial-alert-cutoff', '2030-01-02T00:00:00Z');
  observe(f.ledger, commercial, sender);
  assert.equal(adminJob(f.ledger), undefined);
});
test('missing or invalid configured marketing destination cannot be replaced by lead recipient text', () => {
  for (const destination of [undefined, '', '0199999999']) {
    const f = fixture();
    observe(f.ledger, commercial, destination);
    assert.equal(adminJob(f.ledger), undefined);
  }
});
test('disabled, paused, wrong sender and incomplete production readiness block Commercial delivery', async () => {
  for (const block of ['disabled', 'paused', 'wrongSender', 'notReady']) {
    const f = fixture();
    observe(f.ledger, commercial, sender);
    if (block === 'disabled') f.dispatcher.enabled = false;
    if (block === 'paused') f.ledger.pause(true);
    if (block === 'wrongSender')
      f.bridge.health = async () => ({
        connected: true,
        sender: '+60188888888',
      });
    if (block === 'notReady') f.reader.recipientsConfigured = false;
    await f.dispatcher.tick();
    assert.equal(f.sends.length, 0);
    assert.equal(adminJob(f.ledger).state, 'pending');
  }
});
test('Commercial ambiguous submission is retained as unknown and never automatically replayed', async () => {
  const f = fixture();
  observe(f.ledger, commercial, sender);
  f.bridge.send = async () => {
    throw Error('Lost response');
  };
  await f.dispatcher.tick();
  assert.equal(adminJob(f.ledger).state, 'delivery-unknown');
  observe(f.ledger, commercial, sender);
  assert.equal(adminJob(f.ledger).state, 'delivery-unknown');
  assert.throws(() => f.ledger.retry(adminJob(f.ledger).id, false));
});
test('previous ledger schema upgrade retains every old row and setting and survives reopening', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hermes-commercial-upgrade-'));
  const path = join(directory, 'ledger.db');
  try {
    const database = new DatabaseSync(path);
    database.exec(
      `CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO settings VALUES('activation','2026-11-04T00:00:00Z'),('paused','true'); CREATE TABLE jobs(id TEXT PRIMARY KEY,leadId TEXT NOT NULL UNIQUE,state TEXT NOT NULL,reason TEXT,assignmentKey TEXT,recipient TEXT,attempts INTEGER NOT NULL DEFAULT 0,nextAttempt INTEGER NOT NULL DEFAULT 0,createdAt INTEGER NOT NULL,messageId TEXT,messageHash TEXT);`,
    );
    const states = [
      'submitted',
      'delivered',
      'delivery-unknown',
      'pending',
      'held',
      'sending',
    ];
    for (const [index, state] of states.entries())
      database
        .prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(
          'old-' + index,
          'old-' + index,
          state,
          'old-reason',
          'key',
          sender,
          2,
          99,
          123,
          'message-' + index,
          'body-hash',
        );
    const before = database.prepare('SELECT * FROM jobs ORDER BY id').all();
    database.close();
    let ledger = new Ledger(path);
    assert.ok(
      Date.parse(ledger.setting('commercial-alert-cutoff')) >=
        Date.parse('2026-11-05T00:00:00Z'),
    );
    const featureCutoff = ledger.setting('commercial-alert-cutoff');
    for (const old of before) {
      const migrated = ledger.get(old.id);
      assert.deepEqual(
        { ...migrated },
        {
          ...old,
          kind: 'initial-assignment',
          ...(old.state === 'sending'
            ? { state: 'delivery-unknown', reason: 'interrupted_submission' }
            : {}),
        },
      );
    }
    assert.equal(ledger.setting('paused'), 'true');
    assert.equal(ledger.setting('activation'), '2026-11-04T00:00:00Z');
    ledger.database.close();
    ledger = new Ledger(path);
    assert.equal(ledger.setting('commercial-alert-cutoff'), featureCutoff);
    assert.equal(ledger.list().length, 6);
    ledger.database.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a persisted Commercial job keeps its UUID and delivery history across backup and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hermes-commercial-restart-'));
  try {
    const path = join(directory, 'ledger.db');
    let ledger = new Ledger(path);
    ledger.activate(cutoff);
    ledger.set('commercial-alert-cutoff', cutoff);
    observe(ledger, commercial, sender);
    const job = adminJob(ledger);
    ledger.claim(job.id, 'message-hash');
    ledger.submitted(job.id, 'commercial-message');
    ledger.receipt('commercial-message', 'delivered');
    await ledger.snapshot(join(directory, 'backup.db'));
    ledger.database.close();
    ledger = new Ledger(join(directory, 'backup.db'));
    observe(ledger, commercial, sender);
    assert.equal(adminJob(ledger).id, job.id);
    assert.equal(adminJob(ledger).state, 'delivered');
    assert.equal(ledger.list().length, 2);
    ledger.database.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('a known pre-submission Commercial failure is deferred and can retry without replaying a submitted job', async () => {
  const f = fixture();
  observe(f.ledger, commercial, sender);
  f.bridge.send = async () => {
    const error = Error('Not submitted');
    error.preSubmission = true;
    throw error;
  };
  await f.dispatcher.tick();
  const job = adminJob(f.ledger);
  assert.equal(job.state, 'pending');
  assert.equal(job.attempts, 1);
  f.bridge.send = async () => 'confirmed-message';
  f.dispatcher.now = () => job.nextAttempt + 1;
  await f.dispatcher.tick();
  assert.equal(adminJob(f.ledger).state, 'submitted');
});
test('an operator pause during Commercial CRM preflight prevents submission', async () => {
  const f = fixture();
  observe(f.ledger, commercial, sender);
  f.reader.get = async () => {
    f.ledger.pause(true);
    return commercial;
  };
  await f.dispatcher.tick();
  assert.equal(f.sends.length, 0);
  assert.equal(adminJob(f.ledger).state, 'pending');
});
