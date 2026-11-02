// `npm run tauri …`: the Tauri CLI, with src-tauri/tauri.dev.conf.json over tauri.conf.json for `dev`, so the dev app is
// Co Lau Tool DEV (its own identifier, name and icon with DEV) and runs beside the installed Co Lau Tool without looking like
// it. Every other command (build, icon, signer…) goes to the CLI as it is.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
// First, so that a --config given here is merged after it and wins (the CLI merges them in order).
if (args[0] === 'dev') args.splice(1, 0, '--config', fileURLToPath(new URL('../src-tauri/tauri.dev.conf.json', import.meta.url)));
// The CLI's own script under this node, without a shell: a shell (needed for tauri.cmd on Windows) would split a path
// with spaces.
const cli = createRequire(import.meta.url).resolve('@tauri-apps/cli/tauri.js');
const run = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit' });
process.exit(run.status ?? 1);
