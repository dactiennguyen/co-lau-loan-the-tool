// The hello of POST /api/devices/hello: what the app on a device sends as it opens and every 15 minutes.
import { DEFAULT_SERVER_ID, MAX_HELLO_ACCOUNTS, MAX_HOSTNAME, MAX_OS, MAX_USERNAME, MAX_VERSION } from '../config/constants.ts';
import type { Hello } from '../models/index.ts';

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
