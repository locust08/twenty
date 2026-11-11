import { normalizePhone } from './policy.mjs';

export class ResumeControl {
  constructor({ ledger, reader, bridge, enabled, expectedSender }) {
    Object.assign(this, { ledger, reader, bridge, enabled, expectedSender });
    this.pauseVersion = 0;
    this.deviceChanging = false;
  }
  pause() {
    this.pauseVersion++;
    this.ledger.pause(true);
  }
  setDeviceChanging(value) {
    if (value && this.deviceChanging)
      throw Error('Device change already in progress');
    if (value) this.pause();
    this.deviceChanging = value;
  }
  async readiness(health) {
    const blocked = (resumeBlockedReason) => ({
      canResume: false,
      resumeBlockedReason,
    });
    if (this.enabled !== true) return blocked('production_disabled');
    if (this.deviceChanging) return blocked('device_changing');
    if (this.ledger.setting('paused') !== 'true') return blocked('not_paused');
    const activation = this.ledger.setting('activation');
    if (!activation || !Number.isFinite(Date.parse(activation)))
      return blocked('not_activated');
    if (!normalizePhone(this.expectedSender))
      return blocked('sender_not_configured');
    try {
      const readiness = await this.reader.page({ cutoff: activation });
      if (readiness.recipientsConfigured !== true)
        return blocked('recipients_not_ready');
      const connected = health || (await this.bridge.health());
      if (!connected.connected) return blocked('disconnected');
      if (
        normalizePhone(connected.sender) !== normalizePhone(this.expectedSender)
      )
        return blocked('sender_mismatch');
      return { canResume: true, resumeBlockedReason: null };
    } catch {
      return blocked('feed_unavailable');
    }
  }
  async resume(acknowledge) {
    if (acknowledge !== true) throw Error('Resume acknowledgment required');
    const version = this.pauseVersion;
    const status = await this.readiness();
    if (
      !status.canResume ||
      version !== this.pauseVersion ||
      this.deviceChanging ||
      this.ledger.setting('paused') !== 'true'
    )
      throw Error('Resume could not be authorized');
    this.ledger.pause(false);
  }
}
