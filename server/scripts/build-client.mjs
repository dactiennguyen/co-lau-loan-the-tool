// Bundles the script of the admin page (client/admin.ts, with the Material Web components it uses) into
// public/assets/admin.js, which Cloudflare serves as a static asset (wrangler.toml [assets]). Wrangler runs it before
// `wrangler dev` and `wrangler deploy` ([build] of wrangler.toml); `yarn build:client` runs it alone.
import { build } from 'esbuild';

const out = await build({
  entryPoints: [new URL('../client/admin.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')],
  outfile: new URL('../public/assets/admin.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2022',
  legalComments: 'linked',
  metafile: true,
});
const bytes = Object.values(out.metafile.outputs).find((o) => o.entryPoint)?.bytes ?? 0;
console.log(`public/assets/admin.js: ${(bytes / 1024).toFixed(0)} KB`);
