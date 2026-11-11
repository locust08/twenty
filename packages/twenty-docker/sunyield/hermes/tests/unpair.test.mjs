import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Bridge } from '../src/bridge.mjs';
test('revoking a device logs it out remotely before deleting local credentials', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hermes-unpair-'));
  const bridge = new Bridge(dir, 'unused');
  let revoked = false;
  await writeFile(join(dir, 'creds.json'), 'private');
  bridge.request = async (path) => {
    assert.equal(path, '/logout');
    revoked = true;
    return new Response('{}', { status: 200 });
  };
  try {
    await bridge.unpair();
    assert.equal(revoked, true);
    await assert.rejects(readFile(join(dir, 'creds.json')));
  } finally {
    clearInterval(bridge.timer);
    await rm(dir, { recursive: true, force: true });
  }
});
test('a failed remote logout preserves device credentials for recovery', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hermes-unpair-'));
  const bridge = new Bridge(dir, 'unused');
  await writeFile(join(dir, 'creds.json'), 'private');
  bridge.request = async () => new Response('{}', { status: 503 });
  try {
    await assert.rejects(bridge.unpair());
    assert.equal(await readFile(join(dir, 'creds.json'), 'utf8'), 'private');
  } finally {
    clearInterval(bridge.timer);
    await rm(dir, { recursive: true, force: true });
  }
});
