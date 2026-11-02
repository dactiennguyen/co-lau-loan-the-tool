// scripts/d1-id.mjs, which the deploy workflow runs: the database of wrangler.toml found in `wrangler d1 list --json`
// and its id written into wrangler.toml.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
// @ts-expect-error: a plain .mjs script without types.
import { databaseName, databases, idOf, withId } from '../scripts/d1-id.mjs';

const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const ID = '5f0c6f2e-3a2b-4c1d-9e8f-0a1b2c3d4e5f';

test('the id of database "cllt" goes into database_id of wrangler.toml, nothing else changes', () => {
  assert.equal(databaseName(toml), 'cllt');
  // As wrangler 4 prints it: the Cloudflare API's list, maybe after a line of its own.
  const out = `▲ [WARNING] something\n${JSON.stringify([{ uuid: 'aaaaaaaa-0000-0000-0000-000000000000', name: 'other' }, { uuid: ID, name: 'cllt', num_tables: 5 }], null, 2)}\n`;
  const list = databases(out);
  assert.equal(idOf(list, 'cllt'), ID);
  assert.equal(idOf(list, 'none'), null);
  assert.equal(idOf(databases('[]'), 'cllt'), null);
  const next = withId(toml, ID);
  assert.match(next, new RegExp(`^database_id = "${ID}"$`, 'm'));
  assert.equal(next.replace(ID, '00000000-0000-0000-0000-000000000000'), toml);
  assert.throws(() => withId(toml, 'not-an-id'), /database_id lạ/);
  assert.throws(() => databases('Not logged in'), /không trả JSON/);
});
