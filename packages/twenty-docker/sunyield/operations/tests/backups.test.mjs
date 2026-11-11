import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishBackup } from '../src/backups.mjs';

test('publishes manifest only after all verification and restore checks pass', async () => {
  const events = [];
  const result = await publishBackup({
    kind: 'database',
    slot: 'slot',
    create: async () => ({ items: [1] }),
    verify: async () => events.push('verify'),
    restore: async () => events.push('restore'),
    publish: async () => events.push('publish'),
  });
  assert.deepEqual(events, ['verify', 'restore', 'publish']);
  assert.equal(result.verified, true);
});
test('failed upload verification cannot publish a successful snapshot', async () => {
  let published = false;
  await assert.rejects(
    publishBackup({
      kind: 'database',
      slot: 'slot',
      create: async () => ({ items: [1] }),
      verify: async () => {
        throw Error('corrupt');
      },
      restore: async () => {},
      publish: async () => {
        published = true;
      },
    }),
    /corrupt/,
  );
  assert.equal(published, false);
});
test('failed database restore cannot publish a successful snapshot', async () => {
  let published = false;
  await assert.rejects(
    publishBackup({
      kind: 'database',
      slot: 'slot',
      create: async () => ({ items: [1] }),
      verify: async () => {},
      restore: async () => {
        throw Error('restore');
      },
      publish: async () => {
        published = true;
      },
    }),
    /restore/,
  );
  assert.equal(published, false);
});

test('failed file snapshot removes only its own uploaded objects', async () => {
  const { Snapshots } = await import('../src/snapshots.mjs');
  let uploaded;
  const removed = [];
  const destination = {
    upload: async (key) => {
      uploaded = key;
      return { key, size: 1, sha256: 'hash' };
    },
    verify: async () => {
      throw Error('checksum');
    },
    list: async () => [{ Key: uploaded }],
    remove: async (keys) => removed.push(...keys),
  };
  const source = {
    list: async () => [{ Key: 'source', ETag: 'etag', Size: 1 }],
    download: async () => {},
  };
  await assert.rejects(
    new Snapshots({ destination, source }).create('files', 'slot'),
    /checksum/,
  );
  assert.deepEqual(removed, [uploaded]);
  assert.match(uploaded, /^snapshots\/files\//);
});
