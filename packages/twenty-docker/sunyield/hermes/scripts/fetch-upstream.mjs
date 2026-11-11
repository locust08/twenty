import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const manifest = JSON.parse(
  await readFile(new URL('../upstream.json', import.meta.url), 'utf8'),
);
if (!/^[a-f0-9]{40}$/.test(manifest.commit)) throw Error('Invalid pin');
const directory = process.argv[2];
await mkdir(directory, { recursive: true });
for (const [name, hash] of Object.entries(manifest.files)) {
  if (name.includes('.test.') || !/^[a-z0-9_.-]+$/.test(name)) continue;
  const body = execFileSync(
    'tar',
    [
      '-xzOf',
      fileURLToPath(new URL('../upstream.tar.gz', import.meta.url)),
      name,
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  if (createHash('sha256').update(body).digest('hex') !== hash)
    throw Error('Upstream checksum mismatch');
  await writeFile(join(directory, name), body);
}
