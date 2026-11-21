import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeAsset, ITEM_ELEMENTS, ITEM_TYPES, parseItemTable, parseStatTable, RETIRED, type ItemBook } from '../protocol/items.ts';

// Rebuilds data/items.json from the game's tables and exports the item and skill icons as WebP
// (docs/app/events/13-drops-items.md, 12-skills-items.md#tab-kỹ-năng).
//   npm run items -- --adb=192.168.2.3:5555   copy it0, it1, itv, offline-a2/i*.dat and skill*.dat off a rooted phone
//   npm run items -- --from=<dir>             a folder holding it0, it1, itv and optionally offline-a2/i*.dat, skill*.dat
//   --apk=colauloanthe.1.0.3.apk              also the background of the skill tree (assets/x1/skill/tree-skill.dat)
// --out=data/items.json, --icons=data/icons (needs cwebp), --png=<dir> also keeps the decoded PNGs, --lossless.
const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = arg('out') ?? 'data/items.json', icons = arg('icons') ?? 'data/icons', png = arg('png'), apk = arg('apk');
const show = (e: Record<string, unknown>) => console.log(JSON.stringify(e));

let from = arg('from');
const serial = arg('adb'), work = mkdtempSync(join(tmpdir(), 'cllt-items-'));
const quality = process.argv.includes('--lossless') ? ['-lossless', '-exact', '-z', '9'] : ['-q', '90', '-alpha_q', '100', '-m', '6'];
const pngDir = png ?? join(work, 'png');
try {
  if (serial) from = pull(serial, work);
  if (!from) throw new Error('give --adb=<serial> or --from=<dir with it0, it1, itv>');

  const items = parseItemTable(readFileSync(join(from, 'it1'))), stats = parseStatTable(readFileSync(join(from, 'it0')));
  const version = readFileSync(join(from, 'itv'))[0];
  const book: ItemBook = {
    source: `files/dyncache2/it1, it0, itv of Cờ Lau Loạn Thế 1.1.0 (${new Date().toISOString().slice(0, 10)}); docs/app/events/13-drops-items.md`,
    version, types: ITEM_TYPES, elements: ITEM_ELEMENTS, stats, items,
  };
  writeFileSync(out, bookJson(book));
  show({ kind: 'summary', event: 'items_written', path: out, version, items: items.length, inUse: items.filter(i => i.name !== RETIRED).length, stats: Object.keys(stats).length });

  const assets = join(from, 'offline-a2');
  if (existsSync(assets)) { exportIcons(assets); exportSkillIcons(assets); }
  if (apk) exportTree(apk);
} finally { rmSync(work, { recursive: true, force: true }); }

/** One item per line, so a table update reads as a short diff. */
function bookJson({ items, ...head }: ItemBook) {
  const top = JSON.stringify(head, null, 1).slice(0, -2);
  return `${top},\n "items": [\n${items.map(i => `  ${JSON.stringify(i)}`).join(',\n')}\n ]\n}\n`;
}

/** Copies the tables and the icons to /data/local/tmp with su, then adb pull: `adb exec-out su -c cat` would turn every
 * 0a into 0d 0a. The game itself is not opened. The game 1.1.0 keeps them in files/dyncache2, 1.0.3 in files/dyncache. */
function pull(serial: string, dir: string) {
  const tmp = '/data/local/tmp/cllt-items', files = '/data/data/com.lotasoft.colauloanthe/files';
  const adb = (...args: string[]) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
  const cache = `${files}/${adb('shell', `su -c 'ls ${files}'`).split(/\s+/).includes('dyncache2') ? 'dyncache2' : 'dyncache'}`;
  adb('shell', `su -c 'rm -rf ${tmp} && mkdir -p ${tmp}/offline-a2 && cp ${cache}/it0 ${cache}/it1 ${cache}/itv ${tmp}/ && cp ${cache}/offline-a2/i[0-9]*.dat ${cache}/offline-a2/skill[0-9]*.dat ${tmp}/offline-a2/ && chmod -R 755 ${tmp}'`);
  try { adb('pull', tmp, dir); } finally { adb('shell', `su -c 'rm -rf ${tmp}'`); }
  return join(dir, 'cllt-items');
}

/** Decodes one asset to <pngDir>/<name>.png and returns the path; the size is in the PNG header. */
function decodePng(data: Uint8Array, name: string) {
  const image = decodeAsset(data);
  if (image.readUInt32BE(0) !== 0x89504e47) throw new Error(`${name} did not decode to a PNG`);
  mkdirSync(pngDir, { recursive: true });
  const path = join(pngDir, `${name}.png`);
  writeFileSync(path, image);
  return { path, bytes: image.length, width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
}
/** cwebp, optionally cutting out the square crop = [x, y, size, size]; returns the WebP size. */
function webp(pngPath: string, webpPath: string, crop: number[] = []) {
  execFileSync('cwebp', ['-quiet', ...quality, ...(crop.length ? ['-crop', ...crop.map(String)] : []), pngPath, '-o', webpPath]);
  return readFileSync(webpPath).length;
}

function exportIcons(assets: string) {
  const files = readdirSync(assets).filter(f => /^i\d+\.dat$/.test(f)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
  mkdirSync(icons, { recursive: true });
  let pngBytes = 0, webpBytes = 0;
  for (const f of files) {
    const name = f.replace(/\.dat$/, ''), image = decodePng(readFileSync(join(assets, f)), name);
    pngBytes += image.bytes; webpBytes += webp(image.path, join(icons, `${name}.webp`));
  }
  show({ kind: 'summary', event: 'icons_written', icons: files.length, dir: icons, png: png ?? null, pngBytes, webpBytes });
}

/** skill<element>.dat is one row of square icons, box i for skill 1000 × element + i; skill<element>grey.dat the same
 * icons in grey for skills not learned yet. Writes <icons>/skills/<id>.webp and <id>-grey.webp. */
function exportSkillIcons(assets: string) {
  const files = readdirSync(assets).filter(f => /^skill\d+(grey)?\.dat$/.test(f)).sort();
  if (!files.length) return;
  const dir = join(icons, 'skills'), written: string[] = [];
  mkdirSync(dir, { recursive: true });
  let webpBytes = 0;
  for (const f of files) {
    const [, element, grey] = f.match(/^skill(\d+)(grey)?\.dat$/)!, image = decodePng(readFileSync(join(assets, f)), f.replace(/\.dat$/, ''));
    for (let i = 0; i * image.height < image.width; i++) {
      const name = `${Number(element) * 1000 + i}${grey ? '-grey' : ''}`;
      webpBytes += webp(image.path, join(dir, `${name}.webp`), [i * image.height, 0, image.height, image.height]);
      written.push(name);
    }
  }
  show({ kind: 'summary', event: 'skill_icons_written', sheets: files, icons: written.length, dir, webpBytes });
}

/** The background of the tree on the Kỹ năng tab, from the APK (it is not in dyncache): <icons>/skills/tree.webp. */
function exportTree(apkPath: string) {
  const image = decodePng(execFileSync('unzip', ['-p', apkPath, 'assets/x1/skill/tree-skill.dat']), 'tree-skill');
  mkdirSync(join(icons, 'skills'), { recursive: true });
  const bytes = webp(image.path, join(icons, 'skills', 'tree.webp'));
  show({ kind: 'summary', event: 'skill_tree_written', width: image.width, height: image.height, webpBytes: bytes });
}
