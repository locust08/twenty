import { formatLead, normalizePhone } from './policy.mjs';

const TEST_MESSAGE =
  'TEST ONLY — Dummy lead notification\nNo real lead or CRM record was created. Automatic sending remains disabled.\n\n' +
  formatLead({
    name: 'Sunyield Test Lead',
    phone: 'Not a real lead',
    area: 'Test area',
    bill: 'RM 500 (dummy)',
    source: 'Admin WhatsApp self-test',
    salespersonName: 'Marketing account (self-test)',
  });

export class TestNotification {
  constructor({ ledger, bridge, enabled, now = Date.now }) {
    Object.assign(this, { ledger, bridge, enabled, now });
    ledger.database
      .prepare(
        "UPDATE testNotifications SET state='delivery-unknown' WHERE state='sending'",
      )
      .run();
  }
  latest() {
    const row = this.ledger.database
      .prepare(
        'SELECT requestId,state,recipient,createdAt FROM testNotifications ORDER BY createdAt DESC,rowid DESC LIMIT 1',
      )
      .get();
    return row ? { ...row } : null;
  }
  async send({ requestId, memberId, expectedSender }) {
    if (
      typeof requestId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        requestId,
      ) ||
      !normalizePhone(expectedSender) ||
      typeof memberId !== 'string' ||
      !memberId ||
      memberId.length > 100
    )
      throw Error('Invalid test request');
    const existing = () =>
      this.ledger.database
        .prepare('SELECT * FROM testNotifications WHERE requestId=?')
        .get(requestId);
    const prior = existing();
    if (prior) {
      if (prior.memberId !== memberId || prior.recipient !== expectedSender)
        throw Error('Test request identity changed');
      return {
        requestId: prior.requestId,
        state: prior.state,
        recipient: prior.recipient,
        createdAt: prior.createdAt,
      };
    }
    const health = await this.bridge.health();
    if (
      this.enabled !== false ||
      this.ledger.setting('paused') !== 'true' ||
      !health.connected ||
      normalizePhone(health.sender) !== expectedSender
    )
      throw Error('Paused, connected marketing account required');
    if (existing()) return this.send({ requestId, memberId, expectedSender });
    const recent = this.latest();
    if (
      recent &&
      (this.now() - recent.createdAt < 60000 ||
        ['sending', 'delivery-unknown'].includes(recent.state))
    )
      throw Error('Previous test must settle before another attempt');
    this.ledger.database
      .prepare(
        'INSERT INTO testNotifications(requestId,memberId,recipient,createdAt,state) VALUES(?,?,?,?,?)',
      )
      .run(requestId, memberId, health.sender, this.now(), 'sending');
    let state = 'submitted',
      messageId = null;
    try {
      messageId = await this.bridge.send(health.sender, TEST_MESSAGE);
      if (!messageId) throw Error('Submission unconfirmed');
    } catch (error) {
      state = error.preSubmission === true ? 'failed' : 'delivery-unknown';
    }
    this.ledger.database
      .prepare(
        "UPDATE testNotifications SET state=CASE WHEN ?='submitted' AND EXISTS(SELECT 1 FROM deliveryReceipts WHERE messageId=?) THEN 'delivered' ELSE ? END,messageId=? WHERE requestId=?",
      )
      .run(state, messageId, state, messageId, requestId);
    return {
      requestId,
      state: existing().state,
      recipient: health.sender,
      createdAt: existing().createdAt,
    };
  }
}
