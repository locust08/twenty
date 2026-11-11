import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ledger } from '../src/ledger.mjs';
test('restart recovers an interrupted send as unknown, preserving pause and activation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hermes-test-'));
  try {
    let ledger = new Ledger(join(dir, 'ledger.db'));
    ledger.activate('2026-11-04T00:00:00Z');
    ledger.put({ id: 'lead' }, 'pending', null, 'hash', '+60123456789');
    ledger.claim('lead', 'body-hash');
    ledger.database.close();
    ledger = new Ledger(join(dir, 'ledger.db'));
    assert.equal(ledger.list()[0].state, 'delivery-unknown');
    assert.equal(ledger.setting('paused'), 'true');
    assert.equal(ledger.setting('activation'), '2026-11-04T00:00:00Z');
    await ledger.snapshot(join(dir, 'backup.db'));
    const restored = new Ledger(join(dir, 'backup.db'));
    assert.equal(restored.list()[0].state, 'delivery-unknown');
    restored.database.close();
    ledger.database.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
