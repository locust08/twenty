import { test } from 'node:test';
import assert from 'node:assert/strict';
import { databaseEnvironment } from '../src/database.mjs';

test('dump connection passes password only through environment and enforces read-only', () => {
  const env = databaseEnvironment(
    'postgresql://user:secret%40value@database.railway.internal:5432/twenty',
  );
  assert.equal(env.PGPASSWORD, 'secret@value');
  assert.equal(env.PGHOST, 'database.railway.internal');
  assert.match(env.PGOPTIONS, /default_transaction_read_only=on/);
});
