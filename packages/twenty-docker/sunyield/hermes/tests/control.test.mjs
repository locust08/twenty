import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/ledger.mjs';
import { createControlServer } from '../src/control.mjs';
import { PairingSession } from '../src/pairing.mjs';
test('private controls reject unauthenticated access and backup cannot administer pairing', async () => {
  const ledger = new Ledger(':memory:');
  let pairs = 0;
  const bridge = {
    paired: false,
    health: async () => ({ connected: false, sender: null }),
    pairing: new PairingSession(),
    begin: async (member) => {
      pairs++;
      return bridge.pairing.start(member);
    },
  };
  const server = createControlServer({
    ledger,
    bridge,
    adminToken: 'admin-secret',
    backupToken: 'backup-secret',
    enabled: false,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const token of ['', 'backup-secret']) {
      const response = await fetch(base + '/admin/control', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: JSON.stringify({ action: 'pair', memberId: 'admin' }),
      });
      assert.equal(response.status, 403);
    }
    assert.equal(pairs, 0);
    const status = await fetch(base + '/admin/status', {
      headers: { Authorization: 'Bearer admin-secret' },
    });
    assert.equal(status.status, 200);
    assert.equal((await status.json()).sendingEnabled, false);
    const enable = await fetch(base + '/admin/control', {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-secret' },
      body: JSON.stringify({ action: 'enable', memberId: 'admin' }),
    });
    assert.equal(enable.status, 400);
    assert.equal(ledger.setting('paused'), 'true');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    ledger.database.close();
  }
});
test('older unresolved jobs remain reachable through bounded queue pages', async () => {
  const ledger = new Ledger(':memory:');
  for (let index = 0; index < 101; index++)
    ledger.put(
      { id: 'lead-' + String(index).padStart(3, '0') },
      index === 0 ? 'delivery-unknown' : 'delivered',
      null,
      'hash',
      null,
    );
  const bridge = {
    paired: false,
    health: async () => ({ connected: false, sender: null }),
  };
  const server = createControlServer({
    ledger,
    bridge,
    adminToken: 'secret',
    backupToken: 'backup',
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const response = await fetch(base + '/admin/status', {
      headers: { Authorization: 'Bearer secret' },
    });
    const page = await response.json();
    assert.equal(page.jobs[0].leadId, 'lead-000');
    assert.equal(page.nextOffset, 100);
    const next = await fetch(base + '/admin/control', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret' },
      body: JSON.stringify({
        action: 'queue-page',
        memberId: 'admin',
        offset: 100,
      }),
    });
    assert.equal(next.status, 200);
    assert.equal((await next.json()).jobs.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    ledger.database.close();
  }
});
test('a persisted operator pause is reported as sending disabled even when deployment allows sends', async () => {
  const ledger = new Ledger(':memory:');
  const bridge = {
    paired: true,
    health: async () => ({ connected: true, sender: '+60199999999' }),
  };
  const server = createControlServer({
    ledger,
    bridge,
    adminToken: 'secret',
    backupToken: 'backup',
    enabled: true,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(
      'http://127.0.0.1:' + server.address().port + '/admin/status',
      { headers: { Authorization: 'Bearer secret' } },
    );
    assert.equal((await response.json()).sendingEnabled, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    ledger.database.close();
  }
});
test('cancelling a connected pairing session fences Resume from an earlier health response', async () => {
  const ledger = new Ledger(':memory:');
  ledger.activate('2026-11-04T00:00:00Z');
  const pairing = new PairingSession();
  const session = pairing.start('admin');
  let resolveHealth,
    checks = 0;
  const bridge = {
    paired: true,
    pairing,
    health: async () => {
      if (++checks === 1)
        return new Promise((resolve) => {
          resolveHealth = resolve;
        });
      return { connected: false, sender: '+60123456789' };
    },
    cancel: async (member, id) => {
      pairing.read(member, id);
      pairing.clear();
    },
  };
  const server = createControlServer({
    ledger,
    bridge,
    reader: { page: async () => ({ recipientsConfigured: true }) },
    enabled: true,
    expectedSender: '+60123456789',
    adminToken: 'secret',
    backupToken: 'backup',
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = (body) =>
    fetch(base + '/admin/control', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret' },
      body: JSON.stringify({ memberId: 'admin', ...body }),
    });
  try {
    const resuming = request({ action: 'resume', acknowledge: true });
    while (!resolveHealth)
      await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      (await request({ action: 'cancel-pair', sessionId: session.id })).status,
      200,
    );
    resolveHealth({ connected: true, sender: '+60123456789' });
    assert.equal((await resuming).status, 409);
    assert.equal(ledger.setting('paused'), 'true');
  } finally {
    if (resolveHealth) resolveHealth({ connected: false, sender: null });
    await new Promise((resolve) => server.close(resolve));
    ledger.database.close();
  }
});
