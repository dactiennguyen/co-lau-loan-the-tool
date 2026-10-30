import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rustExports } from '../src/export-rust.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

test('the opcode table and test vectors of the Rust app are what npm run export:rust writes from the TS side', () => {
  for (const [path, content] of Object.entries(rustExports())) assert.ok(readFileSync(join(root, path), 'utf8') === content, `${path} is stale: run npm run export:rust`);
});
