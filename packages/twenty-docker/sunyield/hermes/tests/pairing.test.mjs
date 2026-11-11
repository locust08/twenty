import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PairingSession } from '../src/pairing.mjs';
test('QR is visible only to its initiating member, then expires', () => {
  let now = 1000;
  const pairing = new PairingSession(() => now);
  const session = pairing.start('admin');
  pairing.update('secret-qr');
  assert.equal(pairing.read('admin', session.id).qr, 'secret-qr');
  assert.throws(() => pairing.read('other', session.id));
  now = 200000;
  assert.throws(() => pairing.read('admin', session.id));
});
test('a second admin cannot take over a pairing session', () => {
  const pairing = new PairingSession();
  pairing.start('admin');
  assert.throws(() => pairing.start('other'));
});
