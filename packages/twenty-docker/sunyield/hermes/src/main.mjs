import { activateIfReady } from './activation.mjs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Ledger } from './ledger.mjs';
import { Bridge } from './bridge.mjs';
import { Twenty } from './twenty.mjs';
import { Dispatcher, observe } from './dispatcher.mjs';
import { createControlServer } from './control.mjs';
import { WORKSPACE_ID } from './policy.mjs';
import { AssignmentTest } from './assignment-test.mjs';
if (process.env.SUNYIELD_WORKSPACE_ID !== WORKSPACE_ID)
  throw Error('Sunyield scope guard failed');
for (const key of [
  'HERMES_ADMIN_TOKEN',
  'HERMES_BACKUP_TOKEN',
  'TWENTY_FEED_TOKEN',
])
  if ((process.env[key] || '').length < 32)
    throw Error('Missing private credential ' + key);
const directory = process.env.DATA_DIRECTORY || '/opt/data';
await mkdir(directory, { recursive: true, mode: 0o700 });
const ledger = new Ledger(join(directory, 'ledger.db'));
const bridge = new Bridge(
  join(directory, 'whatsapp-session'),
  process.env.BRIDGE_DIRECTORY || '/opt/bridge',
);
await bridge.initialize();
const reader = new Twenty(
  process.env.TWENTY_URL,
  process.env.TWENTY_FEED_TOKEN,
);
const enabled = process.env.HERMES_SENDING_ENABLED === 'true';
const assignmentTest = new AssignmentTest({ ledger, bridge, reader, enabled });
const dispatcher = new Dispatcher({
  ledger,
  reader,
  bridge,
  enabled,
  expectedSender: process.env.EXPECTED_SENDER,
});
let lastObserverSuccess = Date.now();
let observerFailed = false;
const server = createControlServer({
  ledger,
  bridge,
  reader,
  enabled,
  assignmentTest,
  expectedSender: process.env.EXPECTED_SENDER,
  getObserverHealthy: () =>
    !enabled || (!observerFailed && Date.now() - lastObserverSuccess < 90000),
  adminToken: process.env.HERMES_ADMIN_TOKEN,
  backupToken: process.env.HERMES_BACKUP_TOKEN,
});
server.listen(Number(process.env.PORT || 8080), '::');
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    stopping = true;
  });
console.log(
  JSON.stringify({ event: 'hermes-started', sendingEnabled: enabled }),
);
while (!stopping) {
  try {
    await activateIfReady({
      ledger,
      reader,
      bridge,
      enabled,
      confirmed: process.env.HERMES_ACTIVATION_CONFIRMED === 'true',
      expectedSender: process.env.EXPECTED_SENDER,
    });
    const cutoff = ledger.setting('activation');
    if (cutoff) {
      for await (const lead of reader.scan(cutoff))
        observe(ledger, lead, process.env.EXPECTED_SENDER);
    }
    await dispatcher.tick();
    await assignmentTest.tick();
    for (const receipt of await bridge.receipts())
      ledger.receipt(receipt.messageId, receipt.status);
    lastObserverSuccess = Date.now();
    observerFailed = false;
  } catch {
    observerFailed = true;
    console.log(JSON.stringify({ event: 'hermes-cycle-failed' }));
  }
  await delay(20000);
}
await bridge.stop();
server.close();
ledger.database.close();
