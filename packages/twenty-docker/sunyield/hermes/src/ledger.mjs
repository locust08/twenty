import { randomUUID } from 'node:crypto';
import { initializeJobs } from './initialize-jobs.mjs';
import { DatabaseSync, backup } from 'node:sqlite';
export class Ledger {
  constructor(path) {
    this.database = new DatabaseSync(path);
    this.database.exec(
      `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);`,
    );
    initializeJobs(this.database);
    this.database.exec(
      'CREATE TABLE IF NOT EXISTS testNotifications(requestId TEXT PRIMARY KEY,memberId TEXT NOT NULL,recipient TEXT NOT NULL,createdAt INTEGER NOT NULL,state TEXT NOT NULL,messageId TEXT)',
    );
    this.database.exec(
      'CREATE TABLE IF NOT EXISTS deliveryReceipts(messageId TEXT PRIMARY KEY,receivedAt INTEGER NOT NULL)',
    );
    this.database.exec(
      'CREATE TABLE IF NOT EXISTS assignmentTests(requestId TEXT PRIMARY KEY,leadId TEXT NOT NULL UNIQUE,memberId TEXT NOT NULL,recipient TEXT NOT NULL,armedAt INTEGER NOT NULL,expiresAt INTEGER NOT NULL,state TEXT NOT NULL,reason TEXT,assignedSalespersonId TEXT,assignedAt TEXT,messageId TEXT)',
    );
    if (
      !this.database
        .prepare('PRAGMA table_info(assignmentTests)')
        .all()
        .some((column) => column.name === 'kind')
    ) {
      this.database.exec(
        "ALTER TABLE assignmentTests ADD COLUMN kind TEXT NOT NULL DEFAULT 'initial-assignment' CHECK(kind IN ('initial-assignment','commercial-awaiting-assignment'))",
      );
    }
    this.database
      .prepare("INSERT OR IGNORE INTO settings VALUES('paused','true')")
      .run();
    this.database
      .prepare(
        "UPDATE jobs SET state='delivery-unknown',reason='interrupted_submission' WHERE state='sending'",
      )
      .run();
  }
  setting(key) {
    return this.database
      .prepare('SELECT value FROM settings WHERE key=?')
      .get(key)?.value;
  }
  set(key, value) {
    this.database
      .prepare(
        'INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run(key, String(value));
  }
  activate(cutoff) {
    if (!Number.isFinite(Date.parse(cutoff))) throw Error('Invalid activation');
    if (this.setting('activation')) throw Error('Activation already recorded');
    this.set('activation', cutoff);
  }
  pause(value) {
    this.set('paused', Boolean(value));
  }
  list() {
    return this.database
      .prepare('SELECT * FROM jobs ORDER BY createdAt,id')
      .all();
  }
  get(id) {
    return this.database.prepare('SELECT * FROM jobs WHERE id=?').get(id);
  }
  put(lead, state, reason, key, recipient, kind = 'initial-assignment') {
    const existing = this.database
      .prepare('SELECT * FROM jobs WHERE leadId=? AND kind=?')
      .get(lead.id, kind);
    if (
      existing &&
      (existing.state !== 'held' ||
        existing.reason !== 'assignment_or_recipient_missing')
    )
      return;
    this.database
      .prepare(
        'INSERT INTO jobs(id,leadId,state,reason,assignmentKey,recipient,createdAt,kind) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,reason=excluded.reason,assignmentKey=excluded.assignmentKey,recipient=excluded.recipient',
      )
      .run(
        existing?.id ??
          (kind === 'initial-assignment' ? lead.id : randomUUID()),
        lead.id,
        state,
        reason,
        key,
        recipient,
        Date.now(),
        kind,
      );
  }
  update(id, state, reason = null) {
    this.database
      .prepare('UPDATE jobs SET state=?,reason=? WHERE id=?')
      .run(state, reason, id);
  }
  claim(id, hash) {
    const result = this.database
      .prepare(
        "UPDATE jobs SET state='sending',messageHash=?,reason=NULL WHERE id=? AND state='pending'",
      )
      .run(hash, id);
    return result.changes === 1;
  }
  submitted(id, messageId) {
    this.database
      .prepare(
        "UPDATE jobs SET state=CASE WHEN EXISTS(SELECT 1 FROM deliveryReceipts WHERE messageId=?) THEN 'delivered' ELSE 'submitted' END,messageId=?,reason=NULL WHERE id=? AND state='sending'",
      )
      .run(messageId, messageId, id);
  }
  receipt(messageId, status) {
    if (!['delivered', 'read', 'played'].includes(status)) return;
    this.database
      .prepare('DELETE FROM deliveryReceipts WHERE receivedAt<?')
      .run(Date.now() - 7 * 86400000);
    this.database
      .prepare(
        'INSERT OR IGNORE INTO deliveryReceipts(messageId,receivedAt) VALUES(?,?)',
      )
      .run(messageId, Date.now());
    this.database
      .prepare(
        "UPDATE jobs SET state='delivered',reason=NULL WHERE messageId=? AND state IN ('submitted','delivered')",
      )
      .run(messageId);
    this.database
      .prepare(
        "UPDATE testNotifications SET state='delivered' WHERE messageId=? AND state IN ('submitted','delivered')",
      )
      .run(messageId);
    this.database
      .prepare(
        "UPDATE assignmentTests SET state='delivered' WHERE messageId=? AND state IN ('submitted','delivered')",
      )
      .run(messageId);
  }
  defer(id, now) {
    const job = this.get(id);
    const delays = [30000, 120000, 600000];
    if (job.attempts >= delays.length) {
      this.update(id, 'held', 'bridge_unavailable');
      return;
    }
    this.database
      .prepare(
        'UPDATE jobs SET attempts=attempts+1,nextAttempt=?,reason=? WHERE id=?',
      )
      .run(now + delays[job.attempts], 'bridge_unavailable', id);
  }
  retry(id, acknowledge) {
    const job = this.get(id);
    if (
      !job ||
      !['held', 'failed', 'cancelled', 'delivery-unknown'].includes(job.state)
    )
      throw Error('Job cannot be retried');
    if (job.state === 'delivery-unknown' && !acknowledge)
      throw Error('Duplicate delivery acknowledgement required');
    this.database
      .prepare(
        "UPDATE jobs SET state='pending',reason=NULL,nextAttempt=0,attempts=0 WHERE id=?",
      )
      .run(id);
  }
  async snapshot(path) {
    await backup(this.database, path);
  }
}
