import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportCheck } from '../src/monitor.mjs';

test('incident and recovery are delivered once across restarts', async () => {
  let state = null;
  const messages = [];
  const store = {
    readJson: async () => state,
    writeJson: async (key, value) => {
      state = value;
    },
  };
  const send = async (subject) => messages.push(subject);
  await reportCheck(store, send, 'worker', false);
  await reportCheck(store, send, 'worker', false);
  await reportCheck(store, send, 'worker', true);
  await reportCheck(store, send, 'worker', true);
  assert.equal(messages.length, 2);
  assert.match(messages[0], /Incident/);
  assert.match(messages[1], /Recovery/);
});
test('failed delivery does not suppress retry', async () => {
  let state = null;
  const store = {
    readJson: async () => state,
    writeJson: async (key, value) => {
      state = value;
    },
  };
  await assert.rejects(
    reportCheck(
      store,
      async () => {
        throw Error('email');
      },
      'worker',
      false,
    ),
  );
  assert.equal(state, null);
  let sent = false;
  await reportCheck(
    store,
    async () => {
      sent = true;
    },
    'worker',
    false,
  );
  assert.equal(sent, true);
});
test('persistence outage cannot be mistaken for no prior incident', async () => {
  let sent = false;
  await assert.rejects(
    reportCheck(
      {
        readJson: async () => {
          throw Error('storage');
        },
      },
      async () => {
        sent = true;
      },
      'worker',
      false,
    ),
  );
  assert.equal(sent, false);
});

test('accepted email followed by failed state save retries identical content and key', async () => {
  const messages = [];
  const store = {
    readJson: async () => null,
    writeJson: async () => {
      throw Error('commit');
    },
  };
  const send = async (...args) => messages.push(args);
  await assert.rejects(reportCheck(store, send, 'worker', false));
  await new Promise((resolve) => setTimeout(resolve, 5));
  await assert.rejects(reportCheck(store, send, 'worker', false));
  assert.deepEqual(messages[0], messages[1]);
});
