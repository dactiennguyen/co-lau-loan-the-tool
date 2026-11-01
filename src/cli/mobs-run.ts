import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeAsset } from '../protocol/items.ts';
import { mobSheet, mobTypes, spriteSheet, standingParts } from '../protocol/sprite.ts';

// The mob icons of the app (docs/app/events/06-map-mobs.md#ảnh-quái): data/icons/mobs/names.json, the type of every mob
// name of data/maps.json, and data/icons/mobs/<type>.webp, the mob standing, cut from its sprite sheet. Both sit in
// data/icons, the one folder of data/ the app's Vite may read.
//   npm run mobs                              names.json only, from the atlas (after the bots saw new mobs)
//   npm run mobs -- --adb=192.168.2.3:5555    also the icons: copies offline-a2/10xxxx.dat and .fx off a rooted phone
//   npm run mobs -- --from=<dir>              also the icons, from a folder holding those files
// --atlas=data/maps.json, --icons=data/icons/mobs (needs cwebp), --size=44 (the longer side, twice the 22 px box of the
// Tự đánh list).
const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const atlasPath = arg('atlas') ?? 'data/maps.json', icons = arg('icons') ?? 'data/icons/mobs', out = join(icons, 'names.json');
const size = Number(arg('size') ?? 44), serial = arg('adb');
const show = (e: Record<string, unknown>) => console.log(JSON.stringify(e));

const types = mobTypes(JSON.parse(readFileSync(atlasPath, 'utf8')).maps);
const work = mkdtempSync(join(tmpdir(), 'cllt-mobs-'));
try {
  const from = serial ? pull(serial, work) : arg('from');
  mkdirSync(icons, { recursive: true });
  const sheets = from ? exportIcons(from) : readdirSync(icons).filter(f => /^\d+\.webp$/.test(f)).map(f => parseInt(f));
  const lines = Object.entries(types).map(([name, type]) => `  ${JSON.stringify(name)}: ${type}`);
  const source = `the type of every mob name of ${atlasPath} (npm run mobs; docs/app/events/06-map-mobs.md#ảnh-quái); the icon is ${icons}/<type>.webp`;
  writeFileSync(out, `{\n "source": ${JSON.stringify(source)},\n "types": {\n${lines.join(',\n')}\n }\n}\n`);
  const without = Object.keys(types).filter(name => !sheets.includes(types[name]));
  show({ kind: 'summary', event: 'mob_types_written', path: out, names: lines.length, withIcon: lines.length - without.length, without });
} finally { rmSync(work, { recursive: true, force: true }); }

/** Copies offline-a2/10xxxx.dat and .fx (the sheets 100000–101079, types 0–107) to /data/local/tmp with su, then adb
 * pull, as npm run items: `adb exec-out su -c cat` would turn every 0a into 0d 0a. The game itself is not opened. */
function pull(serial: string, dir: string) {
  const tmp = '/data/local/tmp/cllt-mobs', assets = '/data/data/com.lotasoft.colauloanthe/files/dyncache/offline-a2';
  const adb = (...args: string[]) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
  adb('shell', `su -c 'rm -rf ${tmp} && mkdir -p ${tmp} && cp ${assets}/10[01][0-9][0-9][0-9].* ${tmp}/ && chmod -R 755 ${tmp}'`);
  try { adb('pull', tmp, dir); } finally { adb('shell', `su -c 'rm -rf ${tmp}'`); }
  return join(dir, 'cllt-mobs');
}

/** Every sheet with its .fx: the first step of motion 0, cut, made at most `size` px on its longer side, as WebP. */
function exportIcons(from: string) {
  const written: number[] = [];
  let webpBytes = 0;
  for (const f of readdirSync(from).filter(f => /^10[01]\d\d9\.fx$/.test(f)).sort()) {
    const sheet = spriteSheet(readFileSync(join(from, f))), type = (sheet.id - 100000) / 10, dat = join(from, `${sheet.id}.dat`);
    const [part, ...more] = standingParts(sheet);
    if (!part || more.length || !existsSync(dat) || mobSheet(type) !== sheet.id) { show({ kind: 'skip', sheet: sheet.id, parts: more.length + (part ? 1 : 0) }); continue; }
    const png = join(work, `${sheet.id}.png`), webp = join(icons, `${type}.webp`), scale = Math.min(1, size / Math.max(part.w, part.h));
    writeFileSync(png, decodeAsset(readFileSync(dat)));
    execFileSync('cwebp', ['-quiet', '-q', '85', '-alpha_q', '100', '-m', '6', '-crop', ...[part.x, part.y, part.w, part.h].map(String),
      '-resize', String(Math.round(part.w * scale)), String(Math.round(part.h * scale)), png, '-o', webp]);
    webpBytes += readFileSync(webp).length;
    written.push(type);
  }
  show({ kind: 'summary', event: 'mob_icons_written', dir: icons, icons: written.length, webpBytes });
  return written;
}
