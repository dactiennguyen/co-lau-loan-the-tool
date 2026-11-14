// The version of the desktop app, in the seven places that carry it: app/Cargo.toml ([workspace.package]), the two
// crates of app/Cargo.lock, app/desktop/package.json, the two of app/desktop/package-lock.json and tauri.conf.json.
//   node .github/scripts/bump-version.mjs 1.1.11          sets them all (then commit "Release 1.1.11" and tag v1.1.11)
//   node .github/scripts/bump-version.mjs --check 1.1.11  fails unless they all are 1.1.11 (release.yml, on the tag)
//   node .github/scripts/bump-version.mjs                 prints them
// Only the version strings change, so the files keep their layout and nothing has to be installed or resolved again.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const CRATES = ['cllt-core', 'cllt-desktop'];

/** Each place: its file, how to read the version there, and how to set it (on the text, layout kept). */
const PLACES = [
  {
    name: 'app/Cargo.toml [workspace.package]',
    file: 'app/Cargo.toml',
    read: text => /^\[workspace\.package\]\n(?:.*\n)*?version = "([^"]+)"/m.exec(text)?.[1],
    write: (text, v) => text.replace(/^(\[workspace\.package\]\n(?:.*\n)*?version = ")[^"]+(")/m, `$1${v}$2`),
  },
  ...CRATES.map(crate => ({
    name: `app/Cargo.lock ${crate}`,
    file: 'app/Cargo.lock',
    read: text => new RegExp(`^name = "${crate}"\\nversion = "([^"]+)"`, 'm').exec(text)?.[1],
    write: (text, v) => text.replace(new RegExp(`^(name = "${crate}"\\nversion = ")[^"]+(")`, 'm'), `$1${v}$2`),
  })),
  {
    name: 'app/desktop/package.json',
    file: 'app/desktop/package.json',
    read: text => JSON.parse(text).version,
    write: (text, v) => text.replace(/^(  "version": ")[^"]+(")/m, `$1${v}$2`),
  },
  {
    name: 'app/desktop/package-lock.json',
    file: 'app/desktop/package-lock.json',
    read: text => JSON.parse(text).version,
    write: (text, v) => text.replace(/^(  "version": ")[^"]+(")/m, `$1${v}$2`),
  },
  {
    name: 'app/desktop/package-lock.json packages[""]',
    file: 'app/desktop/package-lock.json',
    read: text => JSON.parse(text).packages?.['']?.version,
    write: (text, v) => text.replace(/^(    "": \{\n(?: {6}.*\n)*? {6}"version": ")[^"]+(")/m, `$1${v}$2`),
  },
  {
    name: 'app/desktop/src-tauri/tauri.conf.json',
    file: 'app/desktop/src-tauri/tauri.conf.json',
    read: text => JSON.parse(text).version,
    write: (text, v) => text.replace(/^(  "version": ")[^"]+(")/m, `$1${v}$2`),
  },
];

/** The version of each place, undefined where it cannot be read. */
export function versions(read = file => readFileSync(join(root, file), 'utf8')) {
  return PLACES.map(p => [p.name, p.read(read(p.file))]);
}

/** The files with every place set to `version`; throws when a place did not take it. */
export function bumped(version, read = file => readFileSync(join(root, file), 'utf8')) {
  const texts = new Map();
  for (const p of PLACES) {
    const before = texts.get(p.file) ?? read(p.file);
    const after = p.write(before, version);
    if (p.read(after) !== version) throw new Error(`could not set the version in ${p.name}`);
    texts.set(p.file, after);
  }
  return texts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const check = args[0] === '--check';
  const version = check ? args[1] : args[0];
  if ((check && !version) || (version && !/^\d+\.\d+\.\d+$/.test(version))) {
    console.error('usage: node .github/scripts/bump-version.mjs [--check] <x.y.z>');
    process.exit(2);
  }
  if (version && !check) {
    for (const [file, text] of bumped(version)) writeFileSync(join(root, file), text);
  }
  const found = versions();
  for (const [name, v] of found) console.log(`${String(v).padEnd(10)} ${name}`);
  const wrong = found.filter(([, v]) => version && v !== version);
  if (wrong.length) {
    console.error(`::error::not ${version}: ${wrong.map(([name]) => name).join(', ')}`);
    process.exit(1);
  }
}
