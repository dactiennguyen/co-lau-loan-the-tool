import { readFileSync } from 'node:fs';
import { envConnection } from './env.ts';

/** The login of one account of app/accounts.json, the Rust app's account list (local only, app/.gitignore), by its
 * username. The password is for the connection only: callers never log it. */
export function accountLogin(username: string, path = 'app/accounts.json') {
  const file = JSON.parse(readFileSync(path, 'utf8'));
  const list: { username?: string; password?: string; serverId?: number }[] = Array.isArray(file) ? file : file.accounts ?? [];
  const account = list.find(a => String(a.username).toLowerCase() === username.toLowerCase());
  if (!account?.username || account.password === undefined) throw new Error(`no account "${username}" in ${path}`);
  return { username: account.username, password: account.password, ...(account.serverId !== undefined && { serverId: account.serverId }) };
}

/** The connection of the CLIs: envConnection(), with the account of --account=<username> from app/accounts.json when
 * one is given. */
export function connectionFor(account?: string) {
  const connection = envConnection();
  return account ? { ...connection, ...accountLogin(account) } : connection;
}
