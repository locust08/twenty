import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Twenty } from '../src/twenty.mjs';
test('all feed pages are consumed rather than dropping leads after the first page', async () => {
  const reader = new Twenty('https://crm-sunyield.up.railway.app', 'secret');
  let calls = 0;
  reader.page = async (query) => {
    calls++;
    if (!query.cursorId)
      return {
        leads: [{ id: 'first' }],
        next: { cursorId: 'first', cursorAt: '2026-11-04T00:00:00Z' },
      };
    assert.equal(query.cursorId, 'first');
    return { leads: [{ id: 'second' }], next: null };
  };
  const ids = [];
  for await (const lead of reader.scan('2026-11-04T00:00:00Z'))
    ids.push(lead.id);
  assert.deepEqual(ids, ['first', 'second']);
  assert.equal(calls, 2);
});
test('the dedicated feed key is not sent through Twenty user JWT authentication', async () => {
  const original = global.fetch;
  try {
    global.fetch = async (url, options) => {
      const authorized =
        String(url).startsWith(
          'https://crm-sunyield.up.railway.app/sunyield-integration/lead-feed?',
        ) &&
        options.headers['X-Sunyield-Feed-Key'] === 'feed-secret' &&
        !options.headers.Authorization;
      return new Response(
        JSON.stringify({
          workspaceId: 'e7e7d4f2-0f82-4a72-a12e-1f61494c61c6',
          leads: [{ id: 'lead' }],
          next: null,
          recipientsConfigured: false,
        }),
        { status: authorized ? 200 : 401 },
      );
    };
    const reader = new Twenty(
      'https://crm-sunyield.up.railway.app',
      'feed-secret',
    );
    assert.equal(
      (await reader.page({ cutoff: '2026-11-04T00:00:00Z' })).leads[0].id,
      'lead',
    );
  } finally {
    global.fetch = original;
  }
});

test('the renamed Sunyield host is accepted while retired and unrelated hosts are rejected', () => {
  assert.doesNotThrow(
    () => new Twenty('https://crm-sunyield.up.railway.app', 'secret'),
  );
  for (const url of [
    'https://twenty-sunyield.up.railway.app',
    'https://twenty-staging-b368.up.railway.app',
    'http://crm-sunyield.up.railway.app',
    'https://crm-sunyield.up.railway.app.attacker.test',
  ])
    assert.throws(() => new Twenty(url, 'secret'), /Sunyield URL guard failed/);
});
