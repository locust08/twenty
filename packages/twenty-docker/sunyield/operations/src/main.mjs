import { checkHermes, hermesRequest, backupHermes } from './hermes.mjs';
import { checkWorker } from './worker.mjs';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import pg from 'pg';
import { ObjectStore } from './storage.mjs';
import { Snapshots } from './snapshots.mjs';
import { schedule } from './policy.mjs';
import { MirroredState } from './state.mjs';
import { reportCheck, sendEmail } from './monitor.mjs';

const required = [
  'R2_ENDPOINT',
  'R2_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'DATABASE_URL',
  'REDIS_URL',
  'SOURCE_S3_ENDPOINT',
  'SOURCE_S3_BUCKET',
  'SOURCE_S3_ACCESS_KEY_ID',
  'SOURCE_S3_SECRET_ACCESS_KEY',
  'RESEND_API_KEY',
  'ALERT_TO',
  'EMAIL_FROM',
  'SUNYIELD_WORKSPACE_ID',
  'CRM_HEALTH_URL',
];
for (const key of required)
  if (!process.env[key]) throw Error(`Missing ${key}`);
if (
  process.env.SUNYIELD_WORKSPACE_ID !==
    'e7e7d4f2-0f82-4a72-a12e-1f61494c61c6' ||
  process.env.R2_BUCKET !== 'sunyield-crm-backups'
)
  throw Error('Sunyield scope guard failed');
const destination = new ObjectStore({
  endpoint: process.env.R2_ENDPOINT,
  bucket: process.env.R2_BUCKET,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
});
const source = new ObjectStore({
  endpoint: process.env.SOURCE_S3_ENDPOINT,
  region: process.env.SOURCE_S3_REGION,
  bucket: process.env.SOURCE_S3_BUCKET,
  accessKeyId: process.env.SOURCE_S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.SOURCE_S3_SECRET_ACCESS_KEY,
});
const snapshots = new Snapshots({
  destination,
  source,
  databaseUrl: process.env.DATABASE_URL,
  workspaceId: process.env.SUNYIELD_WORKSPACE_ID,
});
const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  connectTimeout: 10000,
  commandTimeout: 15000,
});
connection.on('error', () => {});
const incidentStore = new MirroredState(destination, {
  readJson: async (key) =>
    JSON.parse((await connection.get('sunyield:operations:' + key)) || 'null'),
  writeJson: async (key, value) => {
    await connection.set('sunyield:operations:' + key, JSON.stringify(value));
  },
});
const queue = new Queue('email-queue', {
  connection,
  prefix: process.env.REDIS_QUEUE_PREFIX || 'bull',
});
let lastCheck = Date.now(),
  stopping = false,
  backupRunning = false,
  nextBackupAttempt = 0;
const enabled = process.env.OPERATIONS_ENABLED === 'true';
const monitoringEnabled = process.env.MONITORING_ENABLED !== 'false';
const backupAlertsEnabled = process.env.BACKUP_ALERTS_ENABLED !== 'false';
const log = (event, details = {}) =>
  console.log(
    JSON.stringify({ event, time: new Date().toISOString(), ...details }),
  );
const state = { enabled, monitoringEnabled, backupAlertsEnabled };
const reportBackupCheck = (name, healthy) =>
  reportCheck(incidentStore, sendEmail, name, healthy, '', backupAlertsEnabled);
let reportingHealthy = true,
  reportingIncidentSent = false;
http
  .createServer((request, response) => {
    if (request.url !== '/healthz') {
      response.writeHead(404);
      response.end();
      return;
    }
    const healthy =
      !enabled ||
      !monitoringEnabled ||
      (Date.now() - lastCheck < 300_000 && reportingHealthy);
    response.writeHead(healthy ? 200 : 503, {
      'Content-Type': 'application/json',
    });
    response.end(
      JSON.stringify({
        status: healthy ? 'ok' : 'stale',
        enabled,
        monitoringEnabled,
        backupAlertsEnabled,
      }),
    );
  })
  .listen(Number(process.env.PORT || 8080), '::');

const check = async (name, operation) => {
  let healthy = true;
  try {
    await operation();
  } catch {
    healthy = false;
  }
  state[name] = healthy;
  try {
    await reportCheck(incidentStore, sendEmail, name, healthy);
  } catch {
    reportingHealthy = false;
    log('monitor-report-failed', { check: name });
  }
  return healthy;
};
const probe = () => checkWorker(queue);
const databaseCheck = async () => {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
    query_timeout: 10000,
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
  } finally {
    await client.end();
  }
};
const fresh = async (kind, maxAge) => {
  const manifests = await snapshots.manifests(kind);
  const latest = manifests
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);
  if (!latest || Date.now() - new Date(latest.createdAt) > maxAge)
    throw Error('Backup overdue');
};
const monitor = async () => {
  reportingHealthy = true;
  await Promise.all([
    ...(process.env.SUNYIELD_HERMES_URL
      ? [
          check('whatsapp-notifications', async () =>
            checkHermes(await (await hermesRequest('/monitor/status')).json()),
          ),
        ]
      : []),
    check('crm-http', async () => {
      const response = await fetch(process.env.CRM_HEALTH_URL, {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw Error('HTTP health failed');
    }),
    check('backup-storage', async () => {
      await destination.readJson('state/restore-check.json');
    }),
    check('database', databaseCheck),
    check('redis', async () => {
      await connection.ping();
    }),
    check('worker-processing', probe),
    check('database-backup-freshness', () => fresh('database', 7 * 3600000)),
    check('files-backup-freshness', () => fresh('files', 26 * 3600000)),
  ]);
  if (!reportingHealthy && !reportingIncidentSent) {
    await sendEmail(
      '[Sunyield] Incident: monitoring state unavailable',
      'Monitoring cannot persist its incident state. Check Sunyield Operations logs and Redis/R2 connectivity.',
      'sunyield-monitor-state-' + new Date().toISOString().slice(0, 10),
    );
    reportingIncidentSent = true;
  }
  if (reportingHealthy && reportingIncidentSent) {
    await sendEmail(
      '[Sunyield] Recovery: monitoring state available',
      'Monitoring state storage has recovered.',
    );
    reportingIncidentSent = false;
  }
  lastCheck = Date.now();
  log('monitor-complete', { checks: state });
};
const backupCycle = async () => {
  const owner = randomUUID();
  const lock = 'sunyield:operations:backup-lock';
  if ((await connection.set(lock, owner, 'PX', 900000, 'NX')) !== 'OK') return;
  let leaseLost = false;
  const renewal = setInterval(() => {
    connection
      .eval(
        "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('pexpire',KEYS[1],ARGV[2]) else return 0 end",
        1,
        lock,
        owner,
        900000,
      )
      .then((result) => {
        if (result !== 1) leaseLost = true;
      })
      .catch(() => {
        leaseLost = true;
      });
  }, 60000);
  try {
    const slots = schedule(new Date());
    for (const kind of ['database', 'files']) {
      if (leaseLost) throw Error('Backup lease lost');
      const existing = await snapshots.manifests(kind);
      if (existing.some((snapshot) => snapshot.slot === slots[kind])) continue;
      try {
        const manifest = await snapshots.create(kind, slots[kind]);
        if (leaseLost) throw Error('Backup lease lost');
        log('backup-verified', {
          kind,
          id: manifest.id,
          objects: manifest.items.length,
        });
        await reportBackupCheck(`${kind}-backup-job`, true);
        await snapshots.prune(kind);
      } catch {
        await reportBackupCheck(`${kind}-backup-job`, false);
        log('backup-failed', { kind });
      }
    }
    if (process.env.SUNYIELD_HERMES_URL) {
      try {
        await backupHermes(destination, async () =>
          Buffer.from(
            await (await hermesRequest('/backup/ledger')).arrayBuffer(),
          ),
        );
        await reportBackupCheck('whatsapp-ledger-backup', true);
      } catch {
        await reportBackupCheck('whatsapp-ledger-backup', false);
      }
    }
    const month = new Date().toISOString().slice(0, 7);
    const previous = await destination.readJson('state/restore-check.json');
    if (previous?.month !== month) {
      try {
        const result = await snapshots.restoreLatest();
        await destination.writeJson('state/restore-check.json', {
          month,
          ...result,
        });
        await reportBackupCheck('restore-check', true);
        log('restore-verified', result);
      } catch {
        await reportBackupCheck('restore-check', false);
        log('restore-failed');
      }
    }
  } finally {
    clearInterval(renewal);
    await connection.eval(
      "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
      1,
      lock,
      owner,
    );
  }
};
process.on('SIGTERM', () => {
  stopping = true;
});
process.on('SIGINT', () => {
  stopping = true;
});
log('operations-started', { enabled, monitoringEnabled, backupAlertsEnabled });
if (enabled) {
  while (!stopping) {
    if (!backupRunning && Date.now() >= nextBackupAttempt) {
      backupRunning = true;
      nextBackupAttempt = Date.now() + 15 * 60000;
      backupCycle()
        .catch(() => log('backup-cycle-failed'))
        .finally(() => {
          backupRunning = false;
        });
    }
    if (monitoringEnabled) {
      try {
        await monitor();
      } catch {
        log('monitor-cycle-failed');
      }
    }
    await delay(60000);
  }
  while (backupRunning) await delay(1000);
  await queue.close();
  await connection.quit();
  process.exit(0);
}

if (process.env.OPERATIONS_ACCEPTANCE === 'true' && !enabled) {
  import('./acceptance.mjs').catch((error) => {
    console.error('Acceptance failed', error.name, error.message);
  });
}
