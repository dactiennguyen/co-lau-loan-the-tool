import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeAsset, ITEM_ELEMENTS, ITEM_TYPES, parseItemTable, parseStatTable, RETIRED, type ItemBook } from './items.ts';

// Rebuilds data/items.json from the game's tables and exports the item icons as WebP (docs/app/events/13-drops-items.md).
//   npm run items -- --adb=192.168.2.3:5555   copy it0, it1, itv and offline-a2/i*.dat off a rooted phone, then both steps
//   npm run items -- --from=<dir>             a folder holding it0, it1, itv and optionally offline-a2/i*.dat
// --out=data/items.json, --icons=data/icons (needs cwebp), --png=<dir> also keeps the decoded PNGs, --lossless.
const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = arg('out') ?? 'data/items.json', icons = arg('icons') ?? 'data/icons', png = arg('png');
const show = (e: Record<string, unknown>) => console.log(JSON.stringify(e));

let from = arg('from');
const serial = arg('adb'), work = mkdtempSync(join(tmpdir(), 'cllt-items-'));
try {
  if (serial) from = pull(serial, work);
  if (!from) throw new Error('give --adb=<serial> or --from=<dir with it0, it1, itv>');

  const items = parseItemTable(readFileSync(join(from, 'it1'))), stats = parseStatTable(readFileSync(join(from, 'it0')));
  const version = readFileSync(join(from, 'itv'))[0];
  const book: ItemBook = {
    source: `files/dyncache/it1, it0, itv of Cờ Lau Loạn Thế 1.0.3 (${new Date().toISOString().slice(0, 10)}); docs/app/events/13-drops-items.md`,
    version, types: ITEM_TYPES, elements: ITEM_ELEMENTS, stats, items,
  };
  writeFileSync(out, bookJson(book));
  show({ kind: 'summary', event: 'items_written', path: out, version, items: items.length, inUse: items.filter(i => i.name !== RETIRED).length, stats: Object.keys(stats).length });

  const assets = join(from, 'offline-a2');
  if (existsSync(assets)) exportIcons(assets);
} finally { rmSync(work, { recursive: true, force: true }); }

/** One item per line, so a table update reads as a short diff. */
function bookJson({ items, ...head }: ItemBook) {
  const top = JSON.stringify(head, null, 1).slice(0, -2);
  return `${top},\n "items": [\n${items.map(i => `  ${JSON.stringify(i)}`).join(',\n')}\n ]\n}\n`;
}

/** Copies the tables and the icons to /data/local/tmp with su, then adb pull: `adb exec-out su -c cat` would turn every
 * 0a into 0d 0a. The game itself is not opened. */
function pull(serial: string, dir: string) {
  const tmp = '/data/local/tmp/cllt-items', cache = '/data/data/com.lotasoft.colauloanthe/files/dyncache';
  const adb = (...args: string[]) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
  adb('shell', `su -c 'rm -rf ${tmp} && mkdir -p ${tmp}/offline-a2 && cp ${cache}/it0 ${cache}/it1 ${cache}/itv ${tmp}/ && cp ${cache}/offline-a2/i[0-9]*.dat ${tmp}/offline-a2/ && chmod -R 755 ${tmp}'`);
  try { adb('pull', tmp, dir); } finally { adb('shell', `su -c 'rm -rf ${tmp}'`); }
  return join(dir, 'cllt-items');
}

function exportIcons(assets: string) {
  const files = readdirSync(assets).filter(f => /^i\d+\.dat$/.test(f)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
  const pngDir = png ?? join(work, 'png');
  mkdirSync(pngDir, { recursive: true }); mkdirSync(icons, { recursive: true });
  const quality = process.argv.includes('--lossless') ? ['-lossless', '-exact', '-z', '9'] : ['-q', '90', '-alpha_q', '100', '-m', '6'];
  let pngBytes = 0, webpBytes = 0;
  for (const f of files) {
    const image = decodeAsset(readFileSync(join(assets, f)));
    if (image.readUInt32BE(0) !== 0x89504e47) throw new Error(`${f} did not decode to a PNG`);
    const name = f.replace(/\.dat$/, ''), pngPath = join(pngDir, `${name}.png`), webpPath = join(icons, `${name}.webp`);
    writeFileSync(pngPath, image);
    execFileSync('cwebp', ['-quiet', ...quality, pngPath, '-o', webpPath]);
    pngBytes += image.length; webpBytes += readFileSync(webpPath).length;
  }
  show({ kind: 'summary', event: 'icons_written', icons: files.length, dir: icons, png: png ?? null, pngBytes, webpBytes });
}
