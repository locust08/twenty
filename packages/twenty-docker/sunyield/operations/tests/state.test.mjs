import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MirroredState } from '../src/state.mjs';
test('R2 outage leaves Redis state available for its incident alert', async () => {
  let saved;
  const failed = {
    readJson: async () => {
      throw Error('down');
    },
    writeJson: async () => {
      throw Error('down');
    },
  };
  const working = {
    readJson: async () => ({ healthy: true, checkedAt: '2026-11-01' }),
    writeJson: async (k, v) => {
      saved = v;
    },
  };
  const state = new MirroredState(failed, working);
  assert.equal((await state.readJson('a')).healthy, true);
  await state.writeJson('a', { healthy: false });
  assert.equal(saved.healthy, false);
});
test('uses newest mirror after either storage recovers', async () => {
  const state = new MirroredState(
    { readJson: async () => ({ healthy: true, checkedAt: '2026-11-01' }) },
    { readJson: async () => ({ healthy: false, checkedAt: '2026-11-02' }) },
  );
  assert.equal((await state.readJson('a')).healthy, false);
});
test('both persistence failures are surfaced', async () => {
  const bad = {
    readJson: async () => {
      throw Error('down');
    },
  };
  await assert.rejects(new MirroredState(bad, bad).readJson('a'));
});
