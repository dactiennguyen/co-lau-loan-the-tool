import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The kinds of log line live in three places that must agree: LogKind of the Rust core (key and label), the filters of
// the desktop UI, and the table of the Rust app docs, which says what each kind holds (a new kind goes in all three).
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('log kinds: bot.rs, logKinds.ts and the docs table name the same kinds in the same order', () => {
  const rust = read('app/core/src/bot.rs');
  const impl = rust.slice(rust.indexOf('impl LogKind'), rust.indexOf('/// What the battle was played for'));
  const arms = (fn: string) => {
    const body = impl.slice(impl.indexOf(`fn ${fn}(`));
    return [...body.slice(0, body.indexOf('\n    }\n')).matchAll(/LogKind::\w+ => "([^"]+)"/g)].map(m => m[1]);
  };
  const fromRust = arms('key').map((key, i) => ({ key, label: arms('label')[i] }));
  assert.equal(fromRust.length, 7);

  const ui = [...read('app/desktop/src/logKinds.ts').matchAll(/\{ kind: "(\w+)", label: "([^"]+)"/g)].map(m => ({ key: m[1], label: m[2] }));
  assert.deepEqual(ui, fromRust, 'LOG_KINDS of logKinds.ts');

  const docs = read('docs/integration/rust/README.md');
  const table = docs.slice(docs.indexOf('### Loại dòng nhật ký'), docs.indexOf('## Proxy'));
  const rows = [...table.matchAll(/^\| ([^|(]+) \(`(\w+)`\) \| ([^|]+) \|$/gm)].map(m => ({ key: m[2], label: m[1].trim(), lines: m[3].trim() }));
  assert.deepEqual(rows.map(({ key, label }) => ({ key, label })), fromRust, 'the table under "Loại dòng nhật ký"');
  for (const r of rows) assert.ok(r.lines.length > 10, `what the ${r.key} lines are`);
});
