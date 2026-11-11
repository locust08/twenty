import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/ledger.mjs';
import { activateIfReady } from '../src/activation.mjs';
const fixture = () => ({
  ledger: new Ledger(':memory:'),
  reader: { recipientsConfigured: true, page: async () => ({}) },
  bridge: { health: async () => ({ connected: true, sender: '+60199999999' }) },
  enabled: true,
  confirmed: true,
  expectedSender: '+60199999999',
  now: () => new Date('2026-11-04T00:00:00Z'),
});
test('initial activation requires explicit deployment consent and all real recipients plus matching sender', async () => {
  for (const change of [
    { enabled: false },
    { confirmed: false },
    { reader: { recipientsConfigured: false, page: async () => ({}) } },
    { expectedSender: '' },
    { expectedSender: '+60188888888' },
  ]) {
    const f = { ...fixture(), ...change };
    await activateIfReady(f);
    assert.equal(f.ledger.setting('activation'), undefined);
    assert.equal(f.ledger.setting('paused'), 'true');
  }
  const f = fixture();
  await activateIfReady(f);
  assert.equal(f.ledger.setting('activation'), '2026-11-04T00:00:00.000Z');
  assert.equal(f.ledger.setting('paused'), 'false');
  f.ledger.pause(true);
  await activateIfReady(f);
  assert.equal(f.ledger.setting('paused'), 'true');
});
