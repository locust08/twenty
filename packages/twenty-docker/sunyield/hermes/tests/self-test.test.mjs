import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ledger } from '../src/ledger.mjs';
import { TestNotification } from '../src/test-notification.mjs';

const setup = (overrides = {}) => {
  const ledger = new Ledger(':memory:');
  const sent = [];
  const bridge = {
    health: async () => ({ connected: true, sender: '+60123456789' }),
    send: async (recipient, message) => {
      sent.push({ recipient, message });
      return 'message-1';
    },
    ...overrides,
  };
  const notification = new TestNotification({ ledger, bridge, enabled: false });
  const request = {
    requestId: randomUUID(),
    memberId: 'admin',
    expectedSender: '+60123456789',
  };
  return { ledger, sent, notification, request, bridge };
};

test('a self-test sends fixed dummy content only to the actual sender without touching automatic jobs or settings', async () => {
  const { ledger, sent, notification, request } = setup();
  try {
    const result = await notification.send(request);
    assert.equal(result.state, 'submitted');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].recipient, '+60123456789');
    assert.match(sent[0].message, /^TEST ONLY — Dummy lead notification/);
    assert.match(sent[0].message, /Name: Sunyield Test Lead/);
    assert.match(sent[0].message, /Phone: Not a real lead/);
    assert.equal(ledger.setting('paused'), 'true');
    assert.equal(ledger.setting('activation'), undefined);
    assert.deepEqual(ledger.list(), []);
    ledger.receipt('message-1', 'delivered');
    assert.equal(notification.latest().state, 'delivered');
  } finally {
    ledger.database.close();
  }
});

test('replayed and simultaneous self-test requests submit only once', async () => {
  let release;
  const { ledger, notification, request, sent } = setup({
    send: async (...args) => {
      sent.push(args);
      await new Promise((resolve) => {
        release = resolve;
      });
      return 'message-1';
    },
  });
  try {
    const first = notification.send(request);
    while (!release) await new Promise((resolve) => setImmediate(resolve));
    assert.equal((await notification.send(request)).state, 'sending');
    await assert.rejects(
      notification.send({ ...request, requestId: randomUUID() }),
    );
    release();
    await first;
    assert.equal((await notification.send(request)).state, 'submitted');
    assert.equal(sent.length, 1);
    await assert.rejects(notification.send({ ...request, memberId: 'other' }));
    await assert.rejects(
      notification.send({ ...request, expectedSender: '+60999999999' }),
    );
  } finally {
    ledger.database.close();
  }
});

test('a global durable cooldown prevents a fresh request from duplicating a recent self-test', async () => {
  const { ledger, notification, request, sent } = setup();
  try {
    await notification.send(request);
    const restarted = new TestNotification({
      ledger,
      bridge: {
        health: async () => ({ connected: true, sender: '+60123456789' }),
      },
      enabled: false,
    });
    await assert.rejects(
      restarted.send({
        ...request,
        requestId: randomUUID(),
        memberId: 'second-admin',
      }),
    );
    assert.equal(sent.length, 1);
  } finally {
    ledger.database.close();
  }
});

test('an ambiguous self-test is recorded and never retried by the same request', async () => {
  let attempts = 0;
  const { ledger, notification, request } = setup({
    send: async () => {
      attempts++;
      throw Error('Timeout');
    },
  });
  try {
    assert.equal((await notification.send(request)).state, 'delivery-unknown');
    assert.equal((await notification.send(request)).state, 'delivery-unknown');
    assert.equal(attempts, 1);
  } finally {
    ledger.database.close();
  }
});

test('delivery receipts arriving before transport returns are reconciled after submission', async () => {
  const { ledger, notification, request } = setup({
    send: async () => {
      ledger.receipt('early-message', 'delivered');
      return 'early-message';
    },
  });
  try {
    assert.equal((await notification.send(request)).state, 'delivered');
    assert.equal(notification.latest().state, 'delivered');
  } finally {
    ledger.database.close();
  }
});

test('an interrupted self-test becomes unknown on recovery without replaying', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'sunyield-self-test-'));
  const path = join(directory, 'ledger.db');
  let ledger = new Ledger(path);
  const request = {
    requestId: randomUUID(),
    memberId: 'admin',
    expectedSender: '+60123456789',
  };
  try {
    ledger.database
      .prepare(
        'INSERT INTO testNotifications(requestId,memberId,recipient,createdAt,state) VALUES(?,?,?,?,?)',
      )
      .run(request.requestId, 'admin', '+60123456789', Date.now(), 'sending');
    ledger.database.close();
    ledger = new Ledger(path);
    const recovered = new TestNotification({
      ledger,
      bridge: { send: () => assert.fail('Restart must not resend') },
      enabled: false,
    });
    assert.equal((await recovered.send(request)).state, 'delivery-unknown');
  } finally {
    ledger.database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('disconnected, changed and malformed sender states cannot receive a self-test', async () => {
  for (const health of [
    { connected: false, sender: '+60123456789' },
    { connected: true, sender: '+60999999999' },
    { connected: true, sender: null },
  ]) {
    const { ledger, sent, notification, request } = setup({
      health: async () => health,
    });
    try {
      await assert.rejects(notification.send(request));
      assert.equal(sent.length, 0);
      assert.equal(notification.latest(), null);
    } finally {
      ledger.database.close();
    }
  }
});

test('self-tests require automatic sending disabled and a persisted pause', async () => {
  for (const enabled of [true, false]) {
    const { ledger, bridge, request, sent } = setup();
    try {
      if (!enabled) ledger.pause(false);
      const notification = new TestNotification({ ledger, bridge, enabled });
      await assert.rejects(notification.send(request));
      assert.equal(sent.length, 0);
    } finally {
      ledger.database.close();
    }
  }
});
