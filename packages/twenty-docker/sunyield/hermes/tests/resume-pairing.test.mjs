import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Bridge } from '../src/bridge.mjs';

test('a QR-paired account resumes from its saved identity even when upstream registered remains false', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hermes-pair-resume-'));
  const session = join(directory, 'session');
  await mkdir(session);
  await writeFile(
    join(session, 'creds.json'),
    JSON.stringify({
      registered: false,
      me: { id: '60123456789:12@s.whatsapp.net' },
    }),
  );
  await writeFile(
    join(directory, 'bridge.js'),
    'console.log(JSON.stringify({event:"connected",user:{id:"60123456789:12@s.whatsapp.net"}}));setInterval(()=>{},1000);',
  );
  const bridge = new Bridge(session, directory);
  try {
    await bridge.initialize();
    const deadline = Date.now() + 2000;
    while (!bridge.paired && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(bridge.paired, true);
    assert.equal(bridge.sender, '+60123456789');
    await assert.rejects(bridge.begin('admin'), /already linked/);
  } finally {
    bridge.paired = false;
    await bridge.stop();
    clearInterval(bridge.timer);
    await rm(directory, { recursive: true, force: true });
  }
});
