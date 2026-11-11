import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkHermes, backupHermes } from '../src/hermes.mjs';
test('unpaired disabled setup is healthy, but active disconnected delivery is not', async () => {
  await checkHermes({
    enabled: false,
    connected: false,
    unknown: 0,
    failed: 0,
    overdue: 0,
  });
  await assert.rejects(
    checkHermes({
      enabled: true,
      connected: false,
      unknown: 0,
      failed: 0,
      overdue: 0,
    }),
  );
  await assert.rejects(
    checkHermes({
      enabled: false,
      connected: false,
      unknown: 1,
      failed: 0,
      overdue: 0,
    }),
  );
});
test('ledger snapshot is verified before its manifest and retention only touches ledger prefix', async () => {
  const events = [];
  const store = {
    readJson: async () => null,
    upload: async (key) => {
      events.push('upload');
      return { key, size: 32, sha256: 'hash' };
    },
    verify: async () => {
      events.push('verify');
    },
    writeJson: async (key) => {
      events.push(key);
    },
    list: async () => [
      { Key: 'snapshots/database/keep' },
      { Key: 'hermes-ledger/2020-01-01/ledger.db' },
      { Key: 'hermes-ledger/2020-01-01/manifest.json' },
    ],
    remove: async (keys) => {
      assert.ok(keys.every((key) => key.startsWith('hermes-ledger/')));
      events.push('prune');
    },
  };
  await backupHermes(
    store,
    async () => Buffer.from('SQLite format 3\0' + 'synthetic snapshot'),
    new Date('2026-11-04T00:00:00Z'),
  );
  assert.deepEqual(events.slice(0, 3), [
    'upload',
    'verify',
    'hermes-ledger/2026-11-04/manifest.json',
  ]);
});
test('an active stale or failing lead observer is unhealthy even when WhatsApp is connected', async () => {
  await assert.rejects(
    checkHermes({
      enabled: true,
      connected: true,
      unknown: 0,
      failed: 0,
      overdue: 0,
      observerHealthy: false,
    }),
  );
});
