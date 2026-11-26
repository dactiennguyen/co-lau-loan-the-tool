// The pixel check boxes and switches of the desktop app hide their <input> with "absolute opacity-0 w-px h-px". Without a
// positioned box around it the input sat in <main>, outside the scroller of the page: a tap focused it and the WebView
// scrolled <main> (overflow hidden on phones) to show it, the whole page and its bottom bar floated up (Android 2.2.26,
// Cài đặt đánh → Nghỉ giải lao). Each such input has a `relative` label or row around it, and <main> clips on phones
// (overflow clip cannot be scrolled), so one that slips out still moves nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = 'app/desktop/src';
const read = (f: string) => readFileSync(`${SRC}/${f}`, 'utf8');

test('<main> clips on phones instead of hiding, so a focused input cannot scroll it', () => {
  const main = read('App.tsx').match(/<main className="([^"]+)"/)?.[1] ?? '';
  assert.match(main, /phone:overflow-clip/);
  assert.doesNotMatch(main, /phone:overflow-hidden/);
});

test('every hidden check box or switch has a relative box around it', () => {
  const sites: [string, RegExp][] = [
    ['components/CheckRow.tsx', /<label className=\{cn\("relative /],
    ['components/SettingRow.tsx', /group\/row relative /],
    ['views/BachHoModal.tsx', /<label className=\{cn\("relative grid place-items-center"/],
    ['views/SkillsModal.tsx', /<label className="relative inline-flex/],
    ['views/shop/ShopModal.tsx', /check: "relative inline-flex/],
  ];
  for (const [file, re] of sites) assert.match(read(file), re, file);
  assert.equal((read('views/dialogs/ProxyFields.tsx').match(/"relative (grid|inline-flex)/g) ?? []).length, 2, 'ProxyFields: the switch row and the kind chips');
});
