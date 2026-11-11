import { randomUUID } from 'node:crypto';
export class PairingSession {
  constructor(now = Date.now) {
    this.now = now;
    this.session = null;
  }
  start(memberId) {
    if (this.session && this.session.expiresAt > this.now()) {
      if (this.session.memberId !== memberId)
        throw Error('Pairing already in progress');
      return this.session;
    }
    this.session = {
      id: randomUUID(),
      memberId,
      expiresAt: this.now() + 120000,
      qr: null,
    };
    return this.session;
  }
  update(qr) {
    if (
      this.session &&
      this.session.expiresAt > this.now() &&
      typeof qr === 'string' &&
      qr.length < 4000
    )
      this.session.qr = qr;
  }
  read(memberId, id) {
    if (
      !this.session ||
      this.session.memberId !== memberId ||
      this.session.id !== id ||
      this.session.expiresAt <= this.now()
    )
      throw Error('Pairing session expired or unavailable');
    return this.session;
  }
  clear() {
    this.session = null;
  }
}
