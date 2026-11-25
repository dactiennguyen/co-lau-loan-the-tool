// The pictures of the desktop app against its CSP (app/desktop/src-tauri/tauri.conf.json): the captcha of 2.2.22 and
// 2.2.23 went through a blob: URL that img-src does not allow, a black box in the app while the browser preview (no CSP)
// showed it. A picture made in the page is a data: URL (app/desktop/src/utils/dataUrl.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pngDataUrl } from '../app/desktop/src/utils/dataUrl.ts';

const SRC = 'app/desktop/src';
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap(n => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : /\.tsx?$/.test(n) ? [join(dir, n)] : []));

test('no blob: URL is made while the CSP lets no blob: picture in', () => {
  const csp = JSON.parse(readFileSync('app/desktop/src-tauri/tauri.conf.json', 'utf8')).app.security.csp;
  if (String(csp['img-src']).includes('blob:')) return;
  const made = files(SRC).filter(f => readFileSync(f, 'utf8').includes('URL.createObjectURL'));
  assert.deepEqual(made, [], `img-src is "${csp['img-src']}": these files make blob: URLs`);
});

test('a PNG becomes a data: URL of its own bytes, a large one too', () => {
  const bytes = Array.from({ length: 100_000 }, (_, i) => (i * 7919) % 256);
  const url = pngDataUrl(bytes);
  assert.ok(url.startsWith('data:image/png;base64,'));
  assert.deepEqual([...Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')], bytes);
});
