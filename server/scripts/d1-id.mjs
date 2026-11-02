// The D1 database of wrangler.toml on Cloudflare: found by its database_name, made when the account has none, and its
// id written into database_id of wrangler.toml. The deploy workflow (.github/workflows/server-deploy.yml) runs it before
// the migrations, on the runner's copy only; by hand it is `yarn d1:id` after `yarn wrangler login`.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TOML = fileURLToPath(new URL('../wrangler.toml', import.meta.url));

/** database_name of the first [[d1_databases]] of wrangler.toml. */
export function databaseName(toml) {
  const m = /^\s*database_name\s*=\s*"([^"]+)"/m.exec(toml);
  if (!m) throw new Error('wrangler.toml không có database_name');
  return m[1];
}

/** The databases of `wrangler d1 list --json`, whatever wrangler prints around the JSON: it starts on a line of its own
 * ("▲ [WARNING] …" lines have a bracket too). */
export function databases(output) {
  const start = output.search(/^\s*\[/m);
  const end = output.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error(`wrangler d1 list --json không trả JSON:\n${output}`);
  return JSON.parse(output.slice(start, end + 1));
}

/** The id of the database named `name` in that list (the Cloudflare API calls it uuid), or null. */
export function idOf(list, name) {
  const db = list.find((d) => d.name === name);
  return db ? (db.uuid ?? db.database_id ?? db.id ?? null) : null;
}

/** wrangler.toml with database_id set to `id`. */
export function withId(toml, id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error(`database_id lạ: ${id}`);
  if (!/^\s*database_id\s*=\s*"[^"]*"/m.test(toml)) throw new Error('wrangler.toml không có database_id');
  return toml.replace(/^(\s*database_id\s*=\s*)"[^"]*"/m, `$1"${id}"`);
}

// The installed wrangler run by this node, not through npx: npx is npx.cmd on Windows, which execFileSync cannot start.
const WRANGLER = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const wrangler = (...args) =>
  execFileSync(process.execPath, [WRANGLER, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const toml = readFileSync(TOML, 'utf8');
  const name = databaseName(toml);
  let id = idOf(databases(wrangler('d1', 'list', '--json')), name);
  if (!id) {
    console.log(`Chưa có D1 "${name}": tạo mới`);
    wrangler('d1', 'create', name);
    id = idOf(databases(wrangler('d1', 'list', '--json')), name);
    if (!id) throw new Error(`Đã tạo D1 "${name}" nhưng không thấy trong wrangler d1 list`);
  }
  writeFileSync(TOML, withId(toml, id));
  console.log(`D1 "${name}": ${id}`);
}
