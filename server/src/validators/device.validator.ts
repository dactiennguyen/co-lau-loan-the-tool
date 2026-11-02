// The hello of POST /api/devices/hello, what the app on a device sends as it opens and every 15 minutes, and the sync of
// POST /api/devices/sync that follows an allowed hello.
import {
  DEFAULT_SERVER_ID,
  MAX_HELLO_ACCOUNTS,
  MAX_HOSTNAME,
  MAX_OS,
  MAX_SETTINGS,
  MAX_SYNC_ACCOUNTS,
  MAX_USERNAME,
  MAX_VERSION,
} from '../config/constants.ts';
import type { Changed, DeviceSync, Hello } from '../models/index.ts';
import { accountsOf, isObject } from './account.validator.ts';

export const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

export const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** A hello read from its JSON, or the reason it is refused. Long texts are cut, not refused. */
export function parseHello(body: string): Hello | { error: string } {
  let v: unknown;
  try {
    v = JSON.parse(body);
  } catch {
    return { error: 'JSON không đọc được' };
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: 'Cần một object JSON' };
  const o = v as Record<string, unknown>;
  if (!isId(o.id)) return { error: 'id phải là 64 ký tự hex (SHA-256)' };
  const list = Array.isArray(o.accounts) ? o.accounts.slice(0, MAX_HELLO_ACCOUNTS) : [];
  const accounts = list.flatMap((a) => {
    if (!a || typeof a !== 'object') return [];
    const r = a as Record<string, unknown>;
    const username = text(r.username, MAX_USERNAME);
    const serverId = Number.isInteger(r.serverId) ? (r.serverId as number) : DEFAULT_SERVER_ID;
    return username ? [{ username, serverId }] : [];
  });
  return { id: o.id, hostname: text(o.hostname, MAX_HOSTNAME), os: text(o.os, MAX_OS), version: text(o.version, MAX_VERSION), accounts };
}

/** A sync read from its JSON, or the reason it is refused: {"id", "settings"?, "accounts": [{"account", "changed"}]}.
 * Each account is checked as POST /api/accounts checks it; a time that is not a number is left out (read as 0). */
export function parseSync(body: string): DeviceSync | { error: string } {
  let v: unknown;
  try {
    v = JSON.parse(body);
  } catch {
    return { error: 'JSON không đọc được' };
  }
  if (!isObject(v)) return { error: 'Cần một object JSON' };
  if (!isId(v.id)) return { error: 'id phải là 64 ký tự hex (SHA-256)' };
  if (!Array.isArray(v.accounts)) return { error: '"accounts" phải là một danh sách' };
  if (v.accounts.length > MAX_SYNC_ACCOUNTS) return { error: `Tối đa ${MAX_SYNC_ACCOUNTS} nick một lần` };
  const items = v.accounts.map((a) => (isObject(a) ? a : {}));
  const accounts = accountsOf(items.map((a) => a.account));
  if (!Array.isArray(accounts)) return accounts;
  const stamps = items.map((a) =>
    isObject(a.changed) ? Object.fromEntries(Object.entries(a.changed).filter(([, t]) => typeof t === 'number' && Number.isFinite(t))) : {},
  ) as Changed[];
  const settings = isObject(v.settings) ? JSON.stringify(v.settings) : null;
  return {
    id: v.id,
    settings: settings && settings.length <= MAX_SETTINGS ? settings : null,
    accounts: accounts.map((account, i) => ({ account, changed: stamps[i] })),
  };
}
