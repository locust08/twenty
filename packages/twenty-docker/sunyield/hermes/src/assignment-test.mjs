import { notification } from './notification.mjs';
import { formatLead, normalizePhone } from './policy.mjs';

export class AssignmentTest {
  constructor({ ledger, bridge, reader, enabled, now = Date.now }) {
    Object.assign(this, { ledger, bridge, reader, enabled, now });
    this.cancelVersion = 0;
    ledger.database
      .prepare(
        "UPDATE assignmentTests SET state='delivery-unknown',reason='interrupted_submission' WHERE state='sending'",
      )
      .run();
  }
  latest() {
    const row = this.ledger.database
      .prepare(
        'SELECT requestId,leadId,recipient,armedAt,expiresAt,state,reason,assignedSalespersonId,assignedAt,kind FROM assignmentTests ORDER BY armedAt DESC,rowid DESC LIMIT 1',
      )
      .get();
    return row ? { ...row } : null;
  }
  async arm({
    requestId,
    leadId,
    memberId,
    expectedSender,
    kind = 'initial-assignment',
  }) {
    if (
      !['initial-assignment', 'commercial-awaiting-assignment'].includes(
        kind,
      ) ||
      ![requestId, leadId].every(
        (value) =>
          typeof value === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value,
          ),
      ) ||
      typeof memberId !== 'string' ||
      !memberId ||
      memberId.length > 100 ||
      !normalizePhone(expectedSender)
    )
      throw Error('Invalid assignment test');
    const prior = this.ledger.database
      .prepare('SELECT * FROM assignmentTests WHERE requestId=?')
      .get(requestId);
    if (prior) {
      if (
        prior.leadId !== leadId ||
        prior.memberId !== memberId ||
        prior.recipient !== expectedSender ||
        prior.kind !== kind
      )
        throw Error('Test request identity changed');
      return;
    }
    const cancelVersion = this.cancelVersion;
    const health = await this.bridge.health();
    if (
      cancelVersion !== this.cancelVersion ||
      this.enabled !== false ||
      this.ledger.setting('paused') !== 'true' ||
      !health.connected ||
      normalizePhone(health.sender) !== expectedSender
    )
      throw Error('Disabled, paused and connected account required');
    const repeated = this.ledger.database
      .prepare('SELECT requestId FROM assignmentTests WHERE requestId=?')
      .get(requestId);
    if (repeated)
      return this.arm({ requestId, leadId, memberId, expectedSender, kind });
    if (
      this.ledger.database
        .prepare(
          "SELECT requestId FROM assignmentTests WHERE state IN ('waiting','sending','delivery-unknown') LIMIT 1",
        )
        .get()
    )
      throw Error('An unresolved assignment test already exists');
    const latest = this.latest();
    if (latest && this.now() - latest.armedAt < 60000)
      throw Error('Assignment test cooldown');
    const armedAt = this.now();
    this.ledger.database
      .prepare(
        'INSERT INTO assignmentTests(requestId,leadId,memberId,recipient,armedAt,expiresAt,state,kind) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        requestId,
        leadId,
        memberId,
        health.sender,
        armedAt,
        armedAt + 600000,
        'waiting',
        kind,
      );
  }
  cancel(requestId, reason = 'operator_cancelled') {
    this.cancelVersion++;
    this.ledger.database
      .prepare(
        "UPDATE assignmentTests SET state='cancelled',reason=? WHERE requestId=? AND state='waiting'",
      )
      .run(reason, requestId);
  }
  cancelActive(reason) {
    this.cancelVersion++;
    this.ledger.database
      .prepare(
        "UPDATE assignmentTests SET state='cancelled',reason=? WHERE state='waiting'",
      )
      .run(reason);
  }
  waiting(requestId) {
    return this.ledger.database
      .prepare(
        "SELECT * FROM assignmentTests WHERE requestId=? AND state='waiting'",
      )
      .get(requestId);
  }
  guard(row) {
    if (!this.waiting(row.requestId)) return false;
    if (this.enabled !== false || this.ledger.setting('paused') !== 'true') {
      this.cancel(row.requestId, 'production_gate_changed');
      return false;
    }
    if (this.now() >= row.expiresAt) {
      this.ledger.database
        .prepare(
          "UPDATE assignmentTests SET state='expired',reason='lease_expired' WHERE requestId=? AND state='waiting'",
        )
        .run(row.requestId);
      return false;
    }
    return true;
  }
  async tick() {
    const row = this.ledger.database
      .prepare(
        "SELECT * FROM assignmentTests WHERE state='waiting' ORDER BY armedAt LIMIT 1",
      )
      .get();
    if (!row || !this.guard(row)) return;
    let lead;
    try {
      lead = await this.reader.get(row.leadId);
    } catch {
      return;
    }
    if (!this.guard(row) || !lead) return;
    const createdAt = Date.parse(lead.createdAt);
    if (
      lead.id !== row.leadId ||
      lead.deletedAt ||
      !Number.isFinite(createdAt) ||
      createdAt < row.armedAt ||
      createdAt >= row.expiresAt ||
      createdAt > this.now() ||
      lead.name !==
        (row.kind === 'commercial-awaiting-assignment'
          ? 'QA COMMERCIAL NOTIFICATION TEST '
          : 'QA ASSIGNMENT NOTIFICATION TEST ') +
          row.leadId ||
      lead.source !==
        (row.kind === 'commercial-awaiting-assignment'
          ? 'GOOGLE_ADS'
          : 'FACEBOOK') ||
      (row.kind === 'initial-assignment' && lead.leadType !== 'RESIDENTIAL') ||
      lead.phone !== 'TEST ONLY — no real phone' ||
      lead.area !== 'QA test only — no real customer' ||
      lead.bill !== 'RM 500 (dummy test)'
    ) {
      this.cancel(row.requestId, 'invalid_synthetic_lead');
      return;
    }
    let message;
    if (row.kind === 'commercial-awaiting-assignment') {
      const current = notification(
        lead,
        row.kind,
        row.recipient,
        new Date(row.armedAt).toISOString(),
      );
      if (!current) {
        this.cancel(row.requestId, 'invalid_commercial_test');
        return;
      }
      message =
        'TEST ONLY — Commercial lead admin notification\nSynthetic Commercial lead; routed to the marketing account. Production sending remains disabled.\n\n' +
        current.message;
    } else {
      if (
        lead.assignmentState !== 'ASSIGNED' ||
        !lead.assignedSalespersonId ||
        !lead.assignedAt
      )
        return;
      const assignedAt = Date.parse(lead.assignedAt);
      if (
        lead.salespersonActive !== true ||
        !Number.isSafeInteger(lead.salespersonRotationOrder) ||
        lead.salespersonRotationOrder <= 0 ||
        !Number.isFinite(assignedAt) ||
        assignedAt < createdAt ||
        assignedAt > this.now()
      ) {
        this.cancel(row.requestId, 'invalid_assignment');
        return;
      }
      message =
        'TEST ONLY — Automatic assignment notification\nSynthetic test lead; routed to the marketing account. Production sending remains disabled.\n\n' +
        formatLead(lead);
    }
    let health;
    try {
      health = await this.bridge.health();
    } catch {
      return;
    }
    if (!this.guard(row)) return;
    if (health.sender && normalizePhone(health.sender) !== row.recipient) {
      this.cancel(row.requestId, 'marketing_sender_changed');
      return;
    }
    if (!health.connected || normalizePhone(health.sender) !== row.recipient)
      return;
    const claimed = this.ledger.database
      .prepare(
        "UPDATE assignmentTests SET state='sending',assignedSalespersonId=?,assignedAt=? WHERE requestId=? AND state='waiting'",
      )
      .run(
        lead.assignedSalespersonId ?? null,
        lead.assignedAt ?? null,
        row.requestId,
      );
    if (claimed.changes !== 1) return;
    let state = 'submitted',
      messageId = null;
    try {
      messageId = await this.bridge.send(health.sender, message);
      if (!messageId) throw Error('Submission unconfirmed');
    } catch (error) {
      state = error?.preSubmission === true ? 'failed' : 'delivery-unknown';
    }
    this.ledger.database
      .prepare(
        "UPDATE assignmentTests SET state=CASE WHEN ?='submitted' AND EXISTS(SELECT 1 FROM deliveryReceipts WHERE messageId=?) THEN 'delivered' ELSE ? END,messageId=? WHERE requestId=? AND state='sending'",
      )
      .run(state, messageId, state, messageId, row.requestId);
  }
}
