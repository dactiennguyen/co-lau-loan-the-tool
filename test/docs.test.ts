import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENTS } from '../src/protocol/events.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const events = join(root, 'docs/app/events');
const markdown = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? markdown(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : []);
const read = (path: string) => readFileSync(path, 'utf8').replace(/^```[\s\S]*?^```/gm, '');

/** Explicit <a id> anchors plus GitHub heading slugs (duplicates get -1, -2…). */
const anchorCache = new Map<string, Set<string>>();
function anchors(path: string) {
  if (!anchorCache.has(path)) {
    const text = read(path), found = new Set([...text.matchAll(/<a id="([^"]+)"/g)].map(m => m[1])), seen = new Map<string, number>();
    for (const [, heading] of text.matchAll(/^#{1,6} (.+)$/gm)) {
      const slug = heading.trim().toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, '').replace(/ /g, '-'), n = seen.get(slug) ?? 0;
      seen.set(slug, n + 1); found.add(n ? `${slug}-${n}` : slug);
    }
    anchorCache.set(path, found);
  }
  return anchorCache.get(path)!;
}

test('every relative link and #anchor in the docs resolves', () => {
  const problems: string[] = [];
  for (const src of [join(root, 'README.md'), join(root, 'test/README.md'), ...markdown(join(root, 'docs'))]) {
    for (const [, target] of read(src).matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:/.test(target)) continue;
      const [path, fragment] = target.split('#'), dest = path ? normalize(join(dirname(src), path)) : src;
      if (!existsSync(dest)) problems.push(`${relative(root, src)}: missing file ${target}`);
      else if (fragment && dest.endsWith('.md') && !anchors(dest).has(fragment)) problems.push(`${relative(root, src)}: missing anchor ${target}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('the event table of docs/app/events/README.md lists exactly the catalog of src/protocol/events.ts', () => {
  const rows = [...readFileSync(join(events, 'README.md'), 'utf8').matchAll(/^\| ((?:c2s|s2c)\/-?\d+) \| ([^|]+) \| ([^|]+) \|/gm)]
    .map(m => `${m[1]} ${m[2].trim()} ${m[3].trim()}`);
  assert.deepEqual(rows.toSorted(), EVENTS.map(e => `${e.direction}/${e.opcode} ${e.name} ${e.phase}`).toSorted());
});

test('counts quoted in the docs match the catalog and the unseen-opcode list', () => {
  const unseen = readFileSync(join(root, 'docs/app/opcode-map.md'), 'utf8').split('<a id="unseen">')[1].match(/```text\n([\s\S]*?)```/)![1].split(/\s+/).filter(Boolean);
  const problems: string[] = [];
  for (const src of [join(root, 'README.md'), ...markdown(join(root, 'docs'))]) {
    const text = read(src);
    for (const [, n] of text.matchAll(/(\d+) opcode chưa/g)) if (Number(n) !== unseen.length) problems.push(`${relative(root, src)}: ${n} unseen ≠ ${unseen.length}`);
    for (const [, n] of text.matchAll(/Đã ghi(?: nhận)? (\d+) (?:gói|cặp)/g)) if (Number(n) !== EVENTS.length) problems.push(`${relative(root, src)}: ${n} events ≠ ${EVENTS.length}`);
  }
  assert.deepEqual(problems, []);
});

test('per-event sections of 01-boot … 04-push repeat the catalog label, trigger, next step, schema and confidence', () => {
  const problems: string[] = [];
  for (const file of ['01-boot.md', '02-login.md', '03-world.md', '04-push.md']) {
    for (const section of readFileSync(join(events, file), 'utf8').split(/^(?=## )/m)) {
      const head = section.match(/^## (c2s|s2c)\/(-?\d+)\n/);
      if (!head) continue;
      const spec = EVENTS.find(e => e.direction === head[1] && e.opcode === Number(head[2]));
      if (!spec) { problems.push(`${file} ${head[1]}/${head[2]}: not in the catalog`); continue; }
      for (const [label, value] of [['Nhãn phân tích', spec.name], ['Xuất hiện khi', spec.trigger], ['Sau đó', spec.next], ['Bố cục payload', spec.schema], ['Độ chắc chắn', spec.confidence]]) {
        const row = section.match(new RegExp(`^\\| ${label} \\| (.*) \\|$`, 'm'))?.[1].replace(/\\\|/g, '|');
        if (row !== value) problems.push(`${file} ${head[1]}/${head[2]} ${label}: doc "${row}" ≠ catalog "${value}"`);
      }
    }
  }
  assert.deepEqual(problems, []);
});
