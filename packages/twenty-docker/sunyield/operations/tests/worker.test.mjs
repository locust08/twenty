import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkWorker } from '../src/worker.mjs';
test('an idle worker must complete the probe to pass', async () => {
  let attempt = 0;
  const job = {
    getState: async () => (++attempt > 2 ? 'completed' : 'waiting'),
  };
  const queue = { getJob: async () => null, add: async () => job };
  await checkWorker(queue, async () => {});
  assert.equal(attempt, 3);
});
test('a worker that never consumes a probe is unhealthy', async () => {
  const queue = {
    getJob: async () => null,
    add: async () => ({ getState: async () => 'waiting' }),
  };
  await assert.rejects(
    checkWorker(queue, async () => {}),
    /timed out/,
  );
});
test('a failed probe is unhealthy', async () => {
  const queue = {
    getJob: async () => null,
    add: async () => ({ getState: async () => 'failed' }),
  };
  await assert.rejects(
    checkWorker(queue, async () => {}),
    /failed/,
  );
});
