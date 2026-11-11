import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule, retention, incidentTransition } from '../src/policy.mjs';

test('database uses six-hour boundaries and files use 02:00 Malaysia', () => {
  assert.equal(schedule(new Date('2026-11-03T17:59:00Z')).files, '2026-11-02');
  assert.equal(schedule(new Date('2026-11-03T18:00:00Z')).files, '2026-11-03');
  assert.equal(
    schedule(new Date('2026-11-03T18:00:00Z')).database,
    '2026-11-03T18:00:00.000Z',
  );
});
test('retention keeps recent and three calendar month recovery copies plus last verified', () => {
  const snapshots = [
    '2026-05-01',
    '2026-07-01',
    '2026-08-01',
    '2026-08-20',
    '2026-09-01',
    '2026-10-01',
    '2026-11-01',
  ].map((date) => ({
    id: date,
    createdAt: date + 'T00:00:00Z',
    verified: true,
  }));
  assert.deepEqual(retention(snapshots, new Date('2026-11-03')), [
    '2026-05-01',
    '2026-07-01',
    '2026-08-20',
  ]);
  assert.deepEqual(retention([snapshots[0]], new Date('2026-11-03')), []);
});
test('failure alerts once and recovery once, retrying unsent transitions', () => {
  assert.equal(incidentTransition(undefined, false), 'incident');
  assert.equal(incidentTransition({ healthy: false }, false), null);
  assert.equal(incidentTransition({ healthy: false }, true), 'recovery');
  assert.equal(incidentTransition(undefined, true), null);
});
