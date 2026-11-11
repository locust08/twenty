import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ledger } from '../src/ledger.mjs';
import { AssignmentTest } from '../src/assignment-test.mjs';

const START = Date.parse('2026-11-04T06:00:00Z');
const setup = () => {
  const ledger = new Ledger(':memory:');
  let time = START,
    lead = null;
  const request = {
    requestId: randomUUID(),
    leadId: randomUUID(),
    memberId: 'admin',
    expectedSender: '+60123456789',
  };
  const sent = [];
  const bridge = {
    health: async () => ({ connected: true, sender: '+60123456789' }),
    send: async (recipient, message) => {
      sent.push({ recipient, message });
      return 'test-message';
    },
  };
  const reader = {
    get: async (id) => {
      assert.equal(id, request.leadId);
      return lead;
    },
  };
  const observer = new AssignmentTest({
    ledger,
    bridge,
    reader,
    enabled: false,
    now: () => time,
  });
  const synthetic = {
    id: request.leadId,
    name: 'QA ASSIGNMENT NOTIFICATION TEST ' + request.leadId,
    source: 'FACEBOOK',
    leadType: 'RESIDENTIAL',
    phone: 'TEST ONLY — no real phone',
    area: 'QA test only — no real customer',
    bill: 'RM 500 (dummy test)',
    createdAt: new Date(START + 1000).toISOString(),
    deletedAt: null,
    assignmentState: 'ASSIGNED',
    assignedSalespersonId: 'e32c3ed9-18db-5043-b4b8-bcdb5f32e4bf',
    salespersonActive: true,
    salespersonRotationOrder: 2,
    assignedAt: new Date(START + 1500).toISOString(),
    salespersonName: 'Salesperson B',
    recipient: null,
    workspaceMemberId: null,
    mappingCount: 0,
  };
  return {
    ledger,
    bridge,
    reader,
    request,
    sent,
    observer,
    synthetic,
    setLead: (value) => {
      lead = value;
    },
    setTime: (value) => {
      time = value;
    },
  };
};

test('arming waits for automatic assignment and sends the actual synthetic lead once to the marketing account', async () => {
  const value = setup();
  const { ledger, observer, request, synthetic, sent } = value;
  try {
    await observer.arm(request);
    await observer.tick();
    assert.equal(sent.length, 0);
    assert.equal(observer.latest().state, 'waiting');
    value.setTime(START + 2000);
    value.setLead({
      ...synthetic,
      assignmentState: 'PENDING',
      assignedAt: null,
      assignedSalespersonId: null,
    });
    await observer.tick();
    assert.equal(sent.length, 0);
    value.setLead(synthetic);
    await observer.tick();
    await observer.tick();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].recipient, '+60123456789');
    assert.match(
      sent[0].message,
      /^TEST ONLY — Automatic assignment notification/,
    );
    assert.match(sent[0].message, /Assigned to: Salesperson B/);
    assert.match(sent[0].message, /RM 500 \(dummy test\)/);
    assert.equal(observer.latest().state, 'submitted');
    assert.equal(
      observer.latest().assignedSalespersonId,
      'e32c3ed9-18db-5043-b4b8-bcdb5f32e4bf',
    );
    assert.equal(ledger.setting('paused'), 'true');
    assert.equal(ledger.setting('activation'), undefined);
    assert.deepEqual(ledger.list(), []);
    ledger.receipt('test-message', 'delivered');
    assert.equal(observer.latest().state, 'delivered');
  } finally {
    ledger.database.close();
  }
});

test('old or non-synthetic lead fields cannot reach the transport', async () => {
  for (const change of [
    { createdAt: new Date(START - 1).toISOString() },
    { name: 'Real customer' },
    { phone: '+60199999999' },
    { source: 'WEBSITE' },
    { source: 'DEMO_LEAD' },
    { source: 'GOOGLE_ADS' },
    { leadType: 'COMMERCIAL' },
    { area: 'Real area' },
    { bill: 'Real bill' },
    { deletedAt: new Date().toISOString() },
    { salespersonActive: false },
    { salespersonRotationOrder: 0 },
    { assignedAt: new Date(START - 1000).toISOString() },
    { id: randomUUID() },
  ]) {
    const value = setup();
    try {
      await value.observer.arm(value.request);
      value.setTime(START + 2000);
      value.setLead({ ...value.synthetic, ...change });
      await value.observer.tick();
      assert.equal(value.sent.length, 0);
      assert.equal(value.observer.latest().state, 'cancelled');
    } finally {
      value.ledger.database.close();
    }
  }
});

test('replayed arm requests and concurrent ticks cannot send the lead twice', async () => {
  const value = setup();
  try {
    await value.observer.arm(value.request);
    await value.observer.arm(value.request);
    await assert.rejects(
      value.observer.arm({ ...value.request, requestId: randomUUID() }),
    );
    await assert.rejects(
      value.observer.arm({ ...value.request, memberId: 'other' }),
    );
    value.setTime(START + 2000);
    value.setLead(value.synthetic);
    await Promise.all([value.observer.tick(), value.observer.tick()]);
    await value.observer.arm(value.request);
    await value.observer.tick();
    assert.equal(value.sent.length, 1);
  } finally {
    value.ledger.database.close();
  }
});

test('expiry and operator cancellation while feed lookup is pending prevent submission', async () => {
  for (const stop of ['expire', 'cancel', 'pause']) {
    const value = setup();
    try {
      await value.observer.arm(value.request);
      value.setTime(START + 2000);
      value.reader.get = async () => {
        if (stop === 'expire') value.setTime(START + 600001);
        else if (stop === 'cancel')
          value.observer.cancel(value.request.requestId);
        else value.ledger.pause(false);
        return value.synthetic;
      };
      await value.observer.tick();
      assert.equal(value.sent.length, 0);
      assert.ok(
        ['expired', 'cancelled'].includes(value.observer.latest().state),
      );
    } finally {
      value.ledger.database.close();
    }
  }
});

test('sender changes cancel the lease and disconnection waits only until its original expiry', async () => {
  for (const changed of [true, false]) {
    const value = setup();
    try {
      await value.observer.arm(value.request);
      value.setTime(START + 2000);
      value.setLead(value.synthetic);
      value.bridge.health = async () => ({
        connected: changed,
        sender: changed ? '+60999999999' : '+60123456789',
      });
      await value.observer.tick();
      assert.equal(value.sent.length, 0);
      assert.equal(
        value.observer.latest().state,
        changed ? 'cancelled' : 'waiting',
      );
      value.setTime(START + 600001);
      await value.observer.tick();
      assert.notEqual(value.observer.latest().state, 'waiting');
    } finally {
      value.ledger.database.close();
    }
  }
});

test('an uncertain submission is durable and never automatically replayed after restart', async () => {
  const value = setup();
  try {
    await value.observer.arm(value.request);
    value.setTime(START + 2000);
    value.setLead(value.synthetic);
    let attempts = 0;
    value.bridge.send = async () => {
      attempts++;
      throw Error('Timeout');
    };
    await value.observer.tick();
    assert.equal(value.observer.latest().state, 'delivery-unknown');
    const recovered = new AssignmentTest({
      ledger: value.ledger,
      bridge: value.bridge,
      reader: value.reader,
      enabled: false,
      now: () => START + 3000,
    });
    await recovered.tick();
    await recovered.arm(value.request);
    assert.equal(attempts, 1);
  } finally {
    value.ledger.database.close();
  }
});

test('a feed outage leaves the lease waiting without changing its expiry', async () => {
  const value = setup();
  try {
    await value.observer.arm(value.request);
    const expiresAt = value.observer.latest().expiresAt;
    value.reader.get = async () => {
      throw Error('Unavailable');
    };
    await value.observer.tick();
    assert.equal(value.observer.latest().state, 'waiting');
    assert.equal(value.observer.latest().expiresAt, expiresAt);
    value.setTime(START + 600001);
    await value.observer.tick();
    assert.equal(value.observer.latest().state, 'expired');
    assert.equal(value.sent.length, 0);
  } finally {
    value.ledger.database.close();
  }
});

test('production enabled or unpaused settings cannot arm a test', async () => {
  for (const enabled of [true, false]) {
    const value = setup();
    try {
      if (!enabled) value.ledger.pause(false);
      const observer = new AssignmentTest({ ...value, enabled });
      await assert.rejects(observer.arm(value.request));
      assert.equal(observer.latest(), null);
    } finally {
      value.ledger.database.close();
    }
  }
});
test('cancel, pause and device revocation while arming health is pending fence out the lease', async () => {
  for (const reason of ['cancel', 'operator_paused', 'device_revoked']) {
    const value = setup();
    try {
      let resolveHealth;
      value.bridge.health = () =>
        new Promise((resolve) => {
          resolveHealth = resolve;
        });
      const arming = value.observer.arm(value.request);
      if (reason === 'cancel') value.observer.cancel(value.request.requestId);
      else value.observer.cancelActive(reason);
      resolveHealth({ connected: true, sender: '+60123456789' });
      await assert.rejects(arming);
      value.setLead(value.synthetic);
      value.setTime(START + 2000);
      await value.observer.tick();
      assert.equal(value.sent.length, 0);
      assert.equal(value.observer.latest(), null);
    } finally {
      value.ledger.database.close();
    }
  }
});
test('cancellation and expiry after assignment lookup but during tick health prevent claiming', async () => {
  for (const reason of ['cancel', 'expire']) {
    const value = setup();
    try {
      await value.observer.arm(value.request);
      value.setLead(value.synthetic);
      value.setTime(START + 2000);
      value.bridge.health = async () => {
        if (reason === 'cancel') value.observer.cancelActive('operator_paused');
        else value.setTime(START + 600001);
        return { connected: true, sender: '+60123456789' };
      };
      await value.observer.tick();
      assert.equal(value.sent.length, 0);
      assert.ok(
        ['cancelled', 'expired'].includes(value.observer.latest().state),
      );
    } finally {
      value.ledger.database.close();
    }
  }
});
test('waiting survives a file-backed reopen and interrupted submission becomes unknown without replay', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'assignment-test-'));
  const path = join(directory, 'ledger.db');
  const value = setup();
  value.ledger.database.close();
  let ledger = new Ledger(path);
  try {
    let observer = new AssignmentTest({
      ledger,
      bridge: value.bridge,
      reader: value.reader,
      enabled: false,
      now: () => START,
    });
    await observer.arm(value.request);
    ledger.database.close();
    ledger = new Ledger(path);
    observer = new AssignmentTest({
      ledger,
      bridge: value.bridge,
      reader: value.reader,
      enabled: false,
      now: () => START + 2000,
    });
    assert.equal(observer.latest().state, 'waiting');
    ledger.database.prepare("UPDATE assignmentTests SET state='sending'").run();
    ledger.database.close();
    ledger = new Ledger(path);
    observer = new AssignmentTest({
      ledger,
      bridge: value.bridge,
      reader: value.reader,
      enabled: false,
      now: () => START + 3000,
    });
    value.setLead(value.synthetic);
    await observer.tick();
    assert.equal(observer.latest().state, 'delivery-unknown');
    assert.equal(value.sent.length, 0);
  } finally {
    ledger.database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
test('a completed lead cannot be armed again under another request after cooldown', async () => {
  const value = setup();
  try {
    await value.observer.arm(value.request);
    value.setLead(value.synthetic);
    value.setTime(START + 2000);
    await value.observer.tick();
    value.setTime(START + 70000);
    await assert.rejects(
      value.observer.arm({ ...value.request, requestId: randomUUID() }),
    );
    assert.equal(value.sent.length, 1);
  } finally {
    value.ledger.database.close();
  }
});
test('the synthetic observer supports a newly added active ordered salesperson outside the former four IDs', async () => {
  const value = setup();
  try {
    await value.observer.arm(value.request);
    value.setTime(START + 2000);
    value.setLead({
      ...value.synthetic,
      assignedSalespersonId: randomUUID(),
      salespersonName: 'New Salesperson E',
      salespersonActive: true,
      salespersonRotationOrder: 5,
    });
    await value.observer.tick();
    assert.equal(value.sent.length, 1);
    assert.match(value.sent[0].message, /Assigned to: New Salesperson E/);
  } finally {
    value.ledger.database.close();
  }
});

test('a Commercial lease submits the real unassigned dummy through the Commercial formatter once, without activating ordinary sending', async () => {
  const value = setup();
  const request = { ...value.request, kind: 'commercial-awaiting-assignment' };
  await value.observer.arm(request);
  value.setTime(START + 2000);
  value.setLead({
    ...value.synthetic,
    leadType: 'COMMERCIAL',
    source: 'GOOGLE_ADS',
    name: 'QA COMMERCIAL NOTIFICATION TEST ' + request.leadId,
    assignmentState: 'PENDING',
    assignedSalespersonId: null,
    assignedAt: null,
  });
  await value.observer.tick();
  await value.observer.tick();
  assert.equal(value.sent.length, 1);
  assert.equal(value.sent[0].recipient, request.expectedSender);
  assert.match(
    value.sent[0].message,
    /^TEST ONLY — Commercial lead admin notification/,
  );
  assert.match(
    value.sent[0].message,
    /New Commercial lead — manual assignment required/,
  );
  assert.match(value.sent[0].message, new RegExp(request.leadId));
  assert.doesNotMatch(value.sent[0].message, /Assigned to:/);
  assert.equal(value.observer.latest().kind, 'commercial-awaiting-assignment');
  assert.equal(value.observer.latest().state, 'submitted');
  assert.equal(value.ledger.setting('paused'), 'true');
  assert.equal(value.ledger.setting('activation'), undefined);
  assert.equal(value.ledger.list().length, 0);
});
test('Commercial test cancels assigned, wrong-type or inconsistent dummy leads without a message', async () => {
  for (const change of [
    { leadType: 'RESIDENTIAL' },
    { source: 'FACEBOOK' },
    { source: 'DEMO_LEAD' },
    { assignedSalespersonId: 'sales-a' },
    { assignedAt: '2026-11-04T06:00:01Z' },
    { assignmentState: 'ASSIGNED' },
    { name: 'Real customer' },
  ]) {
    const value = setup();
    await value.observer.arm({
      ...value.request,
      kind: 'commercial-awaiting-assignment',
    });
    value.setTime(START + 2000);
    value.setLead({
      ...value.synthetic,
      leadType: 'COMMERCIAL',
      source: 'GOOGLE_ADS',
      name: 'QA COMMERCIAL NOTIFICATION TEST ' + value.request.leadId,
      assignmentState: 'PENDING',
      assignedSalespersonId: null,
      assignedAt: null,
      ...change,
    });
    await value.observer.tick();
    assert.equal(value.sent.length, 0);
    assert.equal(value.observer.latest().state, 'cancelled');
  }
});
test('a test request cannot be replayed as a different kind and unknown kinds are rejected', async () => {
  const value = setup();
  await value.observer.arm(value.request);
  await assert.rejects(
    value.observer.arm({
      ...value.request,
      kind: 'commercial-awaiting-assignment',
    }),
  );
  const fresh = setup();
  await assert.rejects(
    fresh.observer.arm({ ...fresh.request, kind: 'arbitrary-send' }),
  );
});
