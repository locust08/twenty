import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

export const command = (binary, args, env = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let diagnostic = '';
    child.stderr.on('data', (chunk) => {
      diagnostic = (diagnostic + chunk).slice(-1000);
    });
    const timeout = setTimeout(() => child.kill('SIGKILL'), 300_000);
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(Error(`${binary} failed (${code})`));
    });
  });
export const databaseEnvironment = (connectionString) => {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw Error('Invalid database protocol');
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGCONNECT_TIMEOUT: '15',
    PGOPTIONS:
      '-c statement_timeout=240000 -c default_transaction_read_only=on',
  };
};
export const dumpDatabase = async (url, path, workspaceId) => {
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 15000,
    query_timeout: 15000,
  });
  try {
    await client.connect();
    const result = await client.query(
      'SELECT id FROM core.workspace WHERE id=$1 AND "deletedAt" IS NULL',
      [workspaceId],
    );
    if (result.rowCount !== 1) throw Error('Sunyield database guard failed');
  } finally {
    await client.end();
  }
  await command(
    'pg_dump',
    ['--format=custom', '--no-owner', '--no-acl', '--file', path],
    databaseEnvironment(url),
  );
};
export const restoreDatabase = async (archive, workspaceId) => {
  const directory = await mkdtemp(join(tmpdir(), 'sunyield-restore-'));
  const data = join(directory, 'data'),
    socket = join(directory, 'socket');
  await mkdir(socket);
  const env = {
    PGHOST: socket,
    PGPORT: '55432',
    PGUSER: 'postgres',
    PGDATABASE: 'restore_check',
    PGPASSWORD: '',
    PGOPTIONS: '',
    PGCONNECT_TIMEOUT: '10',
  };
  let started = false;
  try {
    await command('initdb', [
      '-D',
      data,
      '-U',
      'postgres',
      '--auth-local=trust',
      '--auth-host=reject',
      '--no-locale',
    ]);
    await command('pg_ctl', [
      '-D',
      data,
      '-l',
      join(directory, 'postgres.log'),
      '-o',
      `-k ${socket} -p 55432 -c listen_addresses='' -c shared_buffers=32MB`,
      '-w',
      'start',
    ]);
    started = true;
    await command('createdb', ['restore_check'], env);
    await command(
      'pg_restore',
      [
        '--exit-on-error',
        '--no-owner',
        '--no-acl',
        '--dbname=restore_check',
        archive,
      ],
      env,
    );
    const client = new pg.Client({
      host: socket,
      port: 55432,
      user: 'postgres',
      database: 'restore_check',
    });
    try {
      await client.connect();
      const result = await client.query(
        'SELECT id FROM core.workspace WHERE id=$1',
        [workspaceId],
      );
      if (result.rowCount !== 1) throw Error('Restored workspace missing');
      await client.query(
        'SELECT count(*) FROM information_schema.tables WHERE table_schema LIKE $1',
        ['workspace_%'],
      );
    } finally {
      await client.end();
    }
  } finally {
    if (started)
      await command('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    await rm(directory, { recursive: true, force: true });
  }
};
