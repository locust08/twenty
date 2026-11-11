import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export const checkHermes = async (state) => {
  if (
    typeof state.enabled !== 'boolean' ||
    typeof state.connected !== 'boolean' ||
    ![state.unknown, state.failed, state.overdue].every(
      (value) => typeof value === 'number' && value >= 0,
    )
  )
    throw Error('Invalid Hermes health');
  if (
    (state.enabled && (!state.connected || state.observerHealthy !== true)) ||
    state.unknown ||
    state.failed ||
    state.overdue
  )
    throw Error('WhatsApp requires attention');
};
export const hermesRequest = async (path) => {
  const base = process.env.SUNYIELD_HERMES_URL;
  const token = process.env.SUNYIELD_HERMES_BACKUP_TOKEN;
  if (!base || !token) throw Error('Hermes monitoring not configured');
  const url = new URL(base);
  if (url.protocol !== 'http:' || !url.hostname.endsWith('.railway.internal'))
    throw Error('Invalid private Hermes endpoint');
  const response = await fetch(url.origin + path, {
    headers: { Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(30000),
    redirect: 'error',
  });
  if (!response.ok) throw Error('Hermes request failed');
  return response;
};
export const backupHermes = async (store, download, now = new Date()) => {
  const day = now.toISOString().slice(0, 10),
    prefix = 'hermes-ledger/' + day + '/';
  if (await store.readJson(prefix + 'manifest.json')) return;
  const directory = await mkdtemp(join(tmpdir(), 'hermes-ledger-'));
  try {
    const body = await download();
    if (
      body.length > 100000000 ||
      body.subarray(0, 16).toString() !== 'SQLite format 3\0'
    )
      throw Error('Invalid ledger snapshot');
    const path = join(directory, 'ledger.db');
    await writeFile(path, body, { mode: 0o600 });
    const item = await store.upload(prefix + 'ledger.db', path);
    await store.verify(item, join(directory, 'verified.db'));
    await store.writeJson(prefix + 'manifest.json', {
      createdAt: now.toISOString(),
      verified: true,
      items: [item],
    });
    const expired = (await store.list('hermes-ledger/'))
      .filter(
        (item) =>
          /^hermes-ledger\/\d{4}-\d{2}-\d{2}\/(ledger.db|manifest.json)$/.test(
            item.Key,
          ) && now - new Date(item.Key.split('/')[1]) > 30 * 86400000,
      )
      .map((item) => item.Key);
    if (expired.length) await store.remove(expired);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
