import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const checked = spawnSync(
  path.join(root, 'node_modules', '.bin', 'tsc'),
  ['--noEmit'],
  { stdio: 'inherit', cwd: root },
);
if (checked.status !== 0) process.exit(checked.status ?? 1);
const staging = path.join(root, '.twenty', 'build-source');
await mkdir(staging, { recursive: true });
await cp(path.join(root, 'src'), path.join(staging, 'src'), {
  recursive: true,
});
for (const file of ['package.json', 'tsconfig.json'])
  await cp(path.join(root, file), path.join(staging, file));

// Twenty's extractor requires default definitions; authored sources retain named exports.
const definitions = {
  'application-config.ts': 'application',
  'roles/status-role.ts': 'statusRole',
  'roles/sales-role.ts': 'salesRole',
  'logic-functions/update-status-route.ts': 'statusRoute',
  'front-components/update-status.tsx': 'statusFront',
  'command-menu-items/update-status.ts': 'statusCommand',
};
for (const [file, name] of Object.entries(definitions)) {
  const destination = path.join(staging, 'src', file);
  const source = await readFile(destination, 'utf8');
  await writeFile(
    destination,
    source.replace(`export const ${name} = `, 'export default '),
  );
}
const result = spawnSync(
  path.join(root, 'node_modules', '.bin', 'twenty'),
  ['dev:build', staging],
  { stdio: 'inherit', cwd: root },
);
process.exit(result.status ?? 1);
