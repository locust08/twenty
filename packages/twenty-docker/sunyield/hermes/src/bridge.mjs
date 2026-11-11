import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { PairingSession } from './pairing.mjs';
export class Bridge {
  constructor(directory, upstream) {
    this.directory = directory;
    this.upstream = upstream;
    this.pairing = new PairingSession();
    this.child = null;
    this.paired = false;
    this.sender = null;
    this.connected = false;
    this.timer = setInterval(() => {
      if (
        this.pairing.session &&
        this.pairing.session.expiresAt <= Date.now()
      ) {
        this.pairing.clear();
        if (!this.paired) void this.stop();
      }
    }, 1000);
    this.timer.unref();
  }
  registered() {
    try {
      const credentials = JSON.parse(
        readFileSync(join(this.directory, 'creds.json'), 'utf8'),
      );
      return (
        credentials.registered === true ||
        (typeof credentials.me?.id === 'string' &&
          /^[1-9]\d{7,14}(?::\d+)?@s\.whatsapp\.net$/.test(credentials.me.id))
      );
    } catch {
      return false;
    }
  }
  async initialize() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if (this.registered()) this.launch(false);
  }
  launch(pairOnly) {
    if (this.child) return;
    const child = spawn(
      process.execPath,
      [
        join(this.upstream, 'bridge.js'),
        '--session',
        this.directory,
        '--mode',
        'bot',
        '--pair-json',
        ...(pairOnly ? ['--pair-only'] : []),
      ],
      {
        env: {
          ...process.env,
          WHATSAPP_DEBUG: 'false',
          WHATSAPP_SEND_READ_RECEIPTS: 'false',
          WHATSAPP_FORWARD_OWNER_MESSAGES: 'false',
          WHATSAPP_REPLY_PREFIX: '',
        },
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    this.child = child;
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      if (line.length > 12000) return;
      try {
        const event = JSON.parse(line);
        if (event.event === 'qr') {
          if (pairOnly) this.pairing.update(event.qr);
          else void this.stop();
        }
        if (event.event === 'connected') {
          this.sender =
            '+' +
            String(event.user?.id || '')
              .split('@')[0]
              .split(':')[0];
          this.paired = true;
          this.connected = true;
          if (this.pairing.session) this.pairing.session.qr = null;
        }
        if (['disconnected', 'error'].includes(event.event))
          this.connected = false;
      } catch {}
    });
    child.on('error', () => {
      this.connected = false;
    });
    child.on('exit', () => {
      if (this.child !== child) return;
      this.child = null;
      this.connected = false;
      lines.close();
      if (this.paired) setTimeout(() => this.launch(false), 3000).unref();
    });
  }
  async stop() {
    const child = this.child;
    this.child = null;
    this.connected = false;
    if (child) {
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 2000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }
  async begin(memberId) {
    if (this.paired || this.registered())
      throw Error('Device already linked; revoke it before pairing again');
    const session = this.pairing.start(memberId);
    if (!this.child) this.launch(true);
    return session;
  }
  async cancel(memberId, sessionId) {
    this.pairing.read(memberId, sessionId);
    this.pairing.clear();
    await this.stop();
  }
  async unpair() {
    const response = await this.request('/logout', { method: 'POST' });
    if (!response.ok)
      throw Error('Remote device logout could not be confirmed');
    this.pairing.clear();
    this.paired = false;
    await this.stop();
    await rm(this.directory, { recursive: true, force: true });
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    this.sender = null;
  }
  async request(path, options = {}) {
    return fetch('http://127.0.0.1:3000' + path, {
      ...options,
      signal: AbortSignal.timeout(65000),
      redirect: 'error',
    });
  }
  async health() {
    if (!this.child || (!this.paired && this.pairing.session))
      return { connected: false, sender: this.sender };
    try {
      const response = await this.request('/health');
      const value = await response.json();
      this.connected = value.status === 'connected';
      if (this.connected) {
        this.paired = true;
        this.sender = value.sender;
      }
      return { connected: this.connected, sender: this.sender };
    } catch {
      return { connected: false, sender: this.sender };
    }
  }
  async send(recipient, message) {
    const response = await this.request('/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: recipient.slice(1) + '@s.whatsapp.net',
        message,
      }),
    });
    if (response.status === 503) {
      const error = Error('Disconnected');
      error.preSubmission = true;
      throw error;
    }
    if (!response.ok) throw Error('Submission unconfirmed');
    const result = await response.json();
    return result.messageId;
  }
  async receipts() {
    if (!this.connected) return [];
    try {
      return await (await this.request('/messages')).json();
    } catch {
      return [];
    }
  }
}
