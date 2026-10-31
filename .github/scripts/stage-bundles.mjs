// Copies what `tauri build --target <triple>` left in app/target/<triple>/release/bundle into one folder, named
// <productName>_<version>_<os>_<arch><ext> for every platform (Tauri's own names mix x64, amd64, x86_64 and
// en-US). Used by .github/workflows/build-matrix.yml; fails when a bundle is missing. A build with the signing key also
// left the updater files: each bundle's .sig, and on macOS the .app.tar.gz with its .sig; they go along under the same
// names (latest-json.mjs reads them).
//   node .github/scripts/stage-bundles.mjs <target triple> <out dir>
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [target, out] = process.argv.slice(2);
if (!target || !out) {
  console.error('usage: node .github/scripts/stage-bundles.mjs <target triple> <out dir>');
  process.exit(2);
}

const PLATFORMS = {
  'aarch64-apple-darwin': 'macos_aarch64',
  'x86_64-apple-darwin': 'macos_x64',
  'x86_64-pc-windows-msvc': 'windows_x64',
  'x86_64-unknown-linux-gnu': 'linux_x64',
};
/** Per OS: [folder of bundle/, file name suffix, asset name suffix], one file each. */
const BUNDLES = {
  macos: [['dmg', '.dmg', '.dmg'], ['macos', '.app', '.app.zip']],
  windows: [['nsis', '-setup.exe', '-setup.exe'], ['msi', '.msi', '.msi']],
  linux: [['deb', '.deb', '.deb'], ['rpm', '.rpm', '.rpm'], ['appimage', '.AppImage', '.AppImage']],
};

const platform = PLATFORMS[target];
if (!platform) throw new Error(`unknown target ${target}; known: ${Object.keys(PLATFORMS).join(', ')}`);
const os = platform.split('_')[0];

const root = fileURLToPath(new URL('../..', import.meta.url));
const config = JSON.parse(readFileSync(join(root, 'app/desktop/src-tauri/tauri.conf.json'), 'utf8'));
const release = join(root, 'app/target', target, 'release');
const base = `${config.productName}_${config.version}_${platform}`;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const staged = [];
for (const [dir, suffix, assetSuffix] of BUNDLES[os]) {
  const folder = join(release, 'bundle', dir);
  const found = existsSync(folder) ? readdirSync(folder).filter(f => f.endsWith(suffix)) : [];
  if (found.length !== 1) throw new Error(`expected one *${suffix} in ${folder}, found: ${found.join(', ') || 'none'}`);
  const dest = join(out, base + assetSuffix);
  // A .app is a folder: ditto keeps its symlinks and signature in the zip.
  if (suffix === '.app') execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', join(folder, found[0]), dest]);
  else copyFileSync(join(folder, found[0]), dest);
  staged.push(dest);
  // The updater installs the .app from its .tar.gz, and every other bundle as it is.
  const signed = suffix === '.app' ? [`${found[0]}.tar.gz`, `${base}.app.tar.gz`] : [found[0], base + assetSuffix];
  if (existsSync(join(folder, `${signed[0]}.sig`))) {
    if (suffix === '.app') {
      copyFileSync(join(folder, signed[0]), join(out, signed[1]));
      staged.push(join(out, signed[1]));
    }
    copyFileSync(join(folder, `${signed[0]}.sig`), join(out, `${signed[1]}.sig`));
    staged.push(join(out, `${signed[1]}.sig`));
  }
}
// Windows: the executable alone also runs without installing (WebView2 ships with Windows 10/11).
if (os === 'windows') {
  const dest = join(out, `${base}_portable.exe`);
  copyFileSync(join(release, `${config.mainBinaryName}.exe`), dest);
  staged.push(dest);
}

for (const file of staged) console.log(`${(statSync(file).size / 1048576).toFixed(1).padStart(7)} MB  ${file}`);
