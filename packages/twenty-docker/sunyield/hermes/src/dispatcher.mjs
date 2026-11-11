import { notification } from './notification.mjs';
import { createHash } from 'node:crypto';
import { assignmentKey, eligible, normalizePhone } from './policy.mjs';
export const observe = (ledger, lead, expectedSender) => {
  const cutoff = ledger.setting('activation');
  if (
    !cutoff ||
    !lead ||
    lead.deletedAt ||
    !Number.isFinite(Date.parse(lead.createdAt)) ||
    Date.parse(lead.createdAt) < Date.parse(cutoff)
  )
    return;
  const isReady = eligible(lead);
  ledger.put(
    lead,
    isReady ? 'pending' : 'held',
    isReady ? null : 'assignment_or_recipient_missing',
    isReady ? assignmentKey(lead) : null,
    isReady ? normalizePhone(lead.recipient) : null,
  );
  const adminAlert = notification(
    lead,
    'commercial-awaiting-assignment',
    expectedSender,
    ledger.setting('commercial-alert-cutoff'),
  );
  if (adminAlert)
    ledger.put(
      lead,
      'pending',
      null,
      adminAlert.key,
      adminAlert.recipient,
      'commercial-awaiting-assignment',
    );
};
export class Dispatcher {
  constructor({
    ledger,
    reader,
    bridge,
    enabled = false,
    expectedSender,
    now = Date.now,
  }) {
    Object.assign(this, {
      ledger,
      reader,
      bridge,
      enabled,
      expectedSender,
      now,
    });
    this.lastSend = 0;
  }
  async tick() {
    if (
      !this.enabled ||
      this.ledger.setting('paused') !== 'false' ||
      !this.ledger.setting('activation') ||
      !normalizePhone(this.expectedSender)
    )
      return;
    const job = this.ledger
      .list()
      .find(
        (item) => item.state === 'pending' && item.nextAttempt <= this.now(),
      );
    if (!job || this.now() - this.lastSend < 2000) return;
    let lead, health;
    try {
      lead = await this.reader.get(job.leadId);
      health = await this.bridge.health();
    } catch {
      return;
    }
    if (this.reader.recipientsConfigured !== true) return;
    const current = notification(
      lead,
      job.kind,
      this.expectedSender,
      this.ledger.setting('commercial-alert-cutoff'),
    );
    if (
      !current ||
      current.key !== job.assignmentKey ||
      current.recipient !== job.recipient
    ) {
      this.ledger.update(
        job.id,
        'cancelled',
        'assignment_or_recipient_changed',
      );
      return;
    }
    if (!health.connected) {
      this.ledger.defer(job.id, this.now());
      return;
    }
    if (normalizePhone(health.sender) !== normalizePhone(this.expectedSender))
      return;
    const message = current.message;
    const hash = createHash('sha256').update(message).digest('hex');
    if (!this.enabled || this.ledger.setting('paused') !== 'false') return;
    if (!this.ledger.claim(job.id, hash)) return;
    this.lastSend = this.now();
    try {
      const messageId = await this.bridge.send(job.recipient, message);
      if (!messageId) throw Error('Unconfirmed');
      this.ledger.submitted(job.id, messageId);
    } catch (error) {
      if (error.preSubmission === true) {
        this.ledger.update(job.id, 'pending');
        this.ledger.defer(job.id, this.now());
      } else
        this.ledger.update(
          job.id,
          'delivery-unknown',
          'submission_unconfirmed',
        );
    }
  }
}
