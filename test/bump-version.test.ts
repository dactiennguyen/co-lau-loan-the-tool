import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bumped, versions } from '../.github/scripts/bump-version.mjs';

const read = (file: string) => readFileSync(join(import.meta.dirname, '..', file), 'utf8');

test('bump-version: the seven places of the app version agree', () => {
  const found = versions(read);
  assert.equal(found.length, 7);
  const all = new Set(found.map(([, v]) => v));
  assert.equal(all.size, 1, JSON.stringify(found));
  assert.match([...all][0] as string, /^\d+\.\d+\.\d+$/);
});

test('bump-version: a new version changes only the version strings, in five files', () => {
  const before = versions(read)[0][1] as string;
  const texts: Map<string, string> = bumped('9.8.7', read);
  assert.deepEqual([...texts.keys()].sort(), [
    'app/Cargo.lock',
    'app/Cargo.toml',
    'app/desktop/package-lock.json',
    'app/desktop/package.json',
    'app/desktop/src-tauri/tauri.conf.json',
  ]);
  assert.ok(versions((file) => texts.get(file) ?? read(file)).every(([, v]) => v === '9.8.7'));
  for (const [file, text] of texts) {
    const old = read(file).split('\n');
    const changed = text.split('\n').filter((line: string, i: number) => line !== old[i]);
    assert.equal(old.length, text.split('\n').length, file);
    assert.ok(changed.length >= 1 && changed.length <= 2, `${file}: ${changed.join(' | ')}`);
    assert.ok(changed.every((line: string) => line.includes('9.8.7') && !line.includes(before)), file);
  }
});
