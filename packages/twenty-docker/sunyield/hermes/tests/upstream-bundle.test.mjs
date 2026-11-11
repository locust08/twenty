import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  chmod,
  rm,
  copyFile,
} from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
test('the pinned upstream build works offline and verifies every bundled production file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hermes-offline-'));
  try {
    const bin = join(directory, 'bin');
    await mkdir(bin);
    const curl = join(bin, 'curl');
    await writeFile(curl, '#!/bin/sh\nexit 22\n');
    await chmod(curl, 0o755);
    const output = join(directory, 'bridge');
    execFileSync(
      process.execPath,
      [join(root, 'scripts/fetch-upstream.mjs'), output],
      {
        env: { ...process.env, PATH: bin + delimiter + process.env.PATH },
        timeout: 30000,
        stdio: 'pipe',
      },
    );
    const manifest = JSON.parse(
      await readFile(join(root, 'upstream.json'), 'utf8'),
    );
    for (const [name, checksum] of Object.entries(manifest.files)) {
      if (name.includes('.test.')) continue;
      assert.equal(
        createHash('sha256')
          .update(await readFile(join(output, name)))
          .digest('hex'),
        checksum,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('an offline bundle with a mismatched manifest is rejected before installation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hermes-corrupt-bundle-'));
  try {
    await mkdir(join(directory, 'scripts'));
    await copyFile(
      join(root, 'scripts/fetch-upstream.mjs'),
      join(directory, 'scripts/fetch-upstream.mjs'),
    );
    await copyFile(
      join(root, 'upstream.tar.gz'),
      join(directory, 'upstream.tar.gz'),
    );
    const manifest = JSON.parse(
      await readFile(join(root, 'upstream.json'), 'utf8'),
    );
    manifest.files['allowlist.js'] = '0'.repeat(64);
    await writeFile(join(directory, 'upstream.json'), JSON.stringify(manifest));
    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          [
            join(directory, 'scripts/fetch-upstream.mjs'),
            join(directory, 'bridge'),
          ],
          { timeout: 30000, stdio: 'pipe' },
        ),
      /Upstream checksum mismatch/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
