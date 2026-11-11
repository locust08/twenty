import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/ledger.mjs';
import { observe } from '../src/dispatcher.mjs';
import { createControlServer } from '../src/control.mjs';
test('admin retries Commercial jobs by their saved lead ID and kind, never the opaque job ID', async () => {
  const ledger = new Ledger(':memory:');
  ledger.activate('2030-01-01T00:00:00Z');
  ledger.set('commercial-alert-cutoff', '2030-01-01T00:00:00Z');
  const sender = '+60199999999';
  let lead = {
    id: '11111111-1111-4111-8111-111111111111',
    createdAt: '2030-01-01T00:00:01Z',
    leadType: 'COMMERCIAL',
    assignedSalespersonId: null,
    assignedAt: null,
    assignmentState: 'PENDING',
  };
  observe(ledger, lead, sender);
  const job = ledger
    .list()
    .find((row) => row.kind === 'commercial-awaiting-assignment');
  assert.ok(job);
  ledger.update(job.id, 'delivery-unknown');
  const server = createControlServer({
    ledger,
    expectedSender: sender,
    enabled: false,
    adminToken: 'secret',
    backupToken: 'backup',
    bridge: { health: async () => ({ connected: true, sender }) },
    reader: {
      get: async (id) => {
        assert.equal(id, lead.id);
        return lead;
      },
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const retry = (acknowledge) =>
    fetch(base + '/admin/control', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret' },
      body: JSON.stringify({
        action: 'retry',
        memberId: 'admin',
        jobId: job.id,
        acknowledge,
      }),
    });
  try {
    assert.equal((await retry(false)).status, 409);
    assert.equal((await retry(true)).status, 200);
    assert.equal(ledger.get(job.id).state, 'pending');
    assert.equal(ledger.get(job.id).recipient, sender);
    const status = await (
      await fetch(base + '/admin/status', {
        headers: { Authorization: 'Bearer secret' },
      })
    ).json();
    assert.equal(
      status.jobs.find((row) => row.id === job.id).kind,
      'commercial-awaiting-assignment',
    );
    ledger.update(job.id, 'cancelled');
    lead = {
      ...lead,
      assignedSalespersonId: 'sales-a',
      assignmentState: 'ASSIGNED',
    };
    assert.equal((await retry(true)).status, 409);
    assert.equal(ledger.get(job.id).state, 'cancelled');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    ledger.database.close();
  }
});
