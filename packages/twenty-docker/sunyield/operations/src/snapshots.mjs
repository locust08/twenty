import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { publishBackup } from './backups.mjs';
import { dumpDatabase, restoreDatabase } from './database.mjs';
import { retention } from './policy.mjs';

export class Snapshots {
  constructor({ destination, source, databaseUrl, workspaceId }) {
    Object.assign(this, { destination, source, databaseUrl, workspaceId });
  }
  async manifests(kind) {
    const objects = await this.destination.list(`snapshots/${kind}/`);
    const manifests = [];
    for (const item of objects.filter((item) =>
      item.Key.endsWith('/manifest.json'),
    )) {
      const value = await this.destination.readJson(item.Key);
      if (value?.verified) manifests.push({ ...value, manifestKey: item.Key });
    }
    return manifests;
  }
  async create(kind, slot) {
    const directory = await mkdtemp(join(tmpdir(), 'sunyield-backup-'));
    const id =
      new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID();
    const prefix = `snapshots/${kind}/${id}/`;
    try {
      const manifest = await publishBackup({
        kind,
        slot,
        create: async () => {
          const items = [];
          if (kind === 'database') {
            const path = join(directory, 'database.dump');
            await dumpDatabase(this.databaseUrl, path, this.workspaceId);
            items.push(
              await this.destination.upload(prefix + 'database.dump', path),
            );
          } else {
            const before = await this.source.list('');
            for (const [index, item] of before.entries()) {
              const path = join(directory, 'source');
              await this.source.download(item.Key, path, item.ETag);
              items.push({
                ...(await this.destination.upload(
                  prefix + String(index).padStart(8, '0'),
                  path,
                )),
                sourceKey: item.Key,
                sourceEtag: item.ETag,
              });
            }
            const fingerprint = (list) =>
              JSON.stringify(
                list
                  .map((item) => [item.Key, item.ETag, item.Size])
                  .sort((a, b) => a[0].localeCompare(b[0])),
              );
            if (fingerprint(before) !== fingerprint(await this.source.list('')))
              throw Error('Source files changed during backup; retry required');
          }
          return { id, items };
        },
        verify: async (snapshot) => {
          for (const item of snapshot.items)
            await this.destination.verify(item, join(directory, 'verified'));
        },
        restore: async () => {
          await restoreDatabase(join(directory, 'verified'), this.workspaceId);
        },
        publish: async (manifest) =>
          this.destination.writeJson(prefix + 'manifest.json', manifest),
      });
      return manifest;
    } catch (error) {
      try {
        await this.destination.remove(
          (await this.destination.list(prefix)).map((item) => item.Key),
        );
      } catch {
        console.error('Incomplete backup cleanup failed');
      }
      throw error;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  async prune(kind) {
    const objects = await this.destination.list(`snapshots/${kind}/`);
    const groups = new Map();
    for (const object of objects) {
      const prefix = object.Key.split('/').slice(0, 3).join('/') + '/';
      if (!groups.has(prefix)) groups.set(prefix, []);
      groups.get(prefix).push(object);
    }
    for (const group of groups.values()) {
      if (
        !group.some((item) => item.Key.endsWith('/manifest.json')) &&
        group.every(
          (item) => Date.now() - new Date(item.LastModified) > 86400000,
        )
      )
        await this.destination.remove(group.map((item) => item.Key));
    }
    const snapshots = await this.manifests(kind);
    const ids = retention(snapshots, new Date());
    for (const snapshot of snapshots.filter((snapshot) =>
      ids.includes(snapshot.id),
    )) {
      const prefix = `snapshots/${kind}/${snapshot.id}/`;
      if (snapshot.items.some((item) => !item.key.startsWith(prefix)))
        throw Error('Invalid retention manifest');
      await this.destination.remove([
        ...snapshot.items.map((item) => item.key),
        snapshot.manifestKey,
      ]);
    }
  }
  async restoreLatest() {
    const directory = await mkdtemp(join(tmpdir(), 'sunyield-monthly-'));
    try {
      const database = (await this.manifests('database'))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .at(-1);
      const files = (await this.manifests('files'))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .at(-1);
      if (!database || !files) throw Error('Recovery set incomplete');
      const path = join(directory, 'restore');
      for (const item of database.items)
        await this.destination.verify(item, path);
      await restoreDatabase(path, this.workspaceId);
      for (const item of files.items) await this.destination.verify(item, path);
      return {
        checkedAt: new Date().toISOString(),
        databaseId: database.id,
        filesId: files.id,
        objectCount: files.items.length,
      };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
