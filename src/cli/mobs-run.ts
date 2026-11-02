import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { battlesIn, battlesInDb, mobIdOf } from '../battle/battle-data.ts';
import { mobBlock } from '../battle/battle.ts';
import { loadAtlas, recordSprite, saveAtlas } from '../bot/atlas.ts';
import { decodeAsset } from '../protocol/items.ts';
import { mobPictures, mobSheet, spriteSheet, standingParts } from '../protocol/sprite.ts';

// The mob icons of the app (docs/app/events/06-map-mobs.md#ảnh-quái): data/icons/mobs/names.json, the picture of every
// mob name of data/maps.json (mobPictures: the sheet s2c/22 named, else the sheet of the mob's type), and
// data/icons/mobs/<n>.webp, the mob standing, cut from sheet 100000 + 10 n. Both sit in data/icons, the one folder of
// data/ the app's Vite may read.
//   npm run mobs                              names.json only, from the atlas (after the bots saw new mobs)
//   npm run mobs -- --battles                 first stores in the atlas the sheet of every mob of the recorded battles
//                                             (captures/battles and app/cllt.db; --battles=<folder or cllt.db>,… others)
//   npm run mobs -- --adb=192.168.2.3:5555    also the icons: copies offline-a2/10xxxx.dat and .fx off a rooted phone
//   npm run mobs -- --from=<dir>              also the icons, from a folder holding those files
// --atlas=data/maps.json, --icons=data/icons/mobs (needs cwebp), --size=44 (the longer side, twice the 22 px box of the
// Tự đánh list).
const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (name: string) => process.argv.some(a => a === `--${name}` || a.startsWith(`--${name}=`));
const atlasPath = arg('atlas') ?? 'data/maps.json', icons = arg('icons') ?? 'data/icons/mobs', out = join(icons, 'names.json');
const size = Number(arg('size') ?? 44), serial = arg('adb');
const show = (e: Record<string, unknown>) => console.log(JSON.stringify(e));

if (has('battles')) await storeSprites(arg('battles')?.split(',') ?? ['captures/battles', 'app/cllt.db']);
const pictures = mobPictures(JSON.parse(readFileSync(atlasPath, 'utf8')).maps);
const work = mkdtempSync(join(tmpdir(), 'cllt-mobs-'));
try {
  const from = serial ? pull(serial, work) : arg('from');
  mkdirSync(icons, { recursive: true });
  const sheets = from ? exportIcons(from) : readdirSync(icons).filter(f => /^\d+\.webp$/.test(f)).map(f => parseInt(f));
  const lines = Object.entries(pictures).map(([name, n]) => `  ${JSON.stringify(name)}: ${n}`);
  const source = `the picture of every mob name of ${atlasPath} (npm run mobs; docs/app/events/06-map-mobs.md#ảnh-quái): ${icons}/<n>.webp, cut from the sheet 100000 + 10 n`;
  writeFileSync(out, `{\n "source": ${JSON.stringify(source)},\n "icons": {\n${lines.join(',\n')}\n }\n}\n`);
  const without = Object.keys(pictures).filter(name => !sheets.includes(pictures[name]));
  show({ kind: 'summary', event: 'mob_pictures_written', path: out, names: lines.length, withIcon: lines.length - without.length, without });
} finally { rmSync(work, { recursive: true, force: true }); }

/** The sheet of every mob of the recorded battles (the block of its s2c/22, mobBlock) into the atlas: a battle file
 * folder or a cllt.db each. */
async function storeSprites(sources: string[]) {
  const atlas = loadAtlas(atlasPath), sheets = new Map<string, Set<number>>();
  for (const source of sources.filter(s => existsSync(s))) {
    const battles = statSync(source).isDirectory() ? battlesIn(source) : await battlesInDb(source);
    for (const b of battles) {
      const setup = b.packets.find(p => p.op === 's2c/22')?.payload, id = setup && (b.header.mob?.id ?? mobIdOf(setup));
      const mob = setup && id ? mobBlock(setup, id) : undefined;
      if (mob) (sheets.get(mob.name) ?? sheets.set(mob.name, new Set()).get(mob.name)!).add(mob.sprite);
    }
  }
  // A name with two sheets would be a mistake of the reading: none is stored for it.
  const twice = [...sheets].filter(([, s]) => s.size > 1).map(([name, s]) => `${name}: ${[...s].join(', ')}`);
  const stored = [...sheets].filter(([name, s]) => s.size === 1 && recordSprite(atlas, name, [...s][0])).map(([name]) => name);
  if (stored.length) saveAtlas(atlasPath, atlas);
  show({ kind: 'summary', event: 'mob_sprites_stored', path: atlasPath, names: sheets.size, stored, twice });
}

/** Copies offline-a2/10xxxx.dat and .fx (the sheets 100000–101079, n 0–107) to /data/local/tmp with su, then adb
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
