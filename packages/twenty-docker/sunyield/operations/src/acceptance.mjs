import { ObjectStore } from './storage.mjs';
import { Snapshots } from './snapshots.mjs';
import { schedule } from './policy.mjs';
import { sendEmail, reportCheck } from './monitor.mjs';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
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
const accepted = await destination.readJson('state/acceptance.json');
if (accepted?.complete) {
  console.log('Acceptance already completed');
} else {
  const slots = schedule(new Date());
  for (const kind of ['database', 'files']) {
    const existing = await snapshots.manifests(kind);
    if (!existing.some((item) => item.slot === slots[kind])) {
      const result = await snapshots.create(kind, slots[kind]);
      console.log(
        'PASS ' +
          kind +
          ' backup and verification: ' +
          result.items.length +
          ' objects',
      );
    } else console.log('PASS existing verified ' + kind + ' snapshot');
  }
  const restored = await snapshots.restoreLatest();
  console.log('PASS isolated R2 restore ' + JSON.stringify(restored));
  await destination.writeJson('state/restore-check.json', {
    month: new Date().toISOString().slice(0, 7),
    ...restored,
  });
  const connection = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
  });
  const queue = new Queue('email-queue', {
    connection,
    prefix: process.env.REDIS_QUEUE_PREFIX || 'bull',
  });
  try {
    const id = 'sunyield-acceptance-' + Date.now();
    const job = await queue.add(
      'SunyieldWorkerProbeJob',
      {},
      {
        jobId: id,
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 3600 },
      },
    );
    for (let i = 0; i < 30; i++) {
      if ((await job.getState()) === 'completed') break;
      if (i === 29) throw Error('Worker probe did not complete');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    console.log('PASS actual worker probe completed');
    const email = await queue.add(
      'EmailSenderJob',
      {
        from: process.env.EMAIL_FROM,
        to: process.env.ALERT_TO,
        replyTo: process.env.ALERT_TO,
        subject: 'Sunyield CRM — email delivery verification',
        text: 'Sunyield CRM system email delivery is now configured through Resend. This test was sent through Twenty’s real email worker. No CRM records were modified.',
      },
      {
        jobId: id + '-email',
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 3600 },
      },
    );
    for (let i = 0; i < 30; i++) {
      const state = await email.getState();
      if (state === 'completed') break;
      if (state === 'failed')
        throw Error('System email job failed: ' + email.failedReason);
      if (i === 29) throw Error('Email job did not complete');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    console.log('PASS system email accepted through Twenty worker');
    await reportCheck(
      destination,
      sendEmail,
      'acceptance-test',
      false,
      'Planned alert verification. The CRM has not been taken offline.',
    );
    await reportCheck(
      destination,
      sendEmail,
      'acceptance-test',
      true,
      'Planned alert verification completed.',
    );
    console.log('PASS incident/recovery test emails accepted');
  } finally {
    await queue.close();
    await connection.quit();
  }

  await destination.writeJson('state/acceptance.json', {
    complete: true,
    checkedAt: new Date().toISOString(),
  });
}
