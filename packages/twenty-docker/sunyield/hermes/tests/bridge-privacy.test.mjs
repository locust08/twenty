import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { patchBridge } from '../scripts/patch-bridge.mjs';
test('patched upstream bridge ignores unrelated inbound traffic before touching media or text', async () => {
  const source = await readFile(
    new URL(
      '../../../../../tmp/sunyield-hermes/upstream/bridge.js',
      import.meta.url,
    ),
    'utf8',
  );
  const patched = patchBridge(source);
  const handlers = {};
  let inspected = 0;
  const start = patched.indexOf("sock.ev.on('messages.upsert'");
  const end = patched.indexOf('\n}\n\n// HTTP server', start);
  const registration = patched
    .slice(start, end)
    .replace(/\n  \}\);\s*$/, '\n  });');
  const context = {
    normalizeWhatsAppId: (value) => value,
    emitDebugEvent: () => {},
    sock: {
      user: {},
      ev: {
        on: (name, handler) => {
          handlers[name] = handler;
        },
      },
    },
    process: { env: {} },
    console,
  };
  vm.runInNewContext(registration, context);
  const message = {
    get message() {
      inspected++;
      throw Error('Inbound content touched');
    },
  };
  await handlers['messages.upsert']({ messages: [message], type: 'notify' });
  assert.equal(inspected, 0);
});
