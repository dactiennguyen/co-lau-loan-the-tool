// Bundles the script of the admin page (client/admin.ts) into public/assets/admin.js and copies the fonts it is drawn
// with (Inter, Latin and Vietnamese; JetBrains Mono, Latin) into public/assets/fonts/, which Cloudflare serves as static
// assets (wrangler.toml [assets]). Wrangler runs it before `wrangler dev` and `wrangler deploy` ([build] of
// wrangler.toml); `yarn build:client` runs it alone.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const path = (rel) => new URL(rel, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const out = await build({
  entryPoints: [path('../client/admin.ts')],
  outfile: path('../public/assets/admin.js'),
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2022',
  legalComments: 'linked',
  metafile: true,
});
const bytes = Object.values(out.metafile.outputs).find((o) => o.entryPoint)?.bytes ?? 0;
console.log(`public/assets/admin.js: ${(bytes / 1024).toFixed(1)} KB`);

// The fonts of views/styles.ts (@font-face), served from this origin: the Content-Security-Policy takes fonts of 'self'.
const require = createRequire(import.meta.url);
const FONTS = [
  '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  '@fontsource-variable/inter/files/inter-vietnamese-wght-normal.woff2',
  '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
];
mkdirSync(path('../public/assets/fonts/'), { recursive: true });
for (const font of FONTS) copyFileSync(require.resolve(font), path(`../public/assets/fonts/${font.split('/').pop()}`));
console.log(`public/assets/fonts: ${FONTS.length} fonts`);
