// The icon of the dev app (Co Lau Tool DEV, src-tauri/tauri.dev.conf.json): app-icon.png with a red DEV label at its
// bottom, saved as app-icon-dev.png, then the icons Tauri needs in src-tauri/icons-dev. Run it again after a new
// app-icon.png (npm run tauri icon app-icon.png makes the icons of the app itself): npm run icon:dev.
// Needs ImageMagick 7 (magick) and a heavy font: Arial Black of macOS, or FONT=/path/to/font.ttf.
import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const at = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const font = process.env.FONT ?? '/System/Library/Fonts/Supplemental/Arial Black.ttf';
const source = at('app-icon.png'), dev = at('app-icon-dev.png'), out = at('src-tauri/icons-dev');

// 1024 × 1024; the label 560 × 200 over the bottom edge of the square, its words in the cream of the icon.
execFileSync('magick', [
  source, '-resize', '1024x1024',
  '(', '-size', '560x200', 'xc:none', '-fill', '#C8402A', '-stroke', '#2A1410', '-strokewidth', '14',
  '-draw', 'roundrectangle 7,7 553,193 40,40', ')', '-gravity', 'south', '-geometry', '+0+70', '-composite',
  '-font', font, '-pointsize', '150', '-fill', '#FFF6E6', '-stroke', 'none', '-gravity', 'south', '-annotate', '+0+92', 'DEV',
  dev,
], { stdio: 'inherit' });
execFileSync('npx', ['tauri', 'icon', dev, '-o', out], { stdio: 'inherit', cwd: at('.') });
// Only what tauri.dev.conf.json names: the dev app is never bundled for a store or a phone.
const keep = new Set(['32x32.png', '128x128.png', '128x128@2x.png', 'icon.icns', 'icon.ico', 'icon.png']);
for (const f of readdirSync(out)) if (!keep.has(f)) rmSync(`${out}/${f}`, { recursive: true, force: true });
console.log(`icons of Co Lau Tool DEV in ${out}`);
