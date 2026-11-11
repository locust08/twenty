import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import QRCode from 'qrcode';
import { notification } from './notification.mjs';
import { TestNotification } from './test-notification.mjs';
import { AssignmentTest } from './assignment-test.mjs';
import { ResumeControl } from './resume.mjs';
const authorized = (request, token) => {
  if (!token) return false;
  const actual = Buffer.from(request.headers.authorization || '');
  const expected = Buffer.from('Bearer ' + token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
export const createControlServer = ({
  ledger,
  bridge,
  reader,
  adminToken,
  backupToken,
  enabled = false,
  expectedSender,
  assignmentTest = new AssignmentTest({ ledger, bridge, reader, enabled }),
  getObserverHealthy = () => true,
}) => {
  const resumeControl = new ResumeControl({
    ledger,
    bridge,
    reader,
    enabled,
    expectedSender,
  });
  const testNotification = new TestNotification({ ledger, bridge, enabled });
  const status = async (offset = 0) => {
    const health = await bridge.health();
    return {
      ...(await resumeControl.readiness(health)),
      sendingEnabled:
        enabled &&
        ledger.setting('paused') === 'false' &&
        Boolean(ledger.setting('activation')),
      paired: bridge.paired,
      connected: health.connected,
      sender: health.sender || null,
      paused: ledger.setting('paused') !== 'false',
      lastTest: testNotification.latest(),
      lastAssignmentTest: assignmentTest.latest(),
      nextOffset: offset + 100 < ledger.list().length ? offset + 100 : null,
      jobs: ledger
        .list()
        .slice(offset, offset + 100)
        .map(({ id, state, reason, leadId, kind }) => ({
          id,
          state,
          reason,
          leadId,
          kind,
        })),
    };
  };
  return http.createServer(async (request, response) => {
    const json = (code, value) => {
      response.writeHead(code, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(JSON.stringify(value));
    };
    try {
      if (request.method === 'GET' && request.url === '/healthz')
        return json(200, { status: 'ok', sendingEnabled: enabled });
      if (request.method === 'GET' && request.url === '/monitor/status') {
        if (!authorized(request, backupToken))
          return json(403, { error: 'Forbidden' });
        const health = await bridge.health();
        const jobs = ledger.list();
        return json(200, {
          enabled,
          observerHealthy: getObserverHealthy(),
          connected: health.connected,
          unknown: jobs.filter((job) => job.state === 'delivery-unknown')
            .length,
          failed: jobs.filter((job) => job.state === 'failed').length,
          overdue: jobs.filter(
            (job) =>
              ['pending', 'held'].includes(job.state) &&
              Date.now() - job.createdAt > 600000,
          ).length,
        });
      }
      if (request.method === 'GET' && request.url === '/backup/ledger') {
        if (!authorized(request, backupToken))
          return json(403, { error: 'Forbidden' });
        const directory = await mkdtemp(join(tmpdir(), 'hermes-ledger-'));
        try {
          const path = join(directory, 'ledger.db');
          await ledger.snapshot(path);
          response.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Cache-Control': 'no-store',
          });
          await pipeline(createReadStream(path), response);
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
        return;
      }
      if (!authorized(request, adminToken))
        return json(403, { error: 'Forbidden' });
      if (request.method === 'GET' && request.url === '/admin/status')
        return json(200, await status());
      if (request.method !== 'POST' || request.url !== '/admin/control')
        return json(404, { error: 'Not found' });
      let text = '';
      for await (const chunk of request) {
        text += chunk;
        if (text.length > 4096)
          return json(413, { error: 'Request too large' });
      }
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        return json(400, { error: 'Invalid control' });
      }
      if (
        !body ||
        typeof body.memberId !== 'string' ||
        body.memberId.length > 100
      )
        return json(400, { error: 'Invalid member' });
      const fields = {
        pair: ['action', 'memberId'],
        'pair-status': ['action', 'memberId', 'sessionId'],
        'cancel-pair': ['action', 'memberId', 'sessionId'],
        pause: ['action', 'memberId'],
        resume: ['action', 'memberId', 'acknowledge'],
        retry: ['action', 'memberId', 'jobId', 'acknowledge'],
        'queue-page': ['action', 'memberId', 'offset'],
        'send-test': ['action', 'memberId', 'requestId', 'expectedSender'],
        'arm-assignment-test': [
          'action',
          'memberId',
          'requestId',
          'leadId',
          'expectedSender',
          'kind',
        ],
        'cancel-assignment-test': ['action', 'memberId', 'requestId'],
        unpair: ['action', 'memberId', 'acknowledge'],
      }[body.action];
      if (!fields || Object.keys(body).some((key) => !fields.includes(key)))
        return json(400, { error: 'Invalid control' });
      if (body.action === 'resume')
        await resumeControl.resume(body.acknowledge);
      if (body.action === 'arm-assignment-test') await assignmentTest.arm(body);
      if (body.action === 'cancel-assignment-test')
        assignmentTest.cancel(body.requestId);
      if (body.action === 'send-test') {
        await testNotification.send(body);
        return json(200, await status());
      }
      if (body.action === 'queue-page') {
        if (
          !Number.isInteger(body.offset) ||
          body.offset < 0 ||
          body.offset > 1000000
        )
          return json(400, { error: 'Invalid page' });
        return json(200, await status(body.offset));
      }
      if (body.action === 'pair') {
        const session = await bridge.begin(body.memberId);
        return json(200, {
          ...(await status()),
          sessionId: session.id,
          expiresAt: session.expiresAt,
        });
      }
      if (body.action === 'pair-status') {
        const session = bridge.pairing.read(body.memberId, body.sessionId);
        return json(200, {
          ...(await status()),
          sessionId: session.id,
          expiresAt: session.expiresAt,
          qr: session.qr
            ? await QRCode.toDataURL(session.qr, { width: 280, margin: 2 })
            : null,
        });
      }
      if (body.action === 'cancel-pair') {
        bridge.pairing.read(body.memberId, body.sessionId);
        resumeControl.setDeviceChanging(true);
        assignmentTest.cancelActive('device_changed');
        try {
          await bridge.cancel(body.memberId, body.sessionId);
        } finally {
          resumeControl.setDeviceChanging(false);
        }
      }
      if (body.action === 'pause') {
        resumeControl.pause();
        assignmentTest.cancelActive('operator_paused');
      }
      if (body.action === 'unpair') {
        if (body.acknowledge !== true)
          return json(400, { error: 'Confirmation required' });
        resumeControl.setDeviceChanging(true);
        assignmentTest.cancelActive('device_revoked');
        try {
          await bridge.unpair();
        } finally {
          resumeControl.setDeviceChanging(false);
        }
      }
      if (body.action === 'retry') {
        if (typeof body.jobId !== 'string' || !reader)
          return json(400, { error: 'Invalid job' });
        const job = ledger.get(body.jobId);
        if (!job) return json(404, { error: 'Notification not found' });
        const lead = await reader.get(job.leadId);
        const current = notification(
          lead,
          job.kind,
          expectedSender,
          ledger.setting('commercial-alert-cutoff'),
        );
        if (!current)
          return json(409, {
            error:
              'Notification is no longer eligible or its recipient is unavailable',
          });
        ledger.retry(body.jobId, body.acknowledge === true);
        ledger.database
          .prepare('UPDATE jobs SET assignmentKey=?,recipient=? WHERE id=?')
          .run(current.key, current.recipient, body.jobId);
      }
      return json(200, await status());
    } catch {
      if (!response.headersSent)
        json(409, {
          error:
            'Control could not be confirmed. Refresh status before retrying.',
        });
      else response.destroy();
    }
  });
};
